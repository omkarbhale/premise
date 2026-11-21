import { useState } from "react";
import {
  type ApiError,
  type CorrectionView,
  type ImprovementView,
  type LearningDestination,
  type LessonView,
  NotCurrentLink,
} from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { plural, when } from "../words";
import { Problem } from "./Badges";

/** Where a correction's lesson can go, in the words the page uses. */
const PLACES: { id: LearningDestination; label: string }[] = [
  { id: "software", label: "This software" },
  { id: "taste", label: "Your taste" },
  { id: "premise", label: "premise itself" },
  { id: "none", label: "Nothing to learn" },
];

function placeLabel(id: LearningDestination | null): string {
  return PLACES.find((p) => p.id === id)?.label ?? "Not decided yet";
}

/** Run one change and reload; say what went wrong in plain words. */
function useAct() {
  const { notCurrent, refresh } = useSession();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<unknown>) => {
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
    }
  };
  return { act, busy, problem };
}

/**
 * What premise learned from corrections (docs/specs/learning.md 5). The two kinds are shown apart:
 * premise adapting (lessons for this software, and your taste for every software), which agents
 * follow; and improvements for premise itself, which never change how premise works.
 */
export function Learned({ softwareId }: { softwareId: string | null }) {
  const { api, version, notCurrent } = useSession();
  const view = useLoad(
    () => api.learning(softwareId ?? undefined),
    [softwareId],
    version,
    notCurrent,
  );
  const { act, busy, problem } = useAct();

  if (view.state === "loading") return <p className="muted">Loading what premise learned…</p>;
  if (view.state === "error") return <Problem>{view.message}</Problem>;
  const v = view.data;

  return (
    <div className="learned">
      {problem && <Problem>{problem}</Problem>}
      <section className="card" aria-labelledby="adapting-title">
        <h2 id="adapting-title">What premise learned from you</h2>
        <p className="muted small">{v.explain.adapting}</p>
        {v.software && (
          <LessonList
            title={`For this software (${v.software.lines.length} of at most ${v.software.max})`}
            empty="Nothing yet. When you strike or change something premise wrote, a lesson appears here."
            lines={v.software.lines}
            busy={busy}
            act={act}
          />
        )}
        <LessonList
          title={`Your taste, for every software (${v.taste.lines.length} of at most ${v.taste.max})`}
          empty="Nothing yet. A correction about how you like things done, whatever the software, appears here."
          lines={v.taste.lines}
          busy={busy}
          act={act}
          showSoftware
        />
      </section>

      <section className="card" aria-labelledby="improving-title">
        <h2 id="improving-title">Improvements for premise</h2>
        <p className="muted small">{v.explain.improving}</p>
        <Improvements items={v.improvements} busy={busy} act={act} />
      </section>

      <section className="card" aria-labelledby="corrections-title">
        <h2 id="corrections-title">Your corrections, and where each went</h2>
        <p className="muted small">
          Each correction goes to exactly one place. If premise put one in the wrong place, move it
          with one click.
        </p>
        {v.corrections.length === 0 ? (
          <p className="empty-line">
            No corrections yet. Striking an item, changing one, declining a request or sending work
            back all count.
          </p>
        ) : (
          <ul className="corrections">
            {v.corrections.map((c) => (
              <Correction
                key={c.id}
                correction={c}
                busy={busy}
                act={act}
                showSoftware={softwareId === null}
              />
            ))}
          </ul>
        )}
      </section>

      {v.ended.length > 0 && (
        <details className="card">
          <summary>Lines removed recently ({v.ended.length})</summary>
          <ul>
            {v.ended.map((e) => (
              <li key={e.label}>
                <span className="muted small">{e.label}</span> {e.text}{" "}
                <span className="muted small">
                  {e.note} {when(e.ended)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

type Act = (work: () => Promise<unknown>) => Promise<void>;

function LessonList({
  title,
  empty,
  lines,
  busy,
  act,
  showSoftware = false,
}: {
  title: string;
  empty: string;
  lines: LessonView[];
  busy: boolean;
  act: Act;
  showSoftware?: boolean;
}) {
  return (
    <>
      <h3>{title}</h3>
      {lines.length === 0 ? (
        <p className="empty-line">{empty}</p>
      ) : (
        <ul className="lessons">
          {lines.map((l) => (
            <Lesson key={l.id} lesson={l} busy={busy} act={act} showSoftware={showSoftware} />
          ))}
        </ul>
      )}
    </>
  );
}

function Lesson({
  lesson,
  busy,
  act,
  showSoftware,
}: {
  lesson: LessonView;
  busy: boolean;
  act: Act;
  showSoftware: boolean;
}) {
  const { api } = useSession();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(lesson.text);
  return (
    <li className="lesson">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api.editLesson(lesson.id, text);
              setEditing(false);
            });
          }}
        >
          <textarea
            aria-label={`Edit ${lesson.label}`}
            value={text}
            rows={2}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            Save
          </button>{" "}
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setText(lesson.text);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <p>
          <span className="muted small">{lesson.label}</span> {lesson.text}
        </p>
      )}
      <p className="muted small">
        From: {lesson.source}
        {showSoftware ? ` (on ${lesson.softwareName})` : ""}.{" "}
        {lesson.uses === 0
          ? "Not used in a brief yet."
          : `Given to agents ${plural(lesson.uses, "time")}, last ${when(lesson.lastUsed)}.`}
      </p>
      {!editing && (
        <p className="actions">
          <button type="button" className="quiet" disabled={busy} onClick={() => setEditing(true)}>
            Edit
          </button>{" "}
          <button
            type="button"
            className="quiet"
            disabled={busy}
            onClick={() => void act(() => api.deleteLesson(lesson.id))}
          >
            Delete
          </button>
        </p>
      )}
    </li>
  );
}

function Improvements({ items, busy, act }: { items: ImprovementView[]; busy: boolean; act: Act }) {
  const { api, report } = useSession();
  async function save() {
    try {
      const text = await api.improvementsText();
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "premise-improvements.txt";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      report((error as Error).message);
    }
  }
  return (
    <>
      {items.length === 0 ? (
        <p className="empty-line">
          Nothing yet. When a correction shows premise's own way of working could be better (for
          example, its check said something worked and it did not), it is kept here.
        </p>
      ) : (
        <ul className="improvements">
          {items.map((imp) => (
            <li key={imp.topic}>
              <p>{imp.text}</p>
              <p className="muted small">
                Seen {imp.seen === 1 ? "once" : `${imp.seen} times`}, in {imp.softwares.join(", ")};
                last {when(imp.lastSeen)}.
              </p>
              <details>
                <summary className="small muted">Where it was seen</summary>
                <ul>
                  {imp.lessons.map((l) => (
                    <li key={l.id} className="small">
                      {l.label}: {l.source}
                    </li>
                  ))}
                </ul>
              </details>
              <button
                type="button"
                className="quiet"
                disabled={busy}
                onClick={() => void act(() => api.deleteImprovement(imp.topic))}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <p>
        <button type="button" disabled={items.length === 0} onClick={() => void save()}>
          Save as a text file
        </button>{" "}
        <span className="muted small">
          Sending them anywhere outside this machine is not built yet; when it is, premise will ask
          you first.
        </span>
      </p>
    </>
  );
}

function Correction({
  correction: c,
  busy,
  act,
  showSoftware,
}: {
  correction: CorrectionView;
  busy: boolean;
  act: Act;
  showSoftware: boolean;
}) {
  const { api } = useSession();
  return (
    <li className="correction">
      <p>
        {c.what}
        {c.said ? <> — “{c.said}”</> : null}
        {showSoftware && <span className="muted small"> ({c.softwareName})</span>}
      </p>
      {c.status === "reading" ? (
        <p className="muted small">premise is reading this to see what it teaches…</p>
      ) : (
        <>
          <p className="small">
            <strong>{placeLabel(c.destination)}</strong>
            {c.mistake && <> · {c.mistake}</>}
            {c.lessonId !== null && <span className="muted"> · L-{c.lessonId}</span>}
          </p>
          {c.reason && <p className="muted small">{c.reason}</p>}
          <p className="actions small" role="group" aria-label={`Move: ${c.what}`}>
            Move to:{" "}
            {PLACES.filter((p) => p.id !== c.destination).map((p) => (
              <button
                key={p.id}
                type="button"
                className="quiet"
                disabled={busy}
                onClick={() => void act(() => api.moveCorrection(c.id, p.id))}
              >
                {p.label}
              </button>
            ))}
          </p>
        </>
      )}
    </li>
  );
}
