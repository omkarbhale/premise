import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { AgentToolServer } from "../agents/tool-server.js";
import { describeCheck } from "../config/checks.js";
import { CONFIG_FILE_NAME, envNameFor } from "../config/load.js";
import { type PremiseConfig, SETTINGS } from "../config/settings.js";
import type { DoctorReport } from "../doctor/doctor.js";
import type { AskAnswer, Overview, SettingsView } from "../shared/api-types.js";
import {
  SIZE_CLASSES,
  SOFTWARE_EFFORTS,
  STAGE_IDS,
  type SizeClass,
  type SoftwareEffort,
  type StageId,
} from "../shared/stages.js";
import type { Learning } from "../learning/learning.js";
import { registerLearningRoutes } from "../learning/routes.js";
import type { Measures } from "../measures/measures.js";
import { registerMeasureRoutes } from "../measures/routes.js";
import type { Usage } from "../usage/usage.js";
import { registerUsageRoutes } from "../usage/routes.js";
import { registerRecordRoutes } from "../record/routes.js";
import type { RecordKeeper } from "../record/record-keeper.js";
import { type Database, recordEvent } from "../storage/database.js";
import type { UsageLedger } from "../usage-ledger/usage-ledger.js";
import { VERSION } from "../version.js";
import { EventHub } from "./events.js";
import { registerFeedbackRoutes } from "../intake/feedback-routes.js";
import {
  type FeedbackService,
  ServiceError,
  type ServiceErrorCode,
  type SessionServices,
} from "./services.js";
import { isValidSessionToken } from "./session-token.js";
import type { AgentsStatus } from "./wiring.js";

export const TOKEN_HEADER = "x-premise-token";

export interface AppDeps {
  config: PremiseConfig;
  db: Database;
  schemaVersion: number;
  services: SessionServices;
  /** Whether agents can work; real agents are assumed ready when not given. */
  agents?: AgentsStatus;
  ledger: UsageLedger;
  /** Reads a software's lasting record for the page. */
  record?: RecordKeeper;
  setup: DoctorReport;
  /** premise's tools for agents, served at /mcp; each call carries its session's own token. */
  tools?: AgentToolServer;
  /** The built page; when it is missing, a short note says how to build it. */
  webRoot: string;
  /** The live event stream; one is made when not given. */
  events?: EventHub;
  /** premise's own return (src/measures); its routes are left out when not given. */
  measures?: Measures;
  /** Learning from corrections (src/learning); its routes are left out when not given. */
  learning?: Learning;
  /** Cost and budgets (src/usage); its routes are left out when not given. */
  usage?: Usage;
  /** The feedback page (src/intake); left out when not given. */
  feedback?: FeedbackService;
}

