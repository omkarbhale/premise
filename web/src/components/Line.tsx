import { useState } from "react";
import { ApiError, NotCurrentLink, type SoftwareDetail } from "../api";
import { useSession } from "../context";
import {
  PHASES,
  SIZE_CLASSES,
  whereNow,
  type SizeClass,
  type StageId,
} from "../../../src/shared/stages";
import { Problem } from "./Badges";

const SIZE_PLAIN: Record<SizeClass, string> = {
  small: "Small: a few screens or commands; short steps.",
  medium: "Medium: several parts; longer steps.",
  large: "Large: many parts; the longest steps.",
};

/** The three phases with their steps, where the software is, and the controls that move it. */
export function Line({ software }: { software: SoftwareDetail }) {
  const { api, notCurrent, refresh } = useSession();
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
        Every software goes through three phases. Open a phase to see its steps. A step that is not
        needed for this software is simply passed over. You can send the software back to any step
        it has reached.
      </p>
      <p className="where-now">
        <strong>{whereNow(software.stage)}</strong>
      </p>
      <ol className="phases">
        {PHASES.map((phase, n) => {
          const steps = software.stages.filter((st) =>
            (phase.stages as readonly string[]).includes(st.id),
          );
          const state = steps.some((st) => st.position === "current")
            ? "current"
            : steps.every((st) => st.position === "done")
              ? "done"
              : steps.every((st) => st.position === "ahead")
                ? "ahead"
                : "current";
          return (
            <li key={phase.id} className={`phase phase-${state}`}>
              <details open={state === "current"}>
                <summary>
                  <span className="phase-number" aria-hidden="true">
                    {state === "done" ? "✓" : n + 1}
                  </span>
                  <strong>{phase.name}</strong>
                  <span className="chip">
                    {state === "done" ? "Done" : state === "current" ? "Here now" : "Comes later"}
                  </span>
                </summary>
                <p className="muted small">{phase.plain}</p>
                <ol className="stages">
                  {steps.map((stage) => (
                    <li key={stage.id} className={`stage stage-${stage.position}`}>
                      <span className="stage-number" aria-hidden="true">
                        {stage.position === "done" ? "✓" : stage.position === "current" ? "●" : "○"}
                      </span>
                      <div className="stage-body">
                        <strong>{stage.name}</strong>
                        <span className="sr-only">
                          {stage.position === "done"
                            ? " (passed)"
                            : stage.position === "current"
                              ? " (here now)"
                              : " (comes later)"}
                        </span>
                        {stage.position === "current" && (
                          <span className="chip chip-here">Here now</span>
                        )}
                        <p className="muted small">{stage.plain}</p>
                        {stage.position === "current" && <p className="small">{software.status}</p>}
                      </div>
                      {stage.position !== "ahead" &&
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
              </details>
            </li>
          );
        })}
      </ol>
      {problem && <Problem>{problem}</Problem>}

      <section className="card">
        <h2>Size</h2>
        <p className="muted small">
          The size sets how much effort each step may take. premise proposes one at the start;
          change it whenever you like.
        </p>
        <fieldset className="sizes">
          <legend className="sr-only">Size</legend>
          {SIZE_CLASSES.map((size) => (
            <label key={size} className="radio">
              <input
                type="radio"
                name="size"
                value={size}
                checked={software.sizeClass === size}
                disabled={busy}
                onChange={() => void act(() => api.setSize(software.id, size))}
              />
              {SIZE_PLAIN[size]}
            </label>
          ))}
        </fieldset>
      </section>

      <section className="card">
        <h2>Milestones</h2>
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
        <p className="muted small">
          New softwares get their priority and whether to stop after milestones from the settings
          softwares.default_priority and softwares.default_milestone_waits (see Settings).
        </p>
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
