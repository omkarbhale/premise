import { useState } from "react";
import type { RunView } from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { when } from "../words";
import { Problem } from "./Badges";

const STATE_NAME: Record<RunView["state"], string> = {
  none: "Nothing to open yet",
  starting: "Starting",
  running: "Running",
  finished: "Ran once on a sample",
  built: "Built",
  crashed: "Stopped after crashing",
  failed: "Could not start",
  stopped: "Stopped",
};

/** Where the software runs: how to open it, its latest output, and a way to start or stop it. */
export function RunPanel({ softwareId }: { softwareId: string }) {
  const { api, version, notCurrent } = useSession();
  const run = useLoad(() => api.run(softwareId), [softwareId], version, notCurrent);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (run.state === "loading") return <p className="muted">Loading how it runs…</p>;
  if (run.state === "error") return <Problem>{run.message}</Problem>;
  const r = run.data;

  async function act(action: "start" | "stop") {
    setBusy(true);
    setProblem(null);
    try {
      await (action === "start" ? api.startRun(softwareId) : api.stopRun(softwareId));
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
      run.reload();
    }
  }

  return (
    <section className="card running" aria-label="How it runs">
      {/* "Open it" only for what has a link to open; anything else is tried. */}
      <h2>{r.kind === "web" ? "Open it" : "Try it"}</h2>
      <p>
        <strong>{STATE_NAME[r.state]}.</strong> {r.plain}
        {r.commit && <span className="muted small"> Version {r.commit}.</span>}
      </p>
      {r.link && (
        <p>
          <a href={r.link} target="_blank" rel="noreferrer">
            {r.link}
          </a>{" "}
          <span className="muted small">(works on this computer only)</span>
        </p>
      )}
      {r.command && (
        <p>
          {r.kind === "command" ? "Type this in a terminal" : "How to start it"}
          {r.folder ? (
            <>
              , in <code>{r.folder}</code>
            </>
          ) : null}
          : <code>{r.command}</code>
        </p>
      )}
      {r.restarts > 0 && (
        <p className="small muted">
          It crashed and was started again {r.restarts} time{r.restarts === 1 ? "" : "s"}.
        </p>
      )}
      {!r.confined && (
        <p className="warn" role="status">
          This ran without confinement, because confinement is switched off in premise's settings.
          It could read your files.
        </p>
      )}
      {problem && <Problem>{problem}</Problem>}
      <p>
        {r.canStart && r.state !== "none" && (
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void act("start")}
          >
            Start it again
          </button>
        )}{" "}
        {r.canStop && (
          <button type="button" className="quiet" disabled={busy} onClick={() => void act("stop")}>
            Stop it
          </button>
        )}
      </p>
      {r.output.length > 0 && (
        <details open={r.state !== "running"}>
          <summary>{r.outputIsSample ? "What the sample run printed" : "Latest output"}</summary>
          <pre className="output" tabIndex={0}>
            {r.output.join("\n")}
          </pre>
        </details>
      )}
      {r.started && (
        <p className="small muted">
          Started {when(r.started)}
          {r.ended && `, ended ${when(r.ended)}`}.
        </p>
      )}
    </section>
  );
}
