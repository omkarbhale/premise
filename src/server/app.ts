import { existsSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import type { PremiseConfig } from "../config/settings.js";
import { AGENT_TASK_KINDS } from "../config/settings.js";
import type { DoctorReport } from "../doctor/doctor.js";
import type { WorkQueue } from "../queue/work-queue.js";
import { type Database, recordEvent } from "../storage/database.js";
import { listSoftwares } from "../storage/softwares.js";
import type { UsageLedger } from "../usage-ledger/usage-ledger.js";
import { isValidSessionToken } from "./session-token.js";
import { VERSION } from "../version.js";

export const TOKEN_HEADER = "x-premise-token";

export interface AppDeps {
  config: PremiseConfig;
  db: Database;
  schemaVersion: number;
  queue: WorkQueue;
  ledger: UsageLedger;
  setup: DoctorReport;
  /** The built page; when it is missing, a short note says how to build it. */
  webRoot: string;
}

function allowedHosts(port: number): Set<string> {
  return new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
}

const NOT_BUILT_PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><title>premise</title>
<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; line-height: 1.5">
<h1>premise is running, but its page is not built yet</h1>
<p>Stop premise, run <code>npm run build</code>, then <code>npm start</code> again and open the link it prints.</p>
</body></html>`;

/** The page server: health, the session check, the API, and the page. */
export async function createApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const hosts = allowedHosts(deps.config.server.port);

  // Host and Origin checks (decision 0078), then the session token for the API.
  app.addHook("onRequest", async (request, reply) => {
    const host = request.headers.host ?? "";
    if (!hosts.has(host)) {
      recordEvent(deps.db, { module: "page-server", kind: "refused-host", detail: { host } });
      return reply.code(403).send({ error: "premise answers only on this machine's own address." });
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !hosts.has(origin.replace(/^https?:\/\//, ""))) {
      recordEvent(deps.db, { module: "page-server", kind: "refused-origin", detail: { origin } });
      return reply.code(403).send({ error: "premise does not answer requests from other sites." });
    }
    const path = request.url.split("?")[0] ?? "";
    if (path.startsWith("/api/") && path !== "/api/health") {
      const token = request.headers[TOKEN_HEADER];
      if (!isValidSessionToken(deps.db, typeof token === "string" ? token : undefined)) {
        recordEvent(deps.db, { module: "page-server", kind: "refused-token", detail: { path } });
        return reply.code(401).send({
          error: "This link is not current. Open the link premise printed when it started.",
        });
      }
    }
  });

  app.get("/api/health", async () => ({ ok: true, name: "premise", version: VERSION }));

  app.get("/api/overview", async () => {
    const { config } = deps;
    const queueState = deps.queue.state();
    const weekly = await deps.ledger.weeklyUsage();
    const softwares = await Promise.all(
      listSoftwares(deps.db).map(async (s) => ({
        ...s,
        usage: await deps.ledger.softwareUsage(s.id),
      })),
    );
    const counts = Object.fromEntries(
      (
        deps.db.prepare("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status").all() as {
          status: string;
          n: number;
        }[]
      ).map((r) => [r.status, r.n]),
    );
    return {
      version: VERSION,
      dataFolder: config.data.folder,
      schemaVersion: deps.schemaVersion,
      agents: {
        mode: config.agents.mode,
        tasks: AGENT_TASK_KINDS.map((kind) => ({ kind, ...config.agents.tasks[kind] })),
      },
      queue: {
        maxAgentSessions: config.queue.max_agent_sessions,
        runningAgentSessions: deps.queue.runningAgentSessions(),
        jobs: counts,
        ...queueState,
      },
      usage: { mode: deps.ledger.mode, mocked: deps.ledger.mocked, weekly },
      softwares,
      setup: deps.setup.checks,
    };
  });

  if (existsSync(join(deps.webRoot, "index.html"))) {
    await app.register(fastifyStatic, { root: deps.webRoot });
  } else {
    app.get("/", async (_request, reply) => reply.type("text/html").send(NOT_BUILT_PAGE));
  }

  return app;
}
