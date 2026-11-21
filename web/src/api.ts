/** The session token lives in the link's #token=… part: never sent to other sites, never stored. */
export function sessionToken(): string | null {
  const match = /(?:^#|&)token=([^&]+)/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]!) : null;
}

export interface Check {
  name: string;
  status: "ok" | "warn" | "missing";
  detail: string;
  fix?: string;
}

export interface Overview {
  version: string;
  dataFolder: string;
  schemaVersion: number;
  agents: {
    mode: "scripted" | "claude";
    tasks: {
      kind: string;
      model: string;
      effort: string;
      max_turns: number;
      max_minutes: number;
    }[];
  };
  queue: {
    maxAgentSessions: number;
    runningAgentSessions: number;
    jobs: Record<string, number>;
    paused: boolean;
    reason: string | null;
    resumeAt: string | null;
  };
  usage: {
    mode: string;
    mocked: boolean;
    weekly: { mocked: boolean; utilization: number; windowStart: string; resetsAt: string };
  };
  softwares: {
    id: string;
    name: string;
    priority: number;
    state: string;
    currentStage: string;
    usage: { mocked: boolean; sessions: number; costUsd: number; weeklyShare: number };
  }[];
  setup: Check[];
}

export class NotCurrentLink extends Error {}

export async function fetchOverview(token: string): Promise<Overview> {
  const response = await fetch("/api/overview", { headers: { "x-premise-token": token } });
  if (response.status === 401) throw new NotCurrentLink();
  if (!response.ok) throw new Error(`premise answered ${response.status}.`);
  return (await response.json()) as Overview;
}
