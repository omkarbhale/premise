import { createContext, useContext } from "react";
import type { Api } from "./api";

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
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession is used outside the session.");
  return session;
}
