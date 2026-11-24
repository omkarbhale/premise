/**
 * Reads Claude Code's streamed JSON events (`--output-format stream-json --verbose`), one JSON
 * object per line, into what the agent runner acts on. Shapes follow the recorded streams of the
 * subscription and sandbox test of 2026-11-21.
 */

export type StreamEvent =
  /** The session started; its id is the runtime's own. */
  | { kind: "init"; sessionId: string; model: string | null; apiKeySource: string | null }
  /**
   * A model turn, with the tokens the message says it used when it says (a message can come on
   * several lines, each with the same id and the same usage).
   */
  | { kind: "turn"; messageId: string; usage: MessageUsage | null }
  /** Something to show on the page as progress. */
  | { kind: "progress"; text: string }
  /** The subscription's usage limit was reached; work pauses until the reset. */
  | { kind: "usage-limit"; resetAt: string | null; window: string | null }
  /**
   * What the stream says of a usage window (the share used and when it resets). Carried by every
   * rate-limit event, whatever its status; premise shows it as its own count (decision 0270).
   */
  | {
      kind: "window";
      window: string;
      usedFraction: number;
      resetsAt: string | null;
      status: string | null;
    }
  /** The usage limit is near. */
  | { kind: "usage-warning"; resetAt: string | null; window: string | null }
  /** A tool use was denied by a permission rule or the sandbox. */
  | { kind: "denied"; tool: string; message: string }
  /** The session's final result. */
  | {
      kind: "result";
      ok: boolean;
      subtype: string;
      text: string;
      turns: number | null;
      apiErrorStatus: number | null;
      /** What the session's own result says it used; each part null when the result lacks it. */
      figures: ResultFigures;
    }
  /** A line that is not JSON: kept in the transcript, otherwise ignored. */
  | { kind: "unreadable"; line: string };

/** The figures a Claude Code result carries, at list prices; null where it does not say. */
export interface ResultFigures {
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
}

/** The tokens one model message used, as the stream reports them (no cost: that is per result). */
export interface MessageUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** An epoch in seconds, as the rate-limit events give it, as an ISO time. */
function epochToIso(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? new Date(value * 1000).toISOString()
    : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function resultFigures(event: Json): ResultFigures {
  const usage = isObject(event.usage) ? event.usage : {};
  return {
    costUsd: count(event.total_cost_usd),
    inputTokens: count(usage.input_tokens),
    outputTokens: count(usage.output_tokens),
    cacheReadTokens: count(usage.cache_read_input_tokens),
    cacheWriteTokens: count(usage.cache_creation_input_tokens),
  };
}

function messageUsage(value: unknown): MessageUsage | null {
  if (!isObject(value)) return null;
  const input = count(value.input_tokens);
  const output = count(value.output_tokens);
  if (input === null && output === null) return null;
  return {
    inputTokens: input ?? 0,
    outputTokens: output ?? 0,
    cacheReadTokens: count(value.cache_read_input_tokens) ?? 0,
    cacheWriteTokens: count(value.cache_creation_input_tokens) ?? 0,
  };
}

function firstLine(text: string, max = 160): string {
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** A short line for a tool the agent used. premise's own progress tool is shown by the tool server. */
function describeToolUse(name: string, input: Json): string | null {
  if (name.startsWith("mcp__")) return null;
  const description = str(input.description);
  if (description) return firstLine(description);
  const command = str(input.command);
  if (name === "Bash" && command) return `Running: ${firstLine(command, 120)}`;
  const file = str(input.file_path) ?? str(input.path);
  if (file) {
    const short = file.split("/").slice(-2).join("/");
    if (name === "Write") return `Writing ${short}`;
    if (name === "Edit") return `Editing ${short}`;
    if (name === "Read") return `Reading ${short}`;
  }
  const query = str(input.query) ?? str(input.url) ?? str(input.pattern);
  if (query) return `${name}: ${firstLine(query, 120)}`;
  return `Using ${name}`;
}

export function parseStreamLine(line: string): StreamEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let event: unknown;
  try {
    event = JSON.parse(trimmed);
  } catch {
    return [{ kind: "unreadable", line: trimmed }];
  }
  if (!isObject(event)) return [{ kind: "unreadable", line: trimmed }];
  const type = event.type;

  if (type === "system" && event.subtype === "init") {
    const sessionId = str(event.session_id);
    return sessionId
      ? [
          {
            kind: "init",
            sessionId,
            model: str(event.model),
            apiKeySource: str(event.apiKeySource),
          },
        ]
      : [];
  }

  if (type === "system" && event.subtype === "permission_denied") {
    const tool = str(event.tool_name) ?? "a tool";
    return [{ kind: "denied", tool, message: str(event.message) ?? `${tool} was denied.` }];
  }

  if (type === "rate_limit_event" && isObject(event.rate_limit_info)) {
    const info = event.rate_limit_info;
    const status = str(info.status);
    const resetAt = epochToIso(info.resetsAt);
    const window = str(info.rateLimitType);
    const out: StreamEvent[] = [];
    // The share of each window used, as a fraction from 0 to 1, as the stream gives it.
    const windows = isObject(info.unifiedWindows) ? info.unifiedWindows : {};
    for (const [name, value] of Object.entries(windows)) {
      if (!isObject(value)) continue;
      const used = value.utilization;
      if (typeof used !== "number" || !Number.isFinite(used) || used < 0) continue;
      out.push({
        kind: "window",
        window: name,
        usedFraction: Math.min(1, used),
        resetsAt: epochToIso(value.resetsAt) ?? resetAt,
        status: str(value.status) ?? status,
      });
    }
    if (status === "rejected") out.push({ kind: "usage-limit", resetAt, window });
    if (status === "allowed_warning") out.push({ kind: "usage-warning", resetAt, window });
    return out;
  }

  if (type === "assistant" && isObject(event.message)) {
    const message = event.message;
    const out: StreamEvent[] = [];
    const id = str(message.id);
    if (id) out.push({ kind: "turn", messageId: id, usage: messageUsage(message.usage) });
    const content = Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      if (!isObject(block)) continue;
      if (block.type === "text" && str(block.text)?.trim()) {
        out.push({ kind: "progress", text: firstLine(block.text as string) });
      } else if (block.type === "tool_use" && str(block.name)) {
        const text = describeToolUse(
          block.name as string,
          isObject(block.input) ? block.input : {},
        );
        if (text) out.push({ kind: "progress", text });
      }
    }
    return out;
  }

  if (type === "result") {
    const subtype = str(event.subtype) ?? "unknown";
    const isError = event.is_error === true;
    return [
      {
        kind: "result",
        ok: subtype === "success" && !isError,
        subtype,
        text: str(event.result) ?? "",
        turns: typeof event.num_turns === "number" ? event.num_turns : null,
        apiErrorStatus: typeof event.api_error_status === "number" ? event.api_error_status : null,
        figures: resultFigures(event),
      },
    ];
  }

  return [];
}

/** Splits a byte stream into lines; keeps a partial last line until it is complete. */
export class LineSplitter {
  private rest = "";

  push(chunk: string): string[] {
    const text = this.rest + chunk;
    const lines = text.split("\n");
    this.rest = lines.pop() ?? "";
    return lines;
  }

  end(): string[] {
    const last = this.rest;
    this.rest = "";
    return last ? [last] : [];
  }
}
