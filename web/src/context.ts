import { createContext, useContext } from "react";
import type { Api, Overview, SoftwareSummary } from "./api";
import type { SoftwareTab } from "./components/SoftwareView";

export interface Session {
  api: Api;
  /** Bumped on every live event; views reload what they show when it changes. */
  version: number;
  /** The link stopped working: show how to get a current one. */
  notCurrent: () => void;
  /** Show a problem at the top of the page. */
  report: (message: string) => void;
  /** Something changed because of this page: reload now, without waiting for the event. */
  refresh: () => void;
  /** Open a software (and one of its tabs) on the page. */
  go?: (softwareId: string, tab?: SoftwareTab) => void;
  /** Open one of the pages under More. */
  show?: (view: "usage" | "settings") => void;
  /** Every software, for cards that name where one stands now. */
  softwares?: SoftwareSummary[];
  /** What a new software starts with (effort, priority, stopping after milestones). */
  defaults?: Overview["defaults"];
  /** Whether agents are scripted (a demo) or real. */
  agentsMode?: "claude" | "scripted";
  /**
   * Role labels in use besides the operator. Empty when only the operator is asked anything: the
   * page then shows no role labels at all.
   */
  roles?: string[];
  /** Terms already explained on this page, so each is explained once, where it first appears. */
  explained?: Set<string>;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession is used outside the session.");
  return session;
}
