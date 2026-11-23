import { useState } from "react";
import { ApiError, NotCurrentLink, type Overview, type PauseView } from "../api";
import { useSession } from "../context";
import { jobLabel, plural } from "../words";

/** Runs a pause or resume call, shows what went wrong in words, and refreshes the page. */
function useAction() {
  const { notCurrent, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setProblem(null);
    try {
      await action();
      refresh();
      return true;
    } catch (error) {
      if (error instanceof NotCurrentLink) notCurrent();
      else setProblem((error as ApiError).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, problem, run };
}

/**
 * "Pause everything" and "Resume", always in the top bar. Pausing asks one thing: let what is
 * running finish (the default) or stop it now.
 */
export function PauseControl({ pause }: { pause: PauseView }) {
  const { api } = useSession();
  const { busy, problem, run } = useAction();
  const [choosing, setChoosing] = useState(false);
  const [mode, setMode] = useState<"finish" | "stop-now">("finish");

  if (pause.stopping) {
    return (
      <span className="pause-control small" role="status">
        premise is stopping…
      </span>
    );
  }
  if (pause.paused) {
    return (
      <span className="pause-control">
        <button
          type="button"
          className="primary"
          disabled={busy}
          title="Start work again, in every software"
          onClick={() => void run(() => api.resumeEverything())}
        >
          Resume
        </button>
        {problem && <span className="problem small"> {problem}</span>}
      </span>
    );
  }
  return (
    <span className="pause-control">
      <button
        type="button"
        aria-expanded={choosing}
        aria-controls="pause-choice"
        onClick={() => setChoosing((c) => !c)}
      >
        Pause everything
      </button>
      {choosing && (
        <form
          id="pause-choice"
          className="card pause-choice"
          aria-label="Pause everything"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => api.pauseEverything(mode)).then((ok) => ok && setChoosing(false));
          }}
        >
          <p>
            <strong>Pause everything</strong>
          </p>
          <p className="small">
            Nothing new starts in any software until you press Resume. You can still answer
            questions meanwhile.
          </p>
          <label className="choice">
            <input
              type="radio"
              name="pause-mode"
              checked={mode === "finish"}
              onChange={() => setMode("finish")}
            />
            <span>
              <strong>Let what is running finish</strong> (recommended)
              <span className="small muted block">
                Agents that are working carry on to the end of their job. The banner says when it is
                safe to close premise.
              </span>
            </span>
          </label>
          <label className="choice">
            <input
              type="radio"
              name="pause-mode"
              checked={mode === "stop-now"}
              onChange={() => setMode("stop-now")}
            />
            <span>
              <strong>Stop it now</strong>
              <span className="small muted block">
                Running agents are stopped and their jobs go back to the queue. Their unfinished
                work is redone later.
              </span>
            </span>
          </label>
          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              Pause
            </button>
            <button type="button" className="quiet" onClick={() => setChoosing(false)}>
              Cancel
            </button>
          </div>
          {problem && <p className="problem small">{problem}</p>}
        </form>
      )}
    </span>
  );
}

/** What is paused, what is still finishing, and when it is safe to close premise. */
export function PauseBanner({ pause }: { pause: PauseView }) {
  const { api } = useSession();
  const { busy, problem, run } = useAction();
  if (!pause.paused && !pause.stopping) return null;
  const finishing = pause.stillFinishing;
  const canStopNow = pause.paused && pause.cause !== "usage-limit" && finishing.length > 0;
  return (
    <section className="banner warn pause-banner" role="status" aria-label="Paused">
      <p>
        <strong>{pause.stopping ? "Stopping." : "Paused."}</strong> {pause.headline}
      </p>
      {finishing.length > 0 && (
        <>
          <p className="small">Still finishing ({finishing.length}):</p>
          <ul className="small">
            {finishing.map((job) => (
              <li key={job.id}>
                {jobLabel(job.kind)} for {job.softwareName}
                {job.line && <span className="muted"> — {job.line}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="small">
        {pause.safeToClose ? (
          <strong>It is safe to close premise now.</strong>
        ) : (
          <strong>Not safe to close yet:</strong>
        )}{" "}
        {pause.safeToClose
          ? "Nothing is running, so nothing is lost."
          : `${plural(finishing.length, "job")} still running; closing now stops ${finishing.length === 1 ? "it" : "them"} and the unfinished work is redone later.`}
        {pause.runningSoftwares.length > 0 && (
          <>
            {" "}
            Software premise is running ({pause.runningSoftwares.map((s) => s.name).join(", ")})
            stops when premise stops; you can start it again afterwards.
          </>
        )}
      </p>
      <div className="actions">
        {pause.paused && (
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void run(() => api.resumeEverything())}
          >
            Resume
          </button>
        )}
        {canStopNow && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => api.pauseEverything("stop-now"))}
          >
            Stop it now: the {plural(finishing.length, "running session")}{" "}
            {finishing.length === 1 ? "is" : "are"} cut off and their work is redone later
          </button>
        )}
      </div>
      {problem && <p className="problem small">{problem}</p>}
    </section>
  );
}

function dismissedBefore(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function remember(key: string): void {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // not remembered; it shows again after a reload
  }
}

/** One line on what the last start picked up, with a way to start stopped software again. */
export function StartupNotice({ overview }: { overview: Overview }) {
  const { api } = useSession();
  const { busy, problem, run } = useAction();
  const startup = overview.startup;
  const key = `premise-startup-${startup?.startedAt ?? ""}`;
  const [hidden, setHidden] = useState(() => (startup ? dismissedBefore(key) : true));
  const [started, setStarted] = useState<string[]>([]);
  if (!startup || hidden) return null;
  const toStart = startup.stoppedSoftwares.filter((s) => !started.includes(s.softwareId));
  return (
    <section className="banner startup-notice" role="status" aria-label="Where premise picked up">
      <p>{startup.line}</p>
      {toStart.length > 0 && (
        <div className="actions">
          {toStart.map((s) => (
            <button
              key={s.softwareId}
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() => api.startRun(s.softwareId)).then(
                  (ok) => ok && setStarted((list) => [...list, s.softwareId]),
                )
              }
            >
              Start {s.name} again
            </button>
          ))}
        </div>
      )}
      {problem && <p className="problem small">{problem}</p>}
      <button
        type="button"
        className="link"
        onClick={() => {
          remember(key);
          setHidden(true);
        }}
      >
        Dismiss
      </button>
    </section>
  );
}

/** One line when the computer slept while agents were working. */
export function SleepNotice({ overview }: { overview: Overview }) {
  const sleep = overview.sleep;
  const key = `premise-sleep-${sleep?.noticedAt ?? ""}`;
  const [hidden, setHidden] = useState(() => (sleep ? dismissedBefore(key) : true));
  if (!sleep || hidden) return null;
  return (
    <section className="banner sleep-notice" role="status" aria-label="The computer slept">
      <p>{sleep.line}</p>
      <button
        type="button"
        className="link"
        onClick={() => {
          remember(key);
          setHidden(true);
        }}
      >
        Dismiss
      </button>
    </section>
  );
}
