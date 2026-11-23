import { useEffect, useId, useState } from "react";
import {
  ApiError,
  type AskAnswer,
  type AskItem,
  type AskView,
  type ItemAnswer,
  NotCurrentLink,
  type ScopeCut,
  type ScopePlace,
  type ScopeTier,
} from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { whereNow } from "../../../src/shared/stages";
import { ASK_KIND_LABEL, TERMS, markLabel, plural } from "../words";
import { Problem, Term } from "./Badges";
import { ClaimAreaLink } from "./Claims";

type Decision = ItemAnswer["decision"];

/** Items shown at once in a long list; the rest are on further pages. */
const PAGE_SIZE = 12;

interface ItemState {
  decision: Decision;
  text: string;
  reason: string;
  /** For a milestone: stop after it until the operator says go on. */
  wait?: boolean;
}

/** One ask, answerable in place. Every kind says its role, what to do, and what happens after. */
export function AskCard({ ask, showSoftware = false }: { ask: AskView; showSoftware?: boolean }) {
  const { api, notCurrent, refresh, softwares, roles } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const titleId = useId();
  // The first time this question is in front of someone counts for the measures.
  const isOpen = ask.status === "open";
  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    let sent = false;
    const tell = () => {
      if (sent || document.visibilityState !== "visible") return;
      sent = true;
      api.shown(ask.id).catch(() => {});
    };
    tell();
    document.addEventListener("visibilitychange", tell);
    return () => document.removeEventListener("visibilitychange", tell);
  }, [api, ask.id, isOpen]);
  // An approval can be asked long after its stage began: say where the software is now.
  const nowStage =
    ask.kind === "approval" && ask.status === "open"
      ? (softwares?.find((sw) => sw.id === ask.softwareId)?.stage ?? ask.stage)
      : ask.stage;

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
        {(roles?.length ?? 0) > 0 && (
          <span className="chip chip-role" title={TERMS.role}>
            For the {ask.role}
          </span>
        )}
        <span className="chip">{ASK_KIND_LABEL[ask.kind]}</span>
        {showSoftware && <span className="chip chip-software">{ask.softwareName}</span>}
        {nowStage && (
          <span className="muted small">
            {ask.kind === "approval" ? "Now: " : ""}
            {whereNow(
              nowStage,
              ask.items.some((i) => i.mark === "recovered"),
            )}
          </span>
        )}
      </header>
      <h3 id={titleId}>{ask.title}</h3>
      {open ? (
        <>
          <p className="instruction">{ask.instruction}</p>
          {ask.kind === "say-back" && <Term term="sayBack">What is a say back?</Term>}
          {ask.struckBefore && ask.struckBefore.length > 0 && (
            <div className="struck-before" role="note">
              {ask.struckBefore.map((st) => (
                <p key={`${st.text}-${st.reason}`} className="small">
                  <strong>You struck:</strong> {st.text} <strong>because:</strong> {st.reason}
                </p>
              ))}
              <p className="muted small">This list was redone with that in mind.</p>
            </div>
          )}
          {ask.milestone && <TryIt softwareId={ask.softwareId} />}
          {ask.kind === "say-back" && ask.items.some((i) => i.mark === "recovered") && (
            <p className="note small" role="note">
              <strong>Before you go on:</strong> once premise has taken it on, make changes through
              premise. If you or others still change it by hand outside premise, its record drifts
              from the code: premise cannot follow such changes yet.
            </p>
          )}
          {(ask.kind === "draft" || ask.kind === "say-back") && (
            <ItemsAnswer ask={ask} busy={busy} onSend={send} />
          )}
          {ask.kind === "question" && <QuestionAnswer ask={ask} busy={busy} onSend={send} />}
          {ask.kind === "approval" && <ApprovalAnswer ask={ask} busy={busy} onSend={send} />}
          {ask.kind === "needed" && <NeededAnswer ask={ask} busy={busy} onSend={send} />}
          {ask.kind === "proposal" && <ProposalAnswer ask={ask} busy={busy} onSend={send} />}
          {ask.kind === "scope" && <ScopeAnswer ask={ask} busy={busy} onSend={send} />}
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
  const recovered = ask.items.some((i) => i.mark === "recovered");
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

  // A long list (such as a record recovered from existing code) is grouped and paged, but stays
  // one list answered once: items on pages not opened are kept.
  const pages = Math.max(1, Math.ceil(ask.items.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  const [seen, setSeen] = useState(1);
  const shown = ask.items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const runs: { group: string | undefined; start: number; items: AskItem[] }[] = [];
  shown.forEach((item, i) => {
    const last = runs.at(-1);
    if (last && last.group === item.group) last.items.push(item);
    else runs.push({ group: item.group, start: page * PAGE_SIZE + i + 1, items: [item] });
  });
  const go = (to: number) => {
    setPage(to);
    setSeen((n) => Math.max(n, to + 1));
  };

  const renderItem = (item: AskItem) => {
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
          {/\bclaim (an? )?(area|part)\b/i.test(item.text) && (
            <span className="small">
              <ClaimAreaLink softwareId={ask.softwareId} />
            </span>
          )}
          {item.follows && (
            <span className="follows small">
              Follows what you taught premise ({item.follows.label}): {item.follows.text}
            </span>
          )}
        </div>
        <div className="item-actions" role="group" aria-label={`What to do with: ${item.text}`}>
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
  };

  return (
    <>
      {runs.map((run) => (
        <div key={`${run.group ?? ""}-${run.start}`} className="item-run">
          {run.group && <h4 className="item-group">{run.group}</h4>}
          <ol className="items" start={run.start}>
            {run.items.map(renderItem)}
          </ol>
        </div>
      ))}
      {pages > 1 && (
        <nav className="pager" aria-label="Pages of this list">
          <button type="button" disabled={page === 0} onClick={() => go(page - 1)}>
            Previous
          </button>
          <span className="small" aria-live="polite">
            Page {page + 1} of {pages}
          </span>
          <button type="button" disabled={page === pages - 1} onClick={() => go(page + 1)}>
            Next
          </button>
          {seen < pages && (
            <span className="muted small">
              Items on pages you have not opened are kept when you confirm.
            </span>
          )}
        </nav>
      )}
      <div className="actions">
        <button type="button" className="primary" disabled={busy} onClick={confirm}>
          {busy
            ? "Sending…"
            : recovered
              ? "Confirm: the rest is right"
              : sayBack
                ? "Confirm what I understood"
                : "Confirm this list"}
        </button>
        <span className="muted small" aria-live="polite">
          {plural(kept, "kept", "kept")}, {plural(struck, "struck", "struck")}
          {!sayBack && `, ${plural(edited, "edited", "edited")}`}
        </span>
      </div>
    </>
  );
}

/** Choosing "do not build it" ends the work, so it asks once more. */
const ENDS_THE_WORK = /^do not build/i;

function QuestionAnswer({ ask, busy, onSend }: AnswerProps) {
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [struck, setStruck] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const inputId = useId();
  const reasonId = useId();
  // What exists: findings are one line each and can be struck one by one.
  const findings = ask.items.some((i) => i.mark === "found");
  const send = (answer: string) => {
    const struckList = Object.entries(struck).map(([key, why]) => ({
      key,
      ...(why.trim() && { reason: why.trim() }),
    }));
    // A reason is only asked for when the choice differs from premise's best guess.
    const against = !!ask.bestAttempt && answer !== ask.bestAttempt;
    onSend({
      kind: "text",
      text: answer,
      ...(struckList.length > 0 && { struck: struckList }),
      ...(against && reason.trim() && { reason: reason.trim() }),
    });
  };
  // One click answers; only an answer that ends the work asks once more.
  const choose = (answer: string) => {
    const clean = answer.trim();
    if (!clean) return;
    if (ENDS_THE_WORK.test(clean)) setConfirming(clean);
    else send(clean);
  };
  if (confirming) {
    return (
      <div className="confirm" role="group" aria-label="Are you sure?">
        <p>
          <strong>Do not build it?</strong> premise stops here and builds nothing. You can change
          your mind later by sending it back to any stage.
        </p>
        <div className="actions">
          <button type="button" className="danger" disabled={busy} onClick={() => send(confirming)}>
            Yes, do not build it
          </button>
          <button type="button" onClick={() => setConfirming(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      {ask.items.length > 0 && !findings && (
        <ul className="items plain">
          {ask.items.map((i) => (
            <li key={i.key}>
              {i.text} <span className={`mark mark-${i.mark}`}>{markLabel(i)}</span>
            </li>
          ))}
        </ul>
      )}
      {findings && (
        <>
          <p className="small muted">
            Each line is one finding, with where it came from and whether premise read it. Strike
            any you do not trust; struck findings are left out of the record.
          </p>
          <ul className="items findings">
            {ask.items.map((i) => {
              const isStruck = i.key in struck;
              return (
                <li key={i.key} className={isStruck ? "struck" : undefined}>
                  <span className={isStruck ? "struck-text" : undefined}>{i.text}</span>{" "}
                  <span className={`mark mark-${i.mark}`}>{markLabel(i)}</span>
                  {i.source && <span className="small muted"> · {i.source}</span>}{" "}
                  <button
                    type="button"
                    className="link"
                    disabled={busy}
                    aria-pressed={isStruck}
                    aria-label={`${isStruck ? "Keep" : "Strike"}: ${i.text}`}
                    onClick={() =>
                      setStruck((now) => {
                        const next = { ...now };
                        if (i.key in next) delete next[i.key];
                        else next[i.key] = "";
                        return next;
                      })
                    }
                  >
                    {isStruck ? "Keep it" : "Strike"}
                  </button>
                  {i.detail && (
                    <details className="small">
                      <summary>Details</summary>
                      <p>{i.detail}</p>
                    </details>
                  )}
                  {isStruck && (
                    <input
                      type="text"
                      className="reason"
                      aria-label={`Why strike: ${i.text}`}
                      placeholder="Why? (optional)"
                      value={struck[i.key] ?? ""}
                      onChange={(e) => setStruck((now) => ({ ...now, [i.key]: e.target.value }))}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {findings && ask.bestAttempt && (
        <>
          <label htmlFor={reasonId} className="small">
            If you choose something other than premise's best guess, say why (optional, one line)
          </label>
          <input
            id={reasonId}
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </>
      )}
      {ask.bestAttempt && (
        <p className="best">
          premise's best guess: <strong>{ask.bestAttempt}</strong>{" "}
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() => choose(ask.bestAttempt!)}
          >
            Go with this
          </button>
        </p>
      )}
      {ask.choices && ask.choices.length > 0 && (
        <div className="choices" role="group" aria-label="Pick an answer">
          {ask.choices.map((choice, i) => (
            <button
              type="button"
              key={choice}
              // At a milestone, going on is the expected answer; going back is the exception.
              className={ask.milestone ? (i === 0 ? "primary" : "quiet") : undefined}
              disabled={busy}
              onClick={() => choose(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
      )}
      {/* A milestone's answer is one of its two choices; anything else belongs in the conversation. */}
      {!ask.milestone && (
        <QuestionText
          inputId={inputId}
          label={ask.choices?.length ? "Or write your own answer" : "Your answer"}
          text={text}
          setText={setText}
          busy={busy}
          onAnswer={() => choose(text)}
        />
      )}
    </>
  );
}

function QuestionText({
  inputId,
  label,
  text,
  setText,
  busy,
  onAnswer,
}: {
  inputId: string;
  label: string;
  text: string;
  setText: (text: string) => void;
  busy: boolean;
  onAnswer: () => void;
}) {
  return (
    <>
      <label htmlFor={inputId} className="small">
        {label}
      </label>
      <textarea id={inputId} rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={busy || !text.trim()}
          onClick={onAnswer}
        >
          {busy ? "Sending…" : "Answer"}
        </button>
      </div>
    </>
  );
}

/**
 * For a milestone that waits on you: how to try the software, and where its report is. "Open it"
 * only when there is a link to open; for command-line software, the command itself.
 */
function TryIt({ softwareId }: { softwareId: string }) {
  const { api, version, notCurrent, go } = useSession();
  const run = useLoad(() => api.run(softwareId), [softwareId], version, notCurrent);
  const r = run.state === "ready" ? run.data : null;
  const toReport = () => go?.(softwareId, "report");
  return (
    <div className="try-it">
      {r?.command && !r.link && (
        <p className="small">
          To try it, {r.kind === "command" ? "type this in a terminal" : "start it like this"}
          {r.folder ? (
            <>
              , in <code>{r.folder}</code>
            </>
          ) : null}
          : <code>{r.command}</code>
        </p>
      )}
      <div className="actions">
        {r?.link ? (
          <a className="button-link" href={r.link} target="_blank" rel="noreferrer">
            Open it
          </a>
        ) : (
          !r?.command && (
            <button type="button" onClick={toReport}>
              Show me how to try it
            </button>
          )
        )}
        <button type="button" onClick={toReport}>
          See the report
        </button>
      </div>
    </div>
  );
}

function ApprovalAnswer({ ask, busy, onSend }: AnswerProps) {
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const approval = ask.approval;
  return (
    <>
      {approval?.reality && (
        // What really happens, from the server, for this kind of action: true in every mode, so a
        // card never says nothing real happens when something does.
        <p className={approval.real ? "note small reality-real" : "note small"} role="note">
          <strong>{approval.real ? "This is real." : "Nothing happens yet."}</strong>{" "}
          {approval.reality}
        </p>
      )}
      {approval && (
        <dl className="approval">
          <dt>What will happen</dt>
          <dd>{approval.action}</dd>
          <dt>Why</dt>
          <dd>{approval.why}</dd>
          <dt>Why premise asks now</dt>
          <dd>
            {approval.whyNow ? `${approval.whyNow} ` : ""}
            {approval.waiting ? `Waiting on your answer: ${approval.waiting}. ` : ""}
            Nothing like this happens without your say; everything else carries on meanwhile.
          </dd>
          <dt>The rule behind it</dt>
          <dd>{approval.floor}</dd>
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
              title="Later requests of exactly this kind of action, for this software only, go ahead without asking. You can withdraw this on the Line tab."
              onClick={() => onSend({ kind: "approval", decision: "approve-kind" })}
            >
              Approve {ask.approval.kindLabel} for {ask.softwareName} from now on
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

/** Something only a person can do: the exact steps, then done or not (decision 0196). */
function NeededAnswer({ ask, busy, onSend }: AnswerProps) {
  const [cannot, setCannot] = useState(false);
  const [reason, setReason] = useState("");
  const steps =
    ask.items.length > 0 ? (
      <ol className="steps">
        {ask.items.map((i) => (
          <li key={i.key}>{i.text}</li>
        ))}
      </ol>
    ) : null;
  return cannot ? (
    <>
      {steps}
      <NeededCannot
        busy={busy}
        reason={reason}
        setReason={setReason}
        onSend={onSend}
        back={() => setCannot(false)}
      />
    </>
  ) : (
    <>
      {steps}
      {ask.secret && (
        <p className="note small" role="note">
          premise never takes the secret on this page. After you mark this done it looks for{" "}
          <code>{ask.secret.key}</code> in <code>{ask.secret.file}</code>, without reading the value
          out.
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => onSend({ kind: "needed", decision: "done" })}
        >
          It is done
        </button>
        <button type="button" disabled={busy} onClick={() => setCannot(true)}>
          I cannot do this…
        </button>
      </div>
    </>
  );
}

function NeededCannot({
  busy,
  reason,
  setReason,
  onSend,
  back,
}: {
  busy: boolean;
  reason: string;
  setReason: (r: string) => void;
  onSend: (answer: AskAnswer) => void;
  back: () => void;
}) {
  return (
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
        <button type="button" onClick={back}>
          Back
        </button>
      </div>
    </>
  );
}

/**
 * A proposal for a claimed area (decision 0102): one or two options to keep, or say what to change.
 * What the role decides goes into the record as taste, and the area is built that way.
 */
function ProposalAnswer({ ask, busy, onSend }: AnswerProps) {
  const [changing, setChanging] = useState(false);
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<string | null>(
    ask.items.length === 1 ? ask.items[0]!.key : null,
  );
  const several = ask.items.length > 1;
  return (
    <>
      {several ? (
        <fieldset className="proposal-options">
          <legend>Pick the one to keep</legend>
          {ask.items.map((i) => (
            <label key={i.key} className={`proposal-option ${choice === i.key ? "chosen" : ""}`}>
              <input
                type="radio"
                name={`proposal-${ask.id}`}
                checked={choice === i.key}
                onChange={() => setChoice(i.key)}
              />
              <span>{i.text}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        ask.items.length === 1 && <p className="proposal-one">{ask.items[0]!.text}</p>
      )}
      {changing ? (
        <>
          <textarea
            aria-label="What to change"
            placeholder="Say how you want it, in your own words"
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
              Build it this way
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
            disabled={busy || (ask.items.length > 0 && choice === null)}
            onClick={() =>
              onSend(
                choice
                  ? { kind: "proposal", decision: "accept", choice }
                  : { kind: "proposal", decision: "accept" },
              )
            }
          >
            {ask.items.length === 0
              ? "Let premise decide"
              : several
                ? choice
                  ? "Keep this one"
                  : "Pick one to keep"
                : "Keep it"}
          </button>
          <button type="button" disabled={busy} onClick={() => setChanging(true)}>
            {ask.items.length === 0 ? "Say how I want it…" : "Change something…"}
          </button>
        </div>
      )}
    </>
  );
}

const TIER_HEADINGS: Record<ScopeTier, string> = {
  asked: "What you asked for",
  recommended: "premise recommends adding",
  could: "premise could also add",
};

const PLACE_LABELS: Record<ScopePlace, string> = {
  first: "First version",
  later: "Later milestone",
  out: "Leave out",
};

/** Where a tier goes under a cut; the same rule as the server's (src/line/scope.ts). */
function placeFor(tier: ScopeTier, cut: ScopeCut["id"]): ScopePlace {
  if (tier === "asked") return "first";
  if (tier === "recommended") return cut === "asked" ? "out" : "later";
  return cut === "everything" ? "later" : "out";
}

/** The scope check: one click picks a cut; any item can be moved; one confirm. */
function ScopeAnswer({ ask, busy, onSend }: AnswerProps) {
  const scope = ask.scope;
  const [cut, setCut] = useState<ScopeCut["id"]>(scope?.preselected ?? "recommended");
  const [moved, setMoved] = useState<Record<string, ScopePlace>>({});
  const place = (item: AskItem): ScopePlace =>
    moved[item.key] ?? placeFor(item.tier ?? "asked", cut);
  const counts = { first: 0, later: 0, out: 0 } as Record<ScopePlace, number>;
  for (const item of ask.items) counts[place(item)] += 1;

  return (
    <>
      {scope && (
        <fieldset className="scope-cuts">
          <legend>How much to build</legend>
          {scope.cuts.map((c) => (
            <label key={c.id} className={`scope-cut ${cut === c.id ? "chosen" : ""}`}>
              <input
                type="radio"
                name={`scope-${ask.id}`}
                checked={cut === c.id}
                onChange={() => {
                  setCut(c.id);
                  setMoved({});
                }}
              />
              <strong>{c.label}</strong>{" "}
              <span className="muted small">
                about {plural(c.minutes, "minute")} (
                <span className="define" title={TERMS.agentSession}>
                  {plural(c.sessions, "agent session")}
                </span>
                ){c.sameCost && <span className="same-cost"> · {c.sameCost}</span>}
              </span>
            </label>
          ))}
          <p className="muted small">{scope.estimateNote}</p>
        </fieldset>
      )}
      {(["asked", "recommended", "could"] as const).map((tier) => {
        const items = ask.items.filter((i) => (i.tier ?? "asked") === tier);
        if (items.length === 0) return null;
        return (
          <section key={tier} className="scope-tier">
            <h4>{TIER_HEADINGS[tier]}</h4>
            <ol className="items">
              {items.map((item) => (
                <li key={item.key} className={`item item-${place(item)}`}>
                  <div className="item-text">
                    <span className="text">
                      <strong>{item.key}</strong> {item.text}
                    </span>
                    <span className={`mark mark-${item.mark}`}>{markLabel(item)}</span>
                  </div>
                  <div className="small">
                    <select
                      aria-label={`Where ${item.key} goes`}
                      value={place(item)}
                      onChange={(e) =>
                        setMoved((all) => ({ ...all, [item.key]: e.target.value as ScopePlace }))
                      }
                    >
                      {(["first", "later", "out"] as const).map((p) => (
                        <option key={p} value={p}>
                          {PLACE_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={busy || counts.first === 0}
          onClick={() =>
            onSend({
              kind: "scope",
              items: ask.items.map((item) => ({ key: item.key, place: place(item) })),
            })
          }
        >
          {busy ? "Sending…" : "Build this much"}
        </button>
        <span className="muted small" aria-live="polite">
          {counts.first} in the first version, {counts.later} later, {counts.out} left out
          {counts.first === 0 && ". Put at least one item in the first version."}
        </span>
      </div>
    </>
  );
}
