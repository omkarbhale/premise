import { useId, useState } from "react";
import {
  ApiError,
  type AskAnswer,
  type AskItem,
  type AskView,
  type ItemAnswer,
  NotCurrentLink,
} from "../api";
import { useSession } from "../context";
import { whereNow } from "../../../src/shared/stages";
import { ASK_KIND_LABEL, TERMS, markLabel, plural } from "../words";
import { Problem, Term } from "./Badges";

type Decision = ItemAnswer["decision"];

interface ItemState {
  decision: Decision;
  text: string;
  reason: string;
  /** For a milestone: stop after it until the operator says go on. */
  wait?: boolean;
}

/** One ask, answerable in place. Every kind says its role, what to do, and what happens after. */
export function AskCard({ ask, showSoftware = false }: { ask: AskView; showSoftware?: boolean }) {
  const { api, notCurrent, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const titleId = useId();

  async function send(answer: AskAnswer) {
    setBusy(true);
    setProblem(null);
    try {
      await api.answer(ask.id, answer);
      refresh();
    } catch (error) {
      if (error instanceof NotCurrentLink) notCurrent();
      else {
        setProblem((error as ApiError).message);
        if ((error as ApiError).status === 409) refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const open = ask.status === "open";
  return (
    <article
      className={`ask ask-${ask.kind} ${open ? "" : "ask-closed"}`}
      aria-labelledby={titleId}
    >
      <header className="ask-head">
        <span className="chip chip-role" title={TERMS.role}>
          For the {ask.role}
        </span>
        <span className="chip">{ASK_KIND_LABEL[ask.kind]}</span>
        {showSoftware && <span className="chip chip-software">{ask.softwareName}</span>}
        {ask.stage && <span className="muted small">{whereNow(ask.stage)}</span>}
      </header>
      <h3 id={titleId}>{ask.title}</h3>
      {open ? (
        <>
          <p className="instruction">{ask.instruction}</p>
          {ask.kind === "say-back" && <Term term="sayBack">What is a say back?</Term>}
          {(ask.kind === "draft" || ask.kind === "say-back") && (
            <ItemsAnswer ask={ask} busy={busy} onSend={send} />
          )}
          {ask.kind === "question" && <QuestionAnswer ask={ask} busy={busy} onSend={send} />}
          {ask.kind === "approval" && <ApprovalAnswer ask={ask} busy={busy} onSend={send} />}
          {ask.kind === "needed" && <NeededAnswer busy={busy} onSend={send} />}
          {ask.kind === "proposal" && <ProposalAnswer ask={ask} busy={busy} onSend={send} />}
          {problem && <Problem>{problem}</Problem>}
        </>
      ) : (
        <p className="answered">
          {ask.status === "answered" ? "Answered" : "Withdrawn"}: {ask.answerSummary}
        </p>
      )}
    </article>
  );
}

interface AnswerProps {
  ask: AskView;
  busy: boolean;
  onSend: (answer: AskAnswer) => void;
}

function ItemsAnswer({ ask, busy, onSend }: AnswerProps) {
  const sayBack = ask.kind === "say-back";
  const [items, setItems] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(
      ask.items.map((i) => [
        i.key,
        {
          decision: "keep",
          text: i.text,
          reason: "",
          ...(i.wait !== undefined && { wait: i.wait }),
        },
      ]),
    ),
  );
  // Items added in chat while the card is open start as kept.
  const state = (item: AskItem): ItemState =>
    items[item.key] ?? {
      decision: "keep",
      text: item.text,
      reason: "",
      ...(item.wait !== undefined && { wait: item.wait }),
    };
  const set = (key: string, change: Partial<ItemState>, item: AskItem) =>
    setItems((all) => ({ ...all, [key]: { ...state(item), ...all[key], ...change } }));

  const decisions = ask.items.map((i) => state(i).decision);
  const struck = decisions.filter((d) => d === "strike").length;
  const edited = decisions.filter((d) => d === "edit").length;
  const kept = decisions.length - struck - edited;

  function confirm() {
    onSend({
      kind: "items",
      items: ask.items.map((item): ItemAnswer => {
        const s = state(item);
        if (s.decision === "strike") {
          return s.reason.trim()
            ? { key: item.key, decision: "strike", reason: s.reason.trim() }
            : { key: item.key, decision: "strike" };
        }
        const wait = item.wait !== undefined && s.wait !== undefined ? { wait: s.wait } : {};
        if (s.decision === "edit" && s.text.trim() !== item.text) {
          return { key: item.key, decision: "edit", text: s.text, ...wait };
        }
        return { key: item.key, decision: "keep", ...wait };
      }),
    });
  }

  return (
    <>
      <ol className="items">
        {ask.items.map((item) => {
          const s = state(item);
          return (
            <li key={item.key} className={`item item-${s.decision}`}>
              <div className="item-text">
                {s.decision === "edit" ? (
                  <textarea
                    aria-label={`Edit: ${item.text}`}
                    value={s.text}
                    rows={2}
                    onChange={(e) => set(item.key, { text: e.target.value }, item)}
                  />
                ) : (
                  <span className="text">{item.text}</span>
                )}
                <span className={`mark mark-${item.mark}`}>{markLabel(item)}</span>
              </div>
              <div
                className="item-actions"
                role="group"
                aria-label={`What to do with: ${item.text}`}
              >
                <button
                  type="button"
                  aria-pressed={s.decision === "keep"}
                  onClick={() => set(item.key, { decision: "keep", text: item.text }, item)}
                >
                  Keep
                </button>
                <button
                  type="button"
                  aria-pressed={s.decision === "strike"}
                  onClick={() => set(item.key, { decision: "strike" }, item)}
                >
                  Strike
                </button>
                {!sayBack && (
                  <button
                    type="button"
                    aria-pressed={s.decision === "edit"}
                    onClick={() => set(item.key, { decision: "edit" }, item)}
                  >
                    Edit
                  </button>
                )}
              </div>
              {item.wait !== undefined && s.decision !== "strike" && (
                <label className="wait small">
                  <input
                    type="checkbox"
                    checked={s.wait ?? false}
                    onChange={(e) => set(item.key, { wait: e.target.checked }, item)}
                  />
                  Stop after this milestone until I say go on
                </label>
              )}
              {s.decision === "strike" && (
                <input
                  className="reason"
                  aria-label={`Why strike: ${item.text} (optional)`}
                  placeholder="Why is it wrong? (optional)"
                  value={s.reason}
                  onChange={(e) => set(item.key, { reason: e.target.value }, item)}
                />
              )}
            </li>
          );
        })}
      </ol>
      <div className="actions">
        <button type="button" className="primary" disabled={busy} onClick={confirm}>
          {busy ? "Sending…" : sayBack ? "Confirm what I understood" : "Confirm this list"}
        </button>
        <span className="muted small" aria-live="polite">
          {plural(kept, "kept", "kept")}, {plural(struck, "struck", "struck")}
          {!sayBack && `, ${plural(edited, "edited", "edited")}`}
        </span>
      </div>
    </>
  );
}

function QuestionAnswer({ ask, busy, onSend }: AnswerProps) {
  const [text, setText] = useState("");
  const inputId = useId();
  return (
    <>
      {ask.items.length > 0 && (
        <ul className="items plain">
          {ask.items.map((i) => (
            <li key={i.key}>
              {i.text} <span className={`mark mark-${i.mark}`}>{markLabel(i)}</span>
            </li>
          ))}
        </ul>
      )}
      {ask.bestAttempt && (
        <p className="best">
          premise's best guess: <strong>{ask.bestAttempt}</strong>{" "}
          <button type="button" className="link" onClick={() => setText(ask.bestAttempt!)}>
            Use this
          </button>
        </p>
      )}
      {ask.choices && ask.choices.length > 0 && (
        <div className="choices" role="group" aria-label="Pick an answer">
          {ask.choices.map((choice) => (
            <button
              type="button"
              key={choice}
              aria-pressed={text === choice}
              onClick={() => setText(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
      )}
      <label htmlFor={inputId} className="small">
        {ask.choices?.length ? "Or write your own answer" : "Your answer"}
      </label>
      <textarea id={inputId} rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={busy || !text.trim()}
          onClick={() => onSend({ kind: "text", text: text.trim() })}
        >
          {busy ? "Sending…" : "Answer"}
        </button>
      </div>
    </>
  );
}

function ApprovalAnswer({ ask, busy, onSend }: AnswerProps) {
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      {ask.approval && (
        <dl className="approval">
          <dt>What will happen</dt>
          <dd>{ask.approval.action}</dd>
          <dt>Why</dt>
          <dd>{ask.approval.why}</dd>
          <dt>Why premise asks</dt>
          <dd>{ask.approval.floor}</dd>
        </dl>
      )}
      {refusing ? (
        <>
          <input
            aria-label="Why decline (optional)"
            placeholder="Why not? (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="actions">
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() =>
                onSend(
                  reason.trim()
                    ? { kind: "approval", decision: "refuse", reason: reason.trim() }
                    : { kind: "approval", decision: "refuse" },
                )
              }
            >
              Decline
            </button>
            <button type="button" onClick={() => setRefusing(false)}>
              Back
            </button>
          </div>
        </>
      ) : (
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => onSend({ kind: "approval", decision: "approve-once" })}
          >
            Approve once
          </button>
          {ask.approval?.kindLabel && (
            <button
              type="button"
              disabled={busy}
              title="Later requests of this kind for this software go ahead without asking. You can withdraw this on the Line tab."
              onClick={() => onSend({ kind: "approval", decision: "approve-kind" })}
            >
              Approve {ask.approval.kindLabel} for {ask.softwareName}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => setRefusing(true)}>
            Decline…
          </button>
        </div>
      )}
    </>
  );
}

function NeededAnswer({ busy, onSend }: Omit<AnswerProps, "ask">) {
  const [cannot, setCannot] = useState(false);
  const [reason, setReason] = useState("");
  return cannot ? (
    <>
      <input
        aria-label="Why it cannot be done"
        placeholder="What is in the way?"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSend({ kind: "needed", decision: "cannot", reason: reason.trim() })}
        >
          Send
        </button>
        <button type="button" onClick={() => setCannot(false)}>
          Back
        </button>
      </div>
    </>
  ) : (
    <div className="actions">
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() => onSend({ kind: "needed", decision: "done" })}
      >
        Mark done
      </button>
      <button type="button" disabled={busy} onClick={() => setCannot(true)}>
        I cannot do this…
      </button>
    </div>
  );
}

function ProposalAnswer({ ask, busy, onSend }: AnswerProps) {
  const [changing, setChanging] = useState(false);
  const [text, setText] = useState("");
  return (
    <>
      {ask.items.length > 0 && (
        <ul className="items plain">
          {ask.items.map((i) => (
            <li key={i.key}>{i.text}</li>
          ))}
        </ul>
      )}
      {changing ? (
        <>
          <textarea
            aria-label="What to change"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={busy || !text.trim()}
              onClick={() => onSend({ kind: "proposal", decision: "change", text: text.trim() })}
            >
              Ask for these changes
            </button>
            <button type="button" onClick={() => setChanging(false)}>
              Back
            </button>
          </div>
        </>
      ) : (
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => onSend({ kind: "proposal", decision: "accept" })}
          >
            Accept
          </button>
          <button type="button" disabled={busy} onClick={() => setChanging(true)}>
            Change something…
          </button>
        </div>
      )}
    </>
  );
}
