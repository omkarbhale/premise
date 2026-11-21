import { useId, useState } from "react";
import { ApiError, type IntakeItemView, NotCurrentLink } from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { plural, when } from "../words";
import { Empty, Problem, Term } from "./Badges";

/** Statuses that are still open, shown first. */
const OPEN = new Set(["taken", "triaging", "asked", "waiting", "working"]);

/**
 * A software's intake (docs/specs/intake.md): report a problem or a wish, see where each item
 * stands in plain words, take a merged, closed or held item in after all, and read held items
 * together.
 */
export function IntakeView({
  softwareId,
  copyNotReady,
}: {
  softwareId: string;
  copyNotReady?: boolean;
}) {
  const { api, version, notCurrent, refresh } = useSession();
  const view = useLoad(() => api.intake(softwareId), [softwareId], version, notCurrent);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();

  async function act(work: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setProblem(null);
    setSaid(null);
    try {
      await work();
      if (done) setSaid(done);
      refresh();
    } catch (error) {
      if (error instanceof NotCurrentLink) notCurrent();
      else setProblem((error as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function report() {
    if (busy || !text.trim()) return;
    await act(async () => {
      const item = await api.reportIntake(softwareId, text);
      setText("");
      setSaid(
        `Taken as ${item.ref}. An agent reads it against the record next; it is listed below.`,
      );
    });
  }

  if (view.state === "loading") return <p className="muted">Loading intake…</p>;
  if (view.state === "error") return <Problem>{view.message}</Problem>;
  const v = view.data;
  const open = v.items.filter((i) => OPEN.has(i.status));
  const settled = v.items.filter((i) => !OPEN.has(i.status));

  return (
    <div className="intake">
      <p className="muted small">
        <Term term="intake">Intake</Term> Anything you say in the conversation that is not an
        answer, and anything reported here, is taken in. An agent reads it against the record and
        decides where it goes: most items become new work on the line. You can change its mind on
        anything below.
      </p>

      {copyNotReady ? (
        <p className="note" role="status">
          premise is still copying this software, or could not copy it, so there is nothing to
          report a problem against yet. This box opens once the copy is ready.
        </p>
      ) : (
        <form
          className="card say"
          onSubmit={(e) => {
            e.preventDefault();
            void report();
          }}
        >
          <h2>
            <label htmlFor={inputId}>Report a problem or a wish</label>
          </h2>
          <p id={hintId} className="muted small">
            Say what is wrong, or what you would like, in your own words. One thing at a time works
            best.
          </p>
          <div className="say-row">
            <textarea
              id={inputId}
              rows={3}
              value={text}
              aria-describedby={hintId}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" className="primary" disabled={busy || !text.trim()}>
              Report
            </button>
          </div>
        </form>
      )}
      {problem && <Problem>{problem}</Problem>}
      {said && (
        <p className="note" role="status">
          {said}
        </p>
      )}

      <section aria-label="Open items">
        <h2>Open</h2>
        {open.length === 0 ? (
          <p className="empty-line">Nothing is being worked on from intake right now.</p>
        ) : (
          <ul className="intake-items">
            {open.map((item) => (
              <Item key={item.id} item={item} busy={busy} onUndo={undefined} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Held for a reading" className="card">
        <div className="section-head">
          <h2>Held for a reading</h2>
          <button
            type="button"
            disabled={busy || v.held === 0 || v.reading}
            onClick={() =>
              void act(
                () => api.readHeldNow(softwareId),
                "Reading the held items together. The short list comes to you under Waiting on you.",
              )
            }
          >
            Read the held items now
          </button>
        </div>
        <p className="muted small">
          Only items that mean little one at a time are held, such as opinions on whether the
          software is useful. They are read together when {v.readingWhen.heldCount} are held, after{" "}
          {v.readingWhen.days} days, or when you ask, so one voice does not pull the software back
          and forth.
        </p>
        <p>
          {v.reading
            ? "A reading is under way."
            : v.held === 0
              ? "Nothing is held."
              : `${plural(v.held, "item")} held.`}
        </p>
        {v.readings.length > 0 && (
          <details>
            <summary>Earlier readings ({v.readings.length})</summary>
            <ul>
              {v.readings.map((r) => (
                <li key={r.id}>
                  {when(r.created)}, because {r.triggerWords}: {r.items.join(", ")}.{" "}
                  {r.status === "failed"
                    ? "It did not finish."
                    : r.shortList
                      ? [...r.shortList.wanted, ...r.shortList.recurring].join(" ")
                      : "Under way."}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section aria-label="Every item">
        <h2>Everything taken in</h2>
        {v.items.length === 0 ? (
          <Empty>
            Nothing has come in yet. Say something in the conversation, or report a problem or a
            wish above.
          </Empty>
        ) : settled.length === 0 ? (
          <p className="empty-line">Every item is still open, above.</p>
        ) : (
          <ul className="intake-items">
            {settled.map((item) => (
              <Item
                key={item.id}
                item={item}
                busy={busy}
                onUndo={
                  item.canUndo
                    ? () =>
                        void act(
                          () => api.undoIntake(item.id),
                          `${item.ref} is taken in: it goes onto the line as new work.`,
                        )
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Item({
  item,
  busy,
  onUndo,
}: {
  item: IntakeItemView;
  busy: boolean;
  onUndo: (() => void) | undefined;
}) {
  return (
    <li className={`card intake-item intake-${item.status}`}>
      <p>
        <strong>{item.ref}</strong> <span className="said">{item.text}</span>
      </p>
      <p className="intake-where" role="status">
        {item.where}
      </p>
      <p className="muted small">
        {item.sourceWords}, {when(item.received)}
        {item.kindWords && <>; read as {item.kindWords}</>}
        {item.routedBy === "operator" && "; you decided where it goes"}
        {item.routedBy === "default" && "; not read by an agent, so it went in normally"}
      </p>
      {item.answer && <p className="intake-answer">{item.answer}</p>}
      {(item.reason || item.touches.length > 0) && (
        <details>
          <summary>Why it went there</summary>
          {item.reason && <p>{item.reason}</p>}
          {item.touches.length > 0 && (
            <ul>
              {item.touches.map((t) => (
                <li key={t.id}>
                  Touches {t.id}: {t.reason}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      {onUndo && (
        <p>
          <button type="button" disabled={busy} onClick={onUndo}>
            {item.status === "held" ? "Take it in now" : "Undo: take it in after all"}
          </button>
        </p>
      )}
    </li>
  );
}
