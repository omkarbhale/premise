import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, NotCurrentLink } from "./api";
import type { StreamEvent } from "./api";

export type Connection = "connecting" | "live" | "reconnecting";

/**
 * The server's event stream (decision 0070). The browser reconnects by itself and sends the last
 * event id, so the server replays what was missed. `onEvent` fires once per event.
 */
export function useEventStream(
  url: string | null,
  onEvent: (event: StreamEvent) => void,
): Connection {
  const [state, setState] = useState<Connection>("connecting");
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);
  useEffect(() => {
    if (!url || typeof EventSource === "undefined") return;
    const source = new EventSource(url);
    source.onopen = () => setState("live");
    source.onerror = () => setState("reconnecting");
    source.addEventListener("premise", (message) => {
      try {
        handler.current(JSON.parse((message as MessageEvent<string>).data) as StreamEvent);
      } catch {
        // A line the page cannot read is skipped; the next refresh catches up.
      }
    });
    return () => source.close();
  }, [url]);
  return state;
}

export type Loaded<T> =
  { state: "loading" } | { state: "ready"; data: T } | { state: "error"; message: string };

/**
 * Load something from premise, again whenever `version` changes (the page bumps it on every live
 * event). Keeps showing the last data while reloading, so the page does not flicker.
 */
export function useLoad<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  version: number,
  onNotCurrent: () => void,
): Loaded<T> & { reload: () => void } {
  const [result, setResult] = useState<Loaded<T>>({ state: "loading" });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const notCurrent = useRef(onNotCurrent);
  useEffect(() => {
    notCurrent.current = onNotCurrent;
  }, [onNotCurrent]);
  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => !cancelled && setResult({ state: "ready", data }),
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof NotCurrentLink) notCurrent.current();
        else setResult({ state: "error", message: (error as ApiError).message });
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, tick]);
  return { ...result, reload };
}
