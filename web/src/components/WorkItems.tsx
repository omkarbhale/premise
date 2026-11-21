import { useState } from "react";
import type { SoftwareDetail, WorkItemView } from "../api";
import { SIZE_CLASSES, STAGES, type SizeClass, type StageId } from "../../../src/shared/stages";

const STATE_WORDS: Record<WorkItemView["state"], string> = {
  sizing: "Being sized",
  working: "Being worked on",
  "waiting-on-parts": "Waiting for its parts",
  ahead: "Comes later",
  done: "Done",
  dropped: "Not built",
  withdrawn: "Withdrawn",
};

const BY_WORDS = {
  sizer: "premise's sizer",
  operator: "you",
  default: "premise's default",
} as const;

const stageName = (id: StageId) => STAGES.find((s) => s.id === id)?.name ?? id;

/**
 * The pieces of work going through the line: the software, its milestones, and the parts of any
 * piece the sizer split. Each shows its size, the steps it needs and why, and the operator can
 * change them or undo a split (decision 0184).
 */
export function WorkItems({
  software,
  busy,
  act,
  api,
}: {
  software: SoftwareDetail;
  busy: boolean;
  act: (work: () => Promise<unknown>) => Promise<void>;
  api: {
    setItemSize(itemId: number, size: SizeClass): Promise<unknown>;
    setItemStages(itemId: number, stages: StageId[]): Promise<unknown>;
    undoSplit(itemId: number): Promise<unknown>;
  };
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [chosen, setChosen] = useState<StageId[]>([]);
  const [undoing, setUndoing] = useState<number | null>(null);
  const shown = software.work.filter((w) => w.state !== "withdrawn");

  return (
    <section className="card">
      <h2>Size and steps</h2>
      <p className="muted small">
        Before any work starts, premise sizes it: how big it is, which steps it needs, and whether
        it splits into separate parts. A small fix goes straight to building; something that changes
        what the software is for goes back to Why. Change any of it here.
        {software.wholeCheckStandIn &&
          software.work.some((w) => w.sizing?.split.decision === "split") &&
          " The check of a split piece as a whole is a stand-in for now: it checks nothing."}
      </p>
      <ol className="work-items">
        {shown.map((item) => (
          <li
            key={item.id}
            className={`work-item work-${item.state}${item.current ? " work-current" : ""}`}
            style={{ marginInlineStart: `${item.depth * 1.2}rem` }}
          >
            <div className="work-head">
              <strong>{item.title}</strong> <span className="chip">{STATE_WORDS[item.state]}</span>
              {item.current && <span className="chip chip-here">Here now</span>}
            </div>
            {item.depth > 0 &&
              item.kind !== "milestone" &&
              item.words &&
              item.words !== item.title && <p className="small">{item.words}</p>}
            {item.sizing && (
              <details open={item.current}>
                <summary className="small">
                  Size {item.sizeClass}, {item.stages.length}{" "}
                  {item.stages.length === 1 ? "step" : "steps"}
                  {item.sizing.split.decision === "split" ? ", split into parts" : ""}. Why?
                </summary>
                <ul className="small work-reasons">
                  <li>
                    Size: {item.sizeClass}. {item.sizing.size.reason}{" "}
                    <span className="muted">(decided by {BY_WORDS[item.sizing.size.by]})</span>
                  </li>
                  <li>
                    Steps: {item.stages.map(stageName).join(", ")}.
                    {item.skipped.length > 0 && (
                      <> Not needed: {item.skipped.map(stageName).join(", ")}.</>
                    )}{" "}
                    {item.sizing.stages.reason}{" "}
                    <span className="muted">(decided by {BY_WORDS[item.sizing.stages.by]})</span>
                  </li>
                  <li>
                    {item.sizing.split.decision === "split" ? "Split into parts: " : "Kept whole: "}
                    {item.sizing.split.reason}{" "}
                    <span className="muted">(decided by {BY_WORDS[item.sizing.split.by]})</span>
                  </li>
                  {item.minutesBeforeBuild !== null && (
                    <li className="muted">
                      Reached building {item.minutesBeforeBuild} minutes after it was started.
                    </li>
                  )}
                </ul>
              </details>
            )}
            {item.canChange && item.sizing && (
              <div className="work-controls">
                <label className="small">
                  Size{" "}
                  <select
                    value={item.sizeClass}
                    disabled={busy}
                    onChange={(e) =>
                      void act(() => api.setItemSize(item.id, e.target.value as SizeClass))
                    }
                  >
                    {SIZE_CLASSES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                {editing === item.id ? (
                  <fieldset className="work-steps">
                    <legend className="small">Steps it goes through</legend>
                    {item.allowedStages.map((stage) => {
                      const always = item.requiredStages.includes(stage);
                      return (
                        <label key={stage} className="small check">
                          <input
                            type="checkbox"
                            checked={always || chosen.includes(stage)}
                            disabled={always || busy}
                            onChange={(e) =>
                              setChosen((now) =>
                                e.target.checked ? [...now, stage] : now.filter((s) => s !== stage),
                              )
                            }
                          />
                          {stageName(stage)}
                          {always && <span className="muted"> (always needed)</span>}
                        </label>
                      );
                    })}
                    <div className="row">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(() => api.setItemStages(item.id, chosen)).then(() =>
                            setEditing(null),
                          )
                        }
                      >
                        Save steps
                      </button>
                      <button type="button" className="quiet" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </fieldset>
                ) : (
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy || item.allowedStages.length === item.requiredStages.length}
                    onClick={() => {
                      setChosen(item.stages);
                      setEditing(item.id);
                    }}
                  >
                    Change steps
                  </button>
                )}
                {item.canUndoSplit &&
                  (undoing === item.id ? (
                    <div className="confirm" role="group" aria-label="Undo the split?">
                      <span className="small">
                        Undo the split? Its parts are withdrawn and it goes through the line as one
                        piece.
                      </span>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() =>
                          void act(() => api.undoSplit(item.id)).then(() => setUndoing(null))
                        }
                      >
                        Undo split
                      </button>
                      <button type="button" onClick={() => setUndoing(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="quiet" onClick={() => setUndoing(item.id)}>
                      Undo the split
                    </button>
                  ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
