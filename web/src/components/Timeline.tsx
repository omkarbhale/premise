import { useState } from "react";
import {
  ApiError,
  NotCurrentLink,
  type QueuePriority,
  type TimelineEntry,
  type TimelineMark,
  type TimelineStep,
  type TimelineView,
} from "../api";
import { useSession } from "../context";
import { when } from "../words";

/** How many queued pieces show before "Show all". */
const SHOWN_NEXT = 4;

const MARK: Record<TimelineMark, { sign: string; words: string }> = {
  done: { sign: "✓", words: "done" },
  running: { sign: "●", words: "running now" },
  todo: { sign: "○", words: "to do" },
  waiting: { sign: "!", words: "waiting on a person" },
  stopped: { sign: "×", words: "stopped" },
};

const PRIORITY: { value: QueuePriority; label: string }[] = [
  { value: "first", label: "Do this first" },
  { value: "normal", label: "Normal" },
  { value: "later", label: "Can wait" },
];

/**
 * The line of one software as a timeline (decisions 0320, 0321): what is done (collapsed), what
 * runs now and on which step (expanded), and everything queued after it, in order, each with why
 * it waits and what starts it. Questions sit where the work waits for them.
 */
export function Timeline({
  timeline,
  onAnswer,
}: {
  timeline: TimelineView;
  /** Open the conversation at this question. */
  onAnswer: (askId: number) => void;
}) {
  const { api, notCurrent, refresh, report, show } = useSession();
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = timeline;

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      refresh();
    } catch (error) {
      if (error instanceof NotCurrentLink) notCurrent();
      else report((error as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const next = showAll ? t.next : t.next.slice(0, SHOWN_NEXT);
  const hidden = t.next.length - next.length;

  return (
    <section className="timeline card" aria-labelledby="timeline-title">
      <div className="section-head">
        <h2 id="timeline-title">Timeline</h2>
        {t.queue.length > 0 && (
          <span
            className="small muted"
            title="A rough estimate from what premise has measured itself; never a promise."
          >
            {t.queue.length === 1 ? "1 change queued" : `${t.queue.length} changes queued`}
            {t.queue.total.enough && `, ${t.queue.total.words} in all (rough estimate)`}
          </span>
        )}
      </div>
      <p className="timeline-headline">{t.headline}</p>

      {t.notice && (
        <div className="timeline-notice" role="status">
          <p>
            <strong>The queue is long.</strong> {t.notice.words}
          </p>
          <div className="actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(() => api.answerQueueNotice(t.softwareId, "hold"))}
            >
              Hold the{" "}
              {t.notice.holdCount === 1
                ? "lowest-value one"
                : `${t.notice.holdCount} lowest-value ones`}
            </button>
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api.answerQueueNotice(t.softwareId, "budget");
                  show?.("usage");
                })
              }
            >
              Raise its budget
            </button>
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api.answerQueueNotice(t.softwareId, "agents");
                  show?.("settings");
                })
              }
            >
              Let more agents work at once
            </button>
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() => void act(() => api.answerQueueNotice(t.softwareId, "leave"))}
            >
              Leave it as it is
            </button>
          </div>
        </div>
      )}

      {t.groups.map((g) => (
        <div key={g.workItemIds.join("-")} className="timeline-group">
          <p>
            <strong>
              {g.refs.length} changes are about {g.about}.
            </strong>{" "}
            premise proposes doing them as one change ({g.refs.join(", ")}): planned, built and
            checked once.
          </p>
          <div className="actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(() => api.decideGroup(t.softwareId, g.workItemIds, true))}
            >
              Make them one change
            </button>
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() => void act(() => api.decideGroup(t.softwareId, g.workItemIds, false))}
            >
              Keep them apart
            </button>
          </div>
        </div>
      ))}

      {t.overlaps.map((o) => (
        <div key={`${o.milestoneItemId}-${o.workItemId}`} className="timeline-group">
          <p>
            <strong>
              {o.ref} and {o.milestoneTitle.charAt(0).toLowerCase() + o.milestoneTitle.slice(1)}{" "}
              both change {o.about}.
            </strong>{" "}
            premise proposes building {o.ref} as part of that milestone: one more task there, so the
            same parts are not built twice.
          </p>
          <div className="actions">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api.decideOverlap(t.softwareId, o.milestoneItemId, o.workItemId, true),
                )
              }
            >
              Build it as part of the milestone
            </button>
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api.decideOverlap(t.softwareId, o.milestoneItemId, o.workItemId, false),
                )
              }
            >
              Keep them apart
            </button>
          </div>
        </div>
      ))}

      {t.done.length > 0 && (
        <details className="timeline-done">
          <summary>{t.done.length === 1 ? "1 piece done" : `${t.done.length} pieces done`}</summary>
          <ol className="tl">
            {t.done.map((e) => (
              <li key={e.key} className={`tl-entry tl-${e.state}`}>
                <span className="tl-sign" aria-hidden="true">
                  {e.state === "dropped" ? "×" : "✓"}
                </span>
                <div>
                  <span>{e.title}</span>
                  <span className="muted small">
                    {" "}
                    · {e.outcome}
                    {e.finished && ` ${when(e.finished)}`}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}

      <ol className="tl" aria-label="Running now and next">
        {t.now.map((e) => (
          <Entry
            key={e.key}
            entry={e}
            onAnswer={onAnswer}
            busy={busy}
            onWait={(id, wait) => void act(() => api.setMilestoneWait(t.softwareId, id, wait))}
          />
        ))}
        {t.now.length === 0 && (
          <li className="tl-entry tl-idle">
            <span className="tl-sign" aria-hidden="true">
              ·
            </span>
            <div className="muted">Nothing is running right now.</div>
          </li>
        )}
        {next.map((e) => (
          <Entry
            key={e.key}
            entry={e}
            onAnswer={onAnswer}
            busy={busy}
            onMove={(dir) => void act(() => api.moveQueued(e.queue!.workItemId, dir))}
            onPriority={(p) => void act(() => api.setQueuedPriority(e.queue!.workItemId, p))}
            onSplit={() => void act(() => api.splitChange(e.queue!.workItemId))}
            onPlace={(before) => void act(() => api.setPlacement(e.queue!.workItemId, before))}
            onWait={(id, wait) => void act(() => api.setMilestoneWait(t.softwareId, id, wait))}
          />
        ))}
      </ol>
      {hidden > 0 && (
        <button type="button" className="link" onClick={() => setShowAll(true)}>
          Show all {t.next.length} queued
        </button>
      )}
      {showAll && t.next.length > SHOWN_NEXT && (
        <button type="button" className="link" onClick={() => setShowAll(false)}>
          Show fewer
        </button>
      )}
    </section>
  );
}

function Steps({ steps, label }: { steps: TimelineStep[]; label: string }) {
  return (
    <ul className="tl-steps" aria-label={label}>
      {steps.map((s, i) => (
        <li key={`${i}-${s.text}`} className={`tl-step mark-${s.mark}`}>
          <span className="tl-mark" aria-hidden="true">
            {MARK[s.mark].sign}
          </span>
          <span className="sr-only">{MARK[s.mark].words}: </span>
          <span>{s.text}</span>
          {s.detail && <span className="muted small"> · {s.detail}</span>}
          {s.tasks && s.tasks.length > 0 && <Steps steps={s.tasks} label={`Tasks of ${s.text}`} />}
        </li>
      ))}
    </ul>
  );
}

function Entry({
  entry: e,
  onAnswer,
  busy = false,
  onMove,
  onPriority,
  onSplit,
  onPlace,
  onWait,
}: {
  entry: TimelineEntry;
  onAnswer: (askId: number) => void;
  busy?: boolean;
  onMove?: (direction: "up" | "down") => void;
  onPriority?: (priority: QueuePriority) => void;
  onSplit?: () => void;
  onPlace?: (before: boolean) => void;
  onWait?: (milestoneId: string, wait: boolean) => void;
}) {
  const live = e.state === "running" || (e.state === "waiting-on-you" && e.step !== null);
  const sign =
    e.state === "running"
      ? "●"
      : e.state === "waiting-on-you"
        ? "!"
        : e.state === "being-read"
          ? "…"
          : "○";
  const stateWords =
    e.state === "running"
      ? "Running now"
      : e.state === "waiting-on-you"
        ? "Waiting on you"
        : e.state === "being-read"
          ? "Being read"
          : e.place !== null
            ? `${placeWords(e.place)} in line`
            : "Next";
  return (
    <li className={`tl-entry tl-${e.state} ${live ? "tl-live" : ""}`} aria-label={e.title}>
      <span className="tl-sign" aria-hidden="true">
        {sign}
      </span>
      <div className="tl-body">
        <div className="tl-title">
          <span className={`chip tl-chip tl-chip-${e.state}`}>{stateWords}</span>{" "}
          <strong>{e.title}</strong>
        </div>
        {e.milestone && e.state !== "waiting-on-you" && (
          <p className="tl-wait small">
            <span className={`chip ${e.milestone.wait ? "tl-chip-waiting-on-you" : ""}`}>
              {e.milestone.wait ? "Stops after it for you" : "Goes straight on after it"}
            </span>{" "}
            {onWait && (
              <button
                type="button"
                className="link"
                disabled={busy}
                onClick={() => onWait(e.milestone!.id, !e.milestone!.wait)}
              >
                {e.milestone.wait ? "Do not stop after it" : "Stop after it until I say go on"}
              </button>
            )}
          </p>
        )}
        {e.step && <p className="tl-step-now">{e.step}</p>}
        {e.who.length > 0 && (
          <ul className="tl-who small">
            {e.who.map((w, i) => (
              <li key={i}>
                {w.status === "running"
                  ? `The ${w.role} is working`
                  : w.status === "queued"
                    ? `The ${w.role} starts when an agent is free`
                    : `The ${w.role} is waiting`}
                {w.since && w.status === "running" && `, since ${when(w.since)}`}
                {w.progress && <span className="muted">. Last: “{w.progress}”</span>}
              </li>
            ))}
          </ul>
        )}
        {live && e.steps.length > 0 && <Steps steps={e.steps} label={`Steps of ${e.title}`} />}
        {e.why && <p className="tl-why small">{e.why}</p>}
        {e.startsWhen && <p className="tl-starts small muted">{e.startsWhen}</p>}
        {e.estimate && e.state !== "running" && (
          <p className="tl-estimate small muted">
            Rough estimate from premise's own history: {e.estimate.wait.words}; its own work,{" "}
            {e.estimate.work.words}.
          </p>
        )}
        {e.asks.map((a) => (
          <div key={a.id} className={`tl-ask ${a.notice ? "tl-ask-notice" : ""}`}>
            <span>
              {a.notice ? "premise told you: " : "Waits for your answer: "}
              {a.title}
            </span>{" "}
            <button type="button" className="link" onClick={() => onAnswer(a.id)}>
              {a.notice ? "Read it" : "Answer it"}
            </button>
          </div>
        ))}
        {e.queue && e.queue.together.length > 0 && (
          <p className="small muted">
            One change made of {e.queue.together.join(", ")}.
            {e.queue.canSplit && onSplit && (
              <>
                {" "}
                <button type="button" className="link" disabled={busy} onClick={onSplit}>
                  Split it again
                </button>
              </>
            )}
          </p>
        )}
        {e.queue && onMove && onPriority && e.place !== null && (
          <div className="tl-controls">
            <button
              type="button"
              className="quiet small"
              disabled={busy || !e.queue.canMoveUp}
              aria-label={`Move ${e.ref ?? e.title} up`}
              onClick={() => onMove("up")}
            >
              ↑ Up
            </button>
            <button
              type="button"
              className="quiet small"
              disabled={busy || !e.queue.canMoveDown}
              aria-label={`Move ${e.ref ?? e.title} down`}
              onClick={() => onMove("down")}
            >
              ↓ Down
            </button>
            {e.queue.placement && onPlace && (
              <button
                type="button"
                className="quiet small"
                disabled={busy}
                onClick={() => onPlace(!e.queue!.placement!.before)}
              >
                {e.queue.placement.before
                  ? "Do it after the milestones"
                  : "Do it before the milestones"}
              </button>
            )}
            <label className="small">
              Priority{" "}
              <select
                value={e.queue.priority}
                disabled={busy}
                onChange={(ev) => onPriority(ev.target.value as QueuePriority)}
              >
                {PRIORITY.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {e.ref && (
          <details className="tl-details small muted">
            <summary>Details</summary>
            <span>Its reference: {e.ref}</span>
          </details>
        )}
      </div>
    </li>
  );
}

function placeWords(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
