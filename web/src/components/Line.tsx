import { useState } from "react";
import { ApiError, NotCurrentLink, type SoftwareDetail } from "../api";
import { useSession } from "../context";
import {
  EFFORT_WORDS,
  PHASES,
  SOFTWARE_EFFORTS,
  type SoftwareEffort,
  type StageId,
  whereNow,
} from "../../../src/shared/stages";
import { Define, Problem } from "./Badges";
import { WorkItems } from "./WorkItems";
import { BuildPanel } from "./BuildPanel";
import { Claims } from "./Claims";
import { RunPanel } from "./RunPanel";
import { InFlight, PiecesInFlightSetting } from "./InFlight";

/** The three phases with their steps, where the software is, and the controls that move it. */
export function Line({ software }: { software: SoftwareDetail }) {
  const { api, notCurrent, refresh, defaults } = useSession();
  const copyNotReady =
    software.existing?.status === "copying" || software.existing?.status === "copy-failed";
  const [confirming, setConfirming] = useState<StageId | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      refresh();
    } catch (error) {
      if (error instanceof NotCurrentLink) notCurrent();
      else setProblem((error as ApiError).message);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  return (
    <div className="line-view">
      <p className="muted">
        Every piece of work goes through three phases, <Define term="line">the line</Define>. Open a
        phase to see its steps. Steps that were not needed, or that never happened, are marked
        "Skipped", with the reason. You can send the work back to any step it has reached.
      </p>
      <p className="where-now">
        <strong>
          {software.state === "ended"
            ? "Ended: you decided not to build it"
            : whereNow(software.stage, software.takingOn)}
        </strong>
      </p>
      {software.change && <ChangeCard change={software.change} />}
      <InFlight software={software} />
      <ol className="phases">
        {PHASES.map((phase, n) => {
          const steps = software.stages.filter((st) =>
            (phase.stages as readonly string[]).includes(st.id),
          );
          const needed = steps.filter((st) => st.position !== "skipped");
          const state =
            needed.length === 0
              ? "skipped"
              : needed.some((st) => st.position === "current")
                ? "current"
                : needed.every((st) => st.position === "done")
                  ? "done"
                  : needed.every((st) => st.position === "ahead")
                    ? "ahead"
                    : "current";
          return (
            <li key={phase.id} className={`phase phase-${state}`}>
              <details open={state === "current"}>
                <summary>
                  <span className="phase-number" aria-hidden="true">
                    {state === "done" ? "✓" : state === "skipped" ? "–" : n + 1}
                  </span>
                  <strong>{phase.name}</strong>
                  <span className="chip">
                    {state === "done"
                      ? "Done"
                      : state === "current"
                        ? "Here now"
                        : state === "skipped"
                          ? "Skipped"
                          : "Comes later"}
                  </span>
                </summary>
                <p className="muted small">{phase.plain}</p>
                <ol className="stages">
                  {steps.map((stage) => (
                    <li key={stage.id} className={`stage stage-${stage.position}`}>
                      <span className="stage-number" aria-hidden="true">
                        {stage.position === "done"
                          ? "✓"
                          : stage.position === "current"
                            ? "●"
                            : stage.position === "skipped"
                              ? "–"
                              : "○"}
                      </span>
                      <div className="stage-body">
                        <strong>{stage.name}</strong>
                        <span className="sr-only">
                          {stage.position === "done"
                            ? " (passed)"
                            : stage.position === "current"
                              ? " (here now)"
                              : stage.position === "skipped"
                                ? " (skipped)"
                                : " (comes later)"}
                        </span>
                        {stage.position === "current" && (
                          <span className="chip chip-here">Here now</span>
                        )}
                        {stage.position === "skipped" && (
                          <span className="chip" aria-hidden="true">
                            Skipped
                          </span>
                        )}
                        <p className="muted small">{stage.plain}</p>
                        {stage.position === "skipped" && stage.why && (
                          <p className="small">Skipped: {stage.why}</p>
                        )}
                        {stage.position === "current" && <p className="small">{software.status}</p>}
                      </div>
                      {!copyNotReady &&
                        (stage.position === "done" || stage.position === "current") &&
                        (confirming === stage.id ? (
                          <div
                            className="confirm"
                            role="group"
                            aria-label={`Send back to ${stage.name}?`}
                          >
                            <span className="small">
                              Send back to {stage.name}? Open questions are withdrawn and the steps
                              after it are done again.
                            </span>
                            <button
                              type="button"
                              className="danger"
                              disabled={busy}
                              onClick={() => void act(() => api.sendBack(software.id, stage.id))}
                            >
                              Send back
                            </button>
                            <button type="button" onClick={() => setConfirming(null)}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="quiet"
                            onClick={() => setConfirming(stage.id)}
                          >
                            {stage.position === "current"
                              ? "Start this step again"
                              : "Send back here"}
                          </button>
                        ))}
                    </li>
                  ))}
                </ol>
                {phase.id === "build" && software.build && <BuildPanel build={software.build} />}
                {phase.id === "running" && (software.build?.landed || state !== "ahead") && (
                  <RunPanel softwareId={software.id} />
                )}
              </details>
            </li>
          );
        })}
      </ol>
      {problem && <Problem>{problem}</Problem>}

      <WorkItems software={software} busy={busy} act={act} api={api} />

      <section className="card">
        <h2>
          <Define term="milestone">Milestones</Define>
        </h2>
        {software.milestones.length === 0 ? (
          <p className="muted small">
            premise proposes milestones at Plan. Each ends with running software and a report.
          </p>
        ) : (
          <>
            <p className="muted small">
              Each milestone ends with running software and a report. Tick one to make premise stop
              there until you say go on, so you can judge whether it is solving the right problem.
            </p>
            <ol className="milestones">
              {software.milestones.map((m) => (
                <li key={m.id} className={`milestone milestone-${m.position}`}>
                  <span>
                    <strong>{m.id}</strong> {m.text}{" "}
                    <span className="muted small">
                      {m.position === "reached"
                        ? "(reached)"
                        : m.position === "current"
                          ? "(being worked on)"
                          : ""}
                    </span>
                  </span>
                  <label className="wait small">
                    <input
                      type="checkbox"
                      checked={m.wait}
                      disabled={busy || m.position === "reached"}
                      onChange={(e) =>
                        void act(() => api.setMilestoneWait(software.id, m.id, e.target.checked))
                      }
                    />
                    Stop after it
                  </label>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <Claims software={software} />

      <section className="card">
        <h2>Effort</h2>
        <label className="small">
          How much premise puts into this software.{" "}
          <select
            value={software.effort}
            disabled={busy}
            onChange={(e) =>
              void act(() => api.setEffort(software.id, e.target.value as SoftwareEffort))
            }
          >
            {SOFTWARE_EFFORTS.map((e) => (
              <option key={e} value={e}>
                {e}: {EFFORT_WORDS[e]}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          It picks the starting choice when premise asks how much to build, and how long the steps
          before building may take.{" "}
          {defaults &&
            `New softwares start on ${defaults.effort}; the Settings page says how to change that.`}
        </p>
      </section>

      <section className="card">
        <h2>Changes you send</h2>
        <label className="small">
          When premise asks you about a change before building it.{" "}
          <select
            value={software.changeQuestions}
            disabled={busy}
            onChange={(e) =>
              void act(() =>
                api.setChangeQuestions(
                  software.id,
                  e.target.value as SoftwareDetail["changeQuestions"],
                ),
              )
            }
          >
            <option value="when-it-matters">
              Only when it matters; otherwise build and tell me
            </option>
            <option value="every-change">Ask about every change before building it</option>
            <option value="never">Never ask: build and tell me</option>
          </select>
        </label>
        <p className="muted small">
          It matters when a change replaces a foundation decision or is otherwise costly to undo, or
          your words left a real choice open. Even then premise asks only once. A bug is never asked
          about. When premise does not ask, it tells you what it understood and assumed, and you can
          strike any line while it builds.
        </p>
      </section>

      <PiecesInFlightSetting
        software={software}
        busy={busy}
        onChange={(value) => void act(() => api.setPiecesInFlight(software.id, value))}
      />

      <section className="card">
        <h2>Priority</h2>
        <label className="small">
          When agents are busy, the most important software goes first.{" "}
          <select
            value={software.priority}
            disabled={busy}
            onChange={(e) => void act(() => api.setPriority(software.id, Number(e.target.value)))}
          >
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>
                {p === 1 ? "1 (most important)" : p === 5 ? "5 (least important)" : p}
              </option>
            ))}
          </select>
        </label>
        {software.budget && (
          <p className="muted small">
            This stage may take up to {software.budget.turns} agent turns and{" "}
            {software.budget.minutes} minutes; about {software.budget.usedMinutes} minutes are used.
          </p>
        )}
        {defaults && (
          <p className="muted small">
            New softwares start on priority {defaults.priority} and{" "}
            {defaults.milestoneWaits ? "stop" : "do not stop"} after each milestone; the Settings
            page says how to change that.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Standing approvals</h2>
        {software.approvals.length === 0 ? (
          <p className="muted small">
            None. premise asks before every action outside this machine. When you approve a kind of
            action for this software, it shows here and you can withdraw it.
          </p>
        ) : (
          <ul className="approvals">
            {software.approvals.map((a) => (
              <li key={a.id}>
                <span>
                  {a.label[0]!.toUpperCase() + a.label.slice(1)}, approved{" "}
                  {new Date(a.given).toLocaleDateString()}
                </span>{" "}
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() => void act(() => api.withdrawApproval(a.id))}
                >
                  Withdraw
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The change being worked on, as one compact card (decision 0274). */
function ChangeCard({ change }: { change: NonNullable<SoftwareDetail["change"]> }) {
  return (
    <section className="card change-card" aria-label={`Your change ${change.ref}`}>
      <h2>
        Your change {change.ref}: {change.title}
      </h2>
      <p className="small">
        <strong>Your words:</strong> {change.words}
      </p>
      {change.understood.length > 0 && (
        <>
          <p className="small">
            <strong>What premise took from them:</strong>
          </p>
          <ul className="small">
            {change.understood.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      {change.assumed.length > 0 && (
        <>
          <p className="small">
            <strong>What premise assumed</strong> (not checked with you):
          </p>
          <ul className="small">
            {change.assumed.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      <p className="small">
        <strong>Now:</strong> {change.doing}
      </p>
      <p className="muted small">
        The steps below are this change's own. The software's milestones were built already and are
        not built again.
        {change.askId !== null &&
          " To strike a line, use the card for this change under Waiting on you."}
      </p>
    </section>
  );
}
