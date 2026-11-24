#!/usr/bin/env node
// A stand-in for the usage-ledger command, for tests: it answers as usage-ledger's --json does
// (its docs/orchestrator.md), from a state it keeps, and records every call. It reads no logs and
// calls nothing. Run as a command, the state is the JSON file named by USAGE_LEDGER_DB; tests
// that need no process call ledgerAnswer() directly.
//
// The state: { "sessions": { "<id>": <session answer, with start and end> }, "fail": "<command>",
//   "calls": [...], "labels": {...}, "readings": [...], "budgets": {...} }
// A session not in "sessions" is not in the logs. "fail" makes that command break with no JSON.
// Every session given is taken to be in the current week.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const usd = (s) => (typeof s.cost?.usd === "number" ? s.cost.usd : null);
const share = (s) => (typeof s.weekly?.weeklyPercent === "number" ? s.weekly.weeklyPercent : null);

/** Sum a group of sessions the way `report` does. */
function group(list) {
  const costs = list.map(usd);
  const shares = list.map(share);
  const known = (values) => values.filter((v) => v !== null);
  const status = (values) =>
    known(values).length === 0
      ? "unknown"
      : known(values).length === values.length
        ? "estimated"
        : "partial";
  const sum = (key) => list.reduce((n, s) => n + (s[key] ?? 0), 0);
  return {
    sessions: list.length,
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    cacheCreationTokens: sum("cacheCreationTokens"),
    cacheReadTokens: sum("cacheReadTokens"),
    cost: {
      status: status(costs),
      usd: known(costs).length ? known(costs).reduce((a, b) => a + b, 0) : null,
      knownSessions: known(costs).length,
      unknownSessions: costs.length - known(costs).length,
    },
    weekly: {
      status: status(shares),
      weeklyPercent: known(shares).length ? known(shares).reduce((a, b) => a + b, 0) : null,
      knownSessions: known(shares).length,
      unknownSessions: shares.length - known(shares).length,
    },
  };
}

/** What usage-ledger would answer: { code, json } (json null when it breaks). */
export function ledgerAnswer(state, args, input = "") {
  state.calls ??= [];
  state.labels ??= {};
  state.readings ??= [];
  state.budgets ??= {};
  state.sessions ??= {};
  state.calls.push({ args, input: input || null });
  const ok = (object, code = 0) => ({ code, json: { schemaVersion: 1, ...object } });
  const refuse = (code, message, exit = 2) => ({
    code: exit,
    json: { schemaVersion: 1, error: { code, message } },
  });
  const option = (name) => {
    const at = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
    if (at < 0) return undefined;
    return args[at].includes("=") ? args[at].slice(name.length + 1) : args[at + 1];
  };
  if (state.fail === args[0]) return { code: 1, json: null };
  const projectOf = (id) => state.labels[id]?.project ?? null;
  const listed = () =>
    Object.entries(state.sessions).map(([sessionId, s]) => ({ sessionId, ...s }));

  switch (args[0]) {
    case "label": {
      const label = { sessionId: args[1], task: option("--task"), project: option("--project") };
      state.labels[args[1]] = label;
      return ok({ label: { ...label, labelledAt: new Date().toISOString() }, replaced: false });
    }
    case "reading": {
      const percent = Number(option("--percent"));
      const resetsAt = option("--resets-at");
      const takenAt = option("--at") ?? new Date().toISOString();
      if (!(percent >= 0 && percent <= 100) || !resetsAt || !(resetsAt > takenAt)) {
        return refuse("invalid-reading", "Not a reading usage-ledger accepts.");
      }
      const reading = {
        takenAt,
        weeklyPercent: percent,
        resetsAt,
        sessionId: null,
        source: "manual",
      };
      state.readings.push(reading);
      return ok({ reading });
    }
    case "sessions": {
      const since = option("--since");
      const sessions = listed().filter((s) => !since || !s.end || s.end >= since);
      return ok({
        listing: {
          window: { kind: since ? "since" : "all", from: since ?? null, to: null },
          sessions: sessions.map((s) => ({ ...s, project: projectOf(s.sessionId) })),
          count: sessions.length,
        },
      });
    }
    case "report": {
      const groups = new Map();
      for (const s of listed()) {
        const project = projectOf(s.sessionId);
        groups.set(project, [...(groups.get(project) ?? []), s]);
      }
      return ok({
        report: {
          by: "project",
          window: { kind: "week", basis: state.readings.length ? "reset-time" : "last-seven-days" },
          groups: [...groups].map(([project, list]) => ({ project, ...group(list) })),
          total: group(listed()),
        },
      });
    }
    case "budget": {
      const project = option("--project");
      if (args[1] === "remove") {
        const count = state.budgets[project] ? 1 : 0;
        delete state.budgets[project];
        return ok({ removed: { scope: "project", task: null, project, count } });
      }
      const unit = option("--dollars") !== undefined ? "dollars" : "percent";
      const limit = Number(option(unit === "dollars" ? "--dollars" : "--percent"));
      if (!(limit > 0)) return refuse("invalid-limit", "Not a limit usage-ledger accepts.");
      state.budgets[project] = { unit, limit };
      return ok({
        budget: { scope: "project", task: null, project, unit, limit },
        replaced: false,
      });
    }
    case "budgets": {
      const budgets = Object.entries(state.budgets).map(([project, b]) => {
        const g = group(listed().filter((s) => projectOf(s.sessionId) === project));
        const part = b.unit === "dollars" ? g.cost : g.weekly;
        const used = (b.unit === "dollars" ? part.usd : part.weeklyPercent) ?? 0;
        const status = used >= b.limit ? "used-up" : part.unknownSessions > 0 ? "incomplete" : "ok";
        return {
          scope: "project",
          task: null,
          project,
          unit: b.unit,
          limit: b.limit,
          used,
          remaining: b.limit - used,
          status,
          usedUp: status === "used-up",
          estimated: true,
          sessions: g.sessions,
          unknownSessions: part.unknownSessions,
          reason: part.unknownSessions > 0 ? "no estimated cost for some sessions" : null,
        };
      });
      const anyUsedUp = budgets.some((b) => b.usedUp);
      const anyIncomplete = budgets.some((b) => b.status === "incomplete");
      return ok(
        { week: {}, budgets, anyUsedUp, anyIncomplete },
        anyUsedUp ? 1 : anyIncomplete ? 3 : 0,
      );
    }
    default:
      return refuse("usage", `Unknown command ${args[0]}.`);
  }
}

// Run as the command: the state lives in the file USAGE_LEDGER_DB names.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  if (args[0] === "--version") {
    process.stdout.write("0.1.0\n");
    process.exit(0);
  }
  const file = process.env.USAGE_LEDGER_DB;
  const state = file ? JSON.parse(readFileSync(file, "utf8")) : {};
  const input = readFileSync(0, "utf8");
  const result = ledgerAnswer(
    state,
    args.filter((a) => a !== "--json"),
    input,
  );
  state.calls.at(-1).logs = process.env.USAGE_LEDGER_LOGS ?? null;
  state.calls.at(-1).json = args.includes("--json");
  if (file) writeFileSync(file, JSON.stringify(state, null, 2));
  if (result.json) process.stdout.write(JSON.stringify(result.json));
  else process.stderr.write("usage-ledger failed: something broke\n");
  process.exit(result.code);
}