const NOT_BUILT_PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><title>premise</title>
<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; line-height: 1.5">
<h1>premise is running, but its page is not built yet</h1>
<p>Stop premise, run <code>npm run build</code>, then <code>npm start</code> again and open the link it prints.</p>
</body></html>`;

const STATUS_FOR: Record<ServiceErrorCode, number> = {
  NOT_FOUND: 404,
  ASK_CLOSED: 409,
  INVALID: 422,
  NAME_TAKEN: 409,
};

/** The page never needs anything from another site; these headers say so to the browser. */
const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
};

function valueAt(config: PremiseConfig, key: string): unknown {
  let node: unknown = config;
  for (const part of key.split(".")) {
    node =
      node !== null && typeof node === "object"
        ? (node as Record<string, unknown>)[part]
        : undefined;
  }
  return node;
}

export function settingsView(config: PremiseConfig): SettingsView {
  return {
    configFile: join(config.data.folder, CONFIG_FILE_NAME),
    dataFolder: config.data.folder,
    settings: SETTINGS.map((s) => {
      const value = valueAt(config, s.key);
      return {
        key: s.key,
        value: value === undefined ? null : value,
        default: s.default,
        changed: JSON.stringify(value) !== JSON.stringify(s.default),
        meaning: s.meaning,
        allowed: describeCheck(s.check),
        envName: envNameFor(s.key),
      };
    }),
  };
}

const idParam = {
  type: "object",
  properties: { id: { type: "string", minLength: 1, maxLength: 100 } },
  required: ["id"],
} as const;

const numberIdParam = {
  type: "object",
  properties: { id: { type: "integer", minimum: 1 } },
  required: ["id"],
} as const;

/** The page server: the session check, the API, the event stream and the page. */
export async function createApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });
  const events = deps.events ?? new EventHub(deps.db);
  const { services } = deps;
  const agents: AgentsStatus = deps.agents ?? {
    ready: () => true,
    unavailable: () => null,
    scriptedDemo: () => false,
    useScriptedDemo: () => {},
  };

  const port = (): number => {
    const address = app.server.address() as AddressInfo | null;
    return address && typeof address === "object" ? address.port : deps.config.server.port;
  };
  const allowedHost = (value: string): boolean => {
    const p = port();
    return [`localhost:${p}`, `127.0.0.1:${p}`, `[::1]:${p}`].includes(value);
  };

  // Host and Origin checks (decision 0078) cover every route; the session token covers the API.
  app.addHook("onRequest", async (request, reply) => {
    const host = request.headers.host ?? "";
    if (!allowedHost(host)) {
      recordEvent(deps.db, { module: "page-server", kind: "refused-host", detail: { host } });
      return reply.code(403).send({ error: "premise answers only on this machine's own address." });
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !allowedHost(origin.replace(/^https?:\/\//, ""))) {
      recordEvent(deps.db, { module: "page-server", kind: "refused-origin", detail: { origin } });
      return reply.code(403).send({ error: "premise does not answer requests from other sites." });
    }
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
    return payload;
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ServiceError) {
      return reply.code(STATUS_FOR[error.code]).send({ error: error.message, code: error.code });
    }
    if (error.validation) {
      return reply.code(422).send({
        error: `premise did not understand that request (${error.message}). Reload the page and try again.`,
        code: "INVALID",
      });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        error: `premise could not take that request (${error.message}). Reload the page and try again.`,
      });
    }
    recordEvent(deps.db, {
      module: "page-server",
      kind: "request-failed",
      detail: { path: request.url.split("?")[0] ?? "", message: error.message },
    });
    return reply.code(500).send({
      error: `Something went wrong inside premise: ${error.message}. Try again; if it keeps happening, restart premise from its terminal.`,
    });
  });

  app.get("/api/health", async () => ({ ok: true, name: "premise", version: VERSION }));

  // Agents' tools (docs/specs/agent-tools.md). Not under /api: the page's link token does not
  // open it, and a session token opens nothing else.
  const tools = deps.tools;
  if (tools) {
    app.post("/mcp", async (request, reply) => {
      const answer = tools.handleHttp(request.headers.authorization, request.body);
      reply.code(answer.status);
      return answer.body === undefined ? reply.send() : reply.send(answer.body);
    });
    app.get("/mcp", async (_request, reply) =>
      reply
        .code(405)
        .header("allow", "POST")
        .send({ error: "premise's agent tools take POST only." }),
    );
  }

  // The feedback page: its own link, no session token, and nothing else behind it (decision 0119).
  if (deps.feedback) registerFeedbackRoutes(app, deps.feedback);

  await app.register(async (api) => {
    api.addHook("onRequest", async (request, reply) => {
      const path = request.url.split("?")[0] ?? "";
      const header = request.headers[TOKEN_HEADER];
      // A browser's EventSource cannot send headers, so the event stream takes the token in the URL.
      const fromQuery =
        path === "/api/events" ? (request.query as Record<string, unknown>).token : undefined;
      const token =
        typeof header === "string" ? header : typeof fromQuery === "string" ? fromQuery : undefined;
      if (!isValidSessionToken(deps.db, token)) {
        recordEvent(deps.db, { module: "page-server", kind: "refused-token", detail: { path } });
        return reply.code(401).send({
          error:
            "This link is not current. Open the newest link premise printed, or run `npm run new-link` to get one.",
          code: "NOT_CURRENT",
        });
      }
    });

    if (deps.record) registerRecordRoutes(api, deps.record);
    if (deps.measures) registerMeasureRoutes(api, deps.measures);
    if (deps.learning) registerLearningRoutes(api, deps.learning);
    if (deps.usage) registerUsageRoutes(api, deps.usage, deps.db);

    api.get("/api/overview", async (): Promise<Overview> => {
      const [softwares, archived, activity, weekly] = await Promise.all([
        services.softwares.list(),
        services.softwares.list({ archived: true }),
        services.activity.view(),
        deps.ledger.weeklyUsage(),
      ]);
      return {
        version: VERSION,
        dataFolder: deps.config.data.folder,
        agents: {
          mode: agents.scriptedDemo() ? "scripted" : deps.config.agents.mode,
          ready: agents.ready(),
          unavailable: agents.unavailable(),
          scriptedDemo: agents.scriptedDemo(),
        },
        line: { mode: "engine", standInStages: [] },
        page: {
          notifications: deps.config.page.notifications,
          presenceSeconds: deps.config.measures.presence_seconds,
        },
        usage: { mode: deps.ledger.mode, mocked: deps.ledger.mocked, weekly },
        softwares,
        roles: services.roles(),
        archivedSoftwares: archived.length,
        softwareUsage: await Promise.all(
          softwares.map(async (s) => {
            const u = await deps.ledger.softwareUsage(s.id);
            return {
              softwareId: s.id,
              mocked: u.mocked,
              sessions: u.sessions,
              inputTokens: u.inputTokens,
              outputTokens: u.outputTokens,
              costUsd: u.costUsd,
              weeklyShare: u.weeklyShare,
            };
          }),
        ),
        openAsks: softwares.reduce((n, s) => n + s.openAsks, 0),
        activity: {
          running: activity.running.length,
          queued: activity.queued.length,
          waiting: activity.waiting.length,
          max: activity.maxAgentSessions,
          paused: activity.paused,
        },
        setup: deps.setup.checks,
      };
    });

    api.get("/api/softwares", async (request) =>
      services.softwares.list({
        archived: (request.query as { archived?: string }).archived === "1",
      }),
    );

    // Looking after several softwares at once (decision 0197).
    for (const action of ["pause", "resume", "archive", "restore"] as const) {
      api.post<{ Params: { id: string } }>(
        `/api/softwares/:id/${action}`,
        { schema: { params: idParam } },
        async (request) => {
          await services.softwares[action](request.params.id);
          return services.softwares.get(request.params.id);
        },
      );
    }

    api.get("/api/summary", async () => services.summary.view());
    api.post<{ Body: { upTo: number } }>(
      "/api/summary/seen",
      {
        schema: {
          body: {
            type: "object",
            properties: { upTo: { type: "integer", minimum: 0 } },
            required: ["upTo"],
          },
        },
      },
      async (request) => {
        await services.summary.markSeen(request.body.upTo);
        return { ok: true };
      },
    );

    api.post<{ Body: { idea: string; name?: string; effort?: SoftwareEffort } }>(
      "/api/softwares",
      {
        schema: {
          body: {
            type: "object",
            properties: {
              idea: { type: "string", maxLength: 20000 },
              name: { type: "string", maxLength: 200 },
              effort: { type: "string", enum: [...SOFTWARE_EFFORTS] },
            },
            required: ["idea"],
          },
        },
      },
      async (request, reply) => {
        const { idea, name, effort } = request.body;
        const started = await services.softwares.start({
          idea,
          ...(name && { name }),
          ...(effort && { effort }),
        });
        return reply.code(201).send(started);
      },
    );

    api.post<{ Body: { source: string; name?: string; idea?: string } }>(
      "/api/softwares/existing",
      {
        schema: {
          body: {
            type: "object",
            properties: {
              source: { type: "string", maxLength: 2000 },
              name: { type: "string", maxLength: 200 },
              idea: { type: "string", maxLength: 20000 },
            },
            required: ["source"],
          },
        },
      },
      async (request, reply) => {
        const { source, name, idea } = request.body;
        const started = await services.softwares.bringIn({
          source,
          ...(name ? { name } : {}),
          ...(idea ? { idea } : {}),
        });
        return reply.code(201).send(started);
      },
    );

    api.post<{ Params: { id: string } }>(
      "/api/softwares/:id/existing/offer-record",
      { schema: { params: idParam } },
      async (request) => {
        await services.softwares.offerRecord(request.params.id);
        return services.softwares.get(request.params.id);
      },
    );

    api.get<{ Params: { id: string } }>(
      "/api/softwares/:id",
      { schema: { params: idParam } },
      async (request) => services.softwares.get(request.params.id),
    );

    api.get<{ Params: { id: string } }>(
      "/api/softwares/:id/chat",
      { schema: { params: idParam } },
      async (request) => services.conversation.messages(request.params.id),
    );

    api.post<{ Params: { id: string }; Body: { text: string } }>(
      "/api/softwares/:id/chat",
      {
        schema: {
          params: idParam,
          body: {
            type: "object",
            properties: { text: { type: "string", maxLength: 20000 } },
            required: ["text"],
          },
        },
      },
      async (request) => services.conversation.say(request.params.id, request.body.text),
    );

    api.get<{ Params: { id: string } }>(
      "/api/softwares/:id/record",
      { schema: { params: idParam } },
      async (request) => services.records.view(request.params.id),
    );

    api.get<{ Params: { id: string } }>(
      "/api/softwares/:id/intake",
      { schema: { params: idParam } },
      async (request) => services.intake.view(request.params.id),
    );

    api.post<{ Params: { id: string }; Body: { text: string } }>(
      "/api/softwares/:id/intake",
      {
        schema: {
          params: idParam,
          body: {
            type: "object",
            properties: { text: { type: "string", maxLength: 20000 } },
            required: ["text"],
          },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await services.intake.report(request.params.id, request.body.text)),
    );

    api.post<{ Params: { id: string } }>(
      "/api/softwares/:id/intake/read-now",
      { schema: { params: idParam } },
      async (request) => services.intake.readNow(request.params.id),
    );

    api.post<{ Params: { id: string } }>(
      "/api/softwares/:id/intake/new-feedback-link",
      { schema: { params: idParam } },
      async (request) => services.intake.newFeedbackLink(request.params.id),
    );

    api.post<{ Params: { id: string } }>(
      "/api/softwares/:id/intake/read-issues",
      { schema: { params: idParam } },
      async (request) => services.intake.readIssuesNow(request.params.id),
    );

    api.post<{
      Params: { id: number };
      Body: {
        list: "wanted" | "recurring";
        index: number;
        choice: "work" | "keep" | "close";
        reason?: string;
      };
    }>(
      "/api/readings/:id/decide",
      {
        schema: {
          params: numberIdParam,
          body: {
            type: "object",
            properties: {
              list: { type: "string", enum: ["wanted", "recurring"] },
              index: { type: "integer", minimum: 0, maximum: 50 },
              choice: { type: "string", enum: ["work", "keep", "close"] },
              reason: { type: "string", maxLength: 500 },
            },
            required: ["list", "index", "choice"],
          },
        },
      },
      async (request) => services.intake.decideLine(request.params.id, request.body),
    );

    api.post<{ Params: { id: number } }>(
      "/api/readings/:id/back-to-why",
      { schema: { params: numberIdParam } },
      async (request) => services.intake.backToWhy(request.params.id),
    );

    api.post<{ Params: { id: number } }>(
      "/api/intake/:id/undo",
      { schema: { params: numberIdParam } },
      async (request) => services.intake.undo(request.params.id),
    );

    api.get<{ Params: { id: string } }>(
      "/api/softwares/:id/report",
      { schema: { params: idParam } },
      async (request) =>
        services.reports.view(request.params.id, {
          detail: (request.query as { detail?: string }).detail === "1",
        }),
    );

    if (services.runs) {
      const runs = services.runs;
      api.get<{ Params: { id: string } }>(
        "/api/softwares/:id/run",
        { schema: { params: idParam } },
        async (request) => runs.view(request.params.id),
      );
      api.post<{ Params: { id: string } }>(
        "/api/softwares/:id/run/start",
        { schema: { params: idParam } },
        async (request) => runs.start(request.params.id),
      );
      api.post<{ Params: { id: string } }>(
        "/api/softwares/:id/run/stop",
        { schema: { params: idParam } },
        async (request) => runs.stop(request.params.id),
      );
    }

    api.post<{ Params: { id: string }; Body: { stage: StageId } }>(
      "/api/softwares/:id/send-back",
      {
        schema: {
          params: idParam,
          body: {
            type: "object",
            properties: { stage: { type: "string", enum: [...STAGE_IDS] } },
            required: ["stage"],
          },
        },
      },
      async (request) => {
        await services.softwares.sendBack(request.params.id, request.body.stage);
        return services.softwares.get(request.params.id);
      },
    );

    api.post<{ Params: { id: string }; Body: { size: SizeClass } }>(
      "/api/softwares/:id/size",
      {
        schema: {
          params: idParam,
          body: {
            type: "object",
            properties: { size: { type: "string", enum: [...SIZE_CLASSES] } },
            required: ["size"],
          },
        },
      },
      async (request) => {
        await services.softwares.setSize(request.params.id, request.body.size);
        return services.softwares.get(request.params.id);
      },
    );

    api.post<{ Params: { id: string }; Body: { priority: number } }>(
      "/api/softwares/:id/priority",
      {
        schema: {
          params: idParam,
          body: {
            type: "object",
            properties: { priority: { type: "integer", minimum: 1, maximum: 5 } },
            required: ["priority"],
          },
        },
      },
      async (request) => {
        await services.softwares.setPriority(request.params.id, request.body.priority);
        return services.softwares.get(request.params.id);
      },
    );

    api.post<{ Params: { id: string }; Body: { effort: SoftwareEffort } }>(
      "/api/softwares/:id/effort",
      {
        schema: {
          params: idParam,
          body: {
            type: "object",
            properties: { effort: { type: "string", enum: [...SOFTWARE_EFFORTS] } },
            required: ["effort"],
          },
        },
      },
      async (request) => {
        await services.softwares.setEffort(request.params.id, request.body.effort);
        return services.softwares.get(request.params.id);
      },
    );

    api.post<{ Params: { id: string; milestone: string }; Body: { wait: boolean } }>(
      "/api/softwares/:id/milestones/:milestone/wait",
      {
        schema: {
          params: {
            type: "object",
            properties: {
              id: idParam.properties.id,
              milestone: { type: "string", pattern: "^M-[1-9][0-9]*$" },
            },
            required: ["id", "milestone"],
          },
          body: {
            type: "object",
            properties: { wait: { type: "boolean" } },
            required: ["wait"],
          },
        },
      },
      async (request) => {
        await services.softwares.setMilestoneWait(
          request.params.id,
          request.params.milestone,
          request.body.wait,
        );
        return services.softwares.get(request.params.id);
      },
    );

    // A piece of work's sizing, which the operator can change (decision 0184). Each answers with
    // the software the piece belongs to, as the page shows it.
    const workItem = async (itemId: number, change: () => Promise<void>) => {
      const softwareId = await services.workItems.softwareOf(itemId);
      await change();
      return services.softwares.get(softwareId);
    };

    api.post<{ Params: { id: number }; Body: { size: SizeClass } }>(
      "/api/work-items/:id/size",
      {
        schema: {
          params: numberIdParam,
          body: {
            type: "object",
            properties: { size: { type: "string", enum: [...SIZE_CLASSES] } },
            required: ["size"],
          },
        },
      },
      async (request) =>
        workItem(request.params.id, () =>
          services.workItems.setSize(request.params.id, request.body.size),
        ),
    );

    api.post<{ Params: { id: number }; Body: { stages: StageId[] } }>(
      "/api/work-items/:id/stages",
      {
        schema: {
          params: numberIdParam,
          body: {
            type: "object",
            properties: {
              stages: {
                type: "array",
                items: { type: "string", enum: [...STAGE_IDS] },
                maxItems: STAGE_IDS.length,
              },
            },
            required: ["stages"],
          },
        },
      },
      async (request) =>
        workItem(request.params.id, () =>
          services.workItems.setStages(request.params.id, request.body.stages),
        ),
    );

    api.post<{ Params: { id: number } }>(
      "/api/work-items/:id/undo-split",
      { schema: { params: numberIdParam } },
      async (request) =>
        workItem(request.params.id, () => services.workItems.undoSplit(request.params.id)),
    );

    api.post<{ Params: { id: string }; Body: { area: string; role?: string } }>(
      "/api/softwares/:id/claims",
      {
        schema: {
          params: idParam,
          body: {
            type: "object",
            properties: {
              area: { type: "string", maxLength: 1000 },
              role: { type: "string", maxLength: 200 },
            },
            required: ["area"],
          },
        },
      },
      async (request, reply) => {
        const claim = await services.softwares.claim(request.params.id, request.body);
        reply.code(201);
        return claim;
      },
    );

    api.post<{ Params: { id: number } }>(
      "/api/claims/:id/release",
      { schema: { params: numberIdParam } },
      async (request) => services.softwares.releaseClaim(request.params.id),
    );

    api.post<{ Params: { id: number } }>(
      "/api/approvals/:id/withdraw",
      { schema: { params: numberIdParam } },
      async (request) => {
        await services.softwares.withdrawApproval(request.params.id);
        return { ok: true };
      },
    );

    api.get<{ Querystring: { software?: string; status?: "open" | "answered" } }>(
      "/api/asks",
      {
        schema: {
          querystring: {
            type: "object",
            properties: {
              software: { type: "string", maxLength: 100 },
              status: { type: "string", enum: ["open", "answered"] },
            },
          },
        },
      },
      async (request) =>
        services.asks.list({
          ...(request.query.software && { softwareId: request.query.software }),
          ...(request.query.status && { status: request.query.status }),
        }),
    );

    api.post<{ Params: { id: number }; Body: { answer: AskAnswer } }>(
      "/api/asks/:id/answer",
      {
        schema: {
          params: numberIdParam,
          body: {
            type: "object",
            properties: {
              answer: {
                type: "object",
                properties: {
                  kind: {
                    type: "string",
                    enum: ["items", "text", "approval", "needed", "proposal", "scope"],
                  },
                },
                required: ["kind"],
              },
            },
            required: ["answer"],
          },
        },
      },
      async (request) => services.asks.answer(request.params.id, request.body.answer),
    );

    api.post("/api/agents/scripted-demo", async () => {
      if (agents.ready() && !agents.scriptedDemo()) {
        throw new ServiceError(
          "INVALID",
          "Real agents are working, so there is nothing to switch. The scripted look-around is only for when they cannot start.",
        );
      }
      agents.useScriptedDemo();
      recordEvent(deps.db, { module: "page-server", kind: "scripted-demo-chosen" });
      await services.activity.view();
      return { ok: true };
    });

    api.get("/api/activity", async () => services.activity.view());

    api.post<{ Params: { id: number } }>(
      "/api/jobs/:id/stop",
      { schema: { params: numberIdParam } },
      async (request) => {
        await services.activity.stopJob(request.params.id);
        return services.activity.view();
      },
    );

    api.get("/api/settings", async () => settingsView(deps.config));

    api.get("/api/events", async (request, reply) => {
      const header = request.headers["last-event-id"];
      const since = typeof header === "string" && /^\d+$/.test(header) ? Number(header) : null;
      reply.hijack();
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        reply.raw.setHeader(name, value);
      }
      events.attach(reply.raw, since);
    });
  });

  // Open event streams never end by themselves; end them first so closing does not wait on them.
  app.addHook("preClose", async () => events.close());

  if (existsSync(join(deps.webRoot, "index.html"))) {
    await app.register(fastifyStatic, { root: deps.webRoot });
  } else {
    app.get("/", async (_request, reply) => reply.type("text/html").send(NOT_BUILT_PAGE));
  }

  return app;
}
