import { useId, useState } from "react";
import {
  ApiError,
  type IntakeItemView,
  type IntakeView as IntakeData,
  NotCurrentLink,
  type ReadingView,
  type ShortLineView,
} from "../api";
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
              Send
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
        <h2>Open: still being worked on</h2>
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
      </section>

      {v.readings
        .filter((r) => r.shortList)
        .map((r, index) => (
          <ReadingCard
            key={r.id}
            reading={r}
            busy={busy}
            latest={index === 0}
            onDecide={(list, at, choice, reason) =>
              void act(() => api.decideLine(r.id, { list, index: at, choice, reason }))
            }
            onBackToWhy={() =>
              void act(
                () => api.backToWhy(r.id),
                "Going back to Why. The conversation tab asks you the first question.",
              )
            }
          />
        ))}
      {v.readings.some((r) => r.status === "failed") && (
        <p className="muted small">
          An earlier reading did not finish. Its items stayed held, and the next reading takes them
          in again.
        </p>
      )}

      <FeedbackCard
        view={v}
        busy={busy}
        onNewLink={() =>
          void act(
            () => api.newFeedbackLink(softwareId),
            "Made a new feedback link. The old one no longer works.",
          )
        }
      />
      <GithubCard
        view={v}
        busy={busy}
        onRead={() => void act(() => api.readIssuesNow(softwareId), "Read the GitHub issues.")}
      />

      <section aria-label="Every item">
        <h2>Done or decided</h2>
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
      {item.senderNote && <p className="muted small">{item.senderNote}</p>}
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

const CHOICE_WORDS = {
  work: "You turned it into work.",
  keep: "You kept its items held.",
  close: "You closed its items.",
} as const;

/** One reading's short list: what people want, how many are asking, and the operator's say on each line. */
function ReadingCard({
  reading,
  busy,
  latest,
  onDecide,
  onBackToWhy,
}: {
  reading: ReadingView;
  busy: boolean;
  latest: boolean;
  onDecide: (
    list: "wanted" | "recurring",
    index: number,
    choice: "work" | "keep" | "close",
    reason?: string,
  ) => void;
  onBackToWhy: () => void;
}) {
  const list = reading.shortList!;
  const heading = `What ${plural(reading.items.length, "held item")} said together`;
  const body = (
    <>
      <p className="muted small">
        Read {when(reading.created)}, because {reading.triggerWords}. For each line you can turn it
        into work, keep its items held, or close them. The people who sent them see the outcome.
      </p>
      {list.backToWhy && list.evidence && (
        <div className="card note" role="alert">
          <p>
            <strong>People may not want what this software does.</strong> {list.evidence}
          </p>
          <p>
            Going back to Why means asking again who this is for and which problem is worth solving:
            the wrong problem may have been solved, or there may be other problems. Nothing changes
            unless you choose it.
          </p>
          {reading.sentBack ? (
            <p className="muted small">
              You went back to Why from this reading. The conversation tab has the questions.
            </p>
          ) : (
            <button type="button" className="primary" disabled={busy} onClick={onBackToWhy}>
              Go back to Why
            </button>
          )}
        </div>
      )}
      <Lines
        title="What people seem to want"
        lines={list.wanted}
        which="wanted"
        {...{ busy, onDecide }}
      />
      <Lines
        title="What keeps coming up"
        lines={list.recurring}
        which="recurring"
        {...{ busy, onDecide }}
      />
      <p>
        <strong>Purpose and users:</strong> {list.purpose}
      </p>
    </>
  );
  return latest ? (
    <section className="card" aria-label={heading}>
      <h2>{heading}</h2>
      {body}
    </section>
  ) : (
    <details className="card">
      <summary>{heading}</summary>
      {body}
    </details>
  );
}

function Lines({
  title,
  lines,
  which,
  busy,
  onDecide,
}: {
  title: string;
  lines: ShortLineView[];
  which: "wanted" | "recurring";
  busy: boolean;
  onDecide: (
    list: "wanted" | "recurring",
    index: number,
    choice: "work" | "keep" | "close",
    reason?: string,
  ) => void;
}) {
  if (lines.length === 0) return null;
  return (
    <>
      <h3>{title}</h3>
      <ul className="short-lines">
        {lines.map((line, index) => (
          <li key={`${which}-${index}`} className="short-line">
            <p>
              {line.text} <strong>({plural(line.count, "item")})</strong>
            </p>
            <details>
              <summary>Items behind it</summary>
              <ul>
                {line.items.map((i) => (
                  <li key={i.ref}>
                    <strong>{i.ref}</strong> {i.text}
                  </li>
                ))}
              </ul>
            </details>
            {line.decision ? (
              <p className="muted small">
                {CHOICE_WORDS[line.decision.choice]}
                {line.decision.reason ? ` Because: ${line.decision.reason}` : ""}
              </p>
            ) : (
              <p className="line-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDecide(which, index, "work")}
                >
                  Turn into work
                </button>{" "}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDecide(which, index, "keep")}
                >
                  Keep holding
                </button>{" "}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDecide(which, index, "close")}
                >
                  Close them
                </button>
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/** The feedback page for the software's own users: its link, and who can reach it. */
function FeedbackCard({
  view,
  busy,
  onNewLink,
}: {
  view: IntakeData;
  busy: boolean;
  onNewLink: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = view.feedback ? `${window.location.origin}${view.feedback.path}` : null;
  return (
    <section className="card" aria-label="Feedback page">
      <h2>Feedback page for this software's users</h2>
      {link ? (
        <>
          <p className="muted small">
            A plain page where anyone you give the link to can tell you what is wrong or what they
            would like. What they write comes in here as intake, and they get a link that shows
            where their feedback stands. Giving them the link is your choice; premise never sends
            it.
          </p>
          <p>
            <a href={link} target="_blank" rel="noreferrer">
              {link}
            </a>{" "}
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </p>
          <p>
            <strong>Who can reach it:</strong> only people using this computer, because premise
            listens on this machine only. People elsewhere cannot open it; for them, GitHub issues
            work once this software has a GitHub repository.
          </p>
          <p>
            <button type="button" disabled={busy} onClick={onNewLink}>
              Make a new link
            </button>{" "}
            <span className="muted small">The old link stops working. Use it if it leaked.</span>
          </p>
        </>
      ) : (
        <p className="muted small">Feedback pages are turned off in premise's settings.</p>
      )}
    </section>
  );
}

/** GitHub issues as a source of intake. */
function GithubCard({
  view,
  busy,
  onRead,
}: {
  view: IntakeData;
  busy: boolean;
  onRead: () => void;
}) {
  const g = view.github;
  return (
    <section className="card" aria-label="GitHub issues">
      <h2>GitHub issues</h2>
      {g.repository ? (
        <>
          <p className="muted small">
            premise reads the open issues of {g.repository} every {plural(g.everyMinutes, "minute")}{" "}
            and takes each new one in. {plural(g.taken, "issue")} so far. When one is held, merged,
            answered, closed or has a change running, premise asks you before it comments on the
            issue, since a comment is public and in your name.
          </p>
          {g.problem && <Problem>{g.problem}</Problem>}
          <p>
            <button type="button" disabled={busy} onClick={onRead}>
              Read the issues now
            </button>{" "}
            {g.lastRead && <span className="muted small">Last read {when(g.lastRead)}.</span>}
          </p>
        </>
      ) : (
        <p className="muted small">
          This software has no GitHub repository yet, so there are no issues to read. Its code stays
          on this machine until you ask premise to put it on GitHub; then its issues come in here.
        </p>
      )}
    </section>
  );
}
