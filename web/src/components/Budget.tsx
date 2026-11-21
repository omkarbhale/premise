import { useState } from "react";
import {
  ApiError,
  type BudgetInput,
  type BudgetView,
  NotCurrentLink,
  type OverrunAnswerInput,
} from "../api";
import { useSession } from "../context";
import { MockedBadge, Problem } from "./Badges";

const money = (usd: number) => `$${usd.toFixed(2)}`;

/** Read what the person typed for a budget; null when it is not a usable number. */
function readBudget(kind: "share" | "amount", text: string): BudgetInput | null {
  const n = Number(text);
  if (!text.trim() || !Number.isFinite(n) || n <= 0) return null;
  return kind === "share" ? { kind, percent: n } : { kind, usd: n };
}

/**
 * Says that a software's queue is paused because its budget is used up, what was spent on what, and
 * takes the operator's answer: raise the budget, let it finish the change it is on, or leave it
 * paused. Other softwares keep running.
 */
export function OverrunNotice({ softwareId, budget }: { softwareId: string; budget: BudgetView }) {
  const { api, notCurrent, refresh } = useSession();
  const [kind, setKind] = useState<"share" | "amount">(
    budget.kind === "share" ? "share" : "amount",
  );
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const o = budget.overrun;
  if (!o) return null;

  async function answer(input: OverrunAnswerInput) {
    setProblem(null);
    setBusy(true);
    try {
      await api.answerOverrun(softwareId, input);
      refresh();
    } catch (error) {
      if (error instanceof NotCurrentLink) notCurrent();
      else setProblem((error as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  function raise(event: React.FormEvent) {
    event.preventDefault();
    const next = readBudget(kind, value);
    if (!next) {
      setProblem(
        kind === "share"
          ? "Type a share of the week's usage as a number, such as 30."
          : "Type an amount in dollars as a number, such as 10.",
      );
      return;
    }
    void answer({ answer: "raise", budget: next });
  }

  return (
    <section className="card overrun" aria-label="Budget used up" role="status">
      <h2>Paused: budget used up {o.mocked && <MockedBadge />}</h2>
      <p>{o.message}</p>
      {o.spentByStage.length > 0 && (
        <p className="small muted">
          Spent on, by step:{" "}
          {o.spentByStage.map((l) => `${l.label} ${money(l.costUsd)} (${l.sessions})`).join(", ")}.
          {o.mocked &&
            " These dollar figures are mocked; the counts in brackets are premise's own."}
        </p>
      )}
      {o.spentByChange.length > 0 && (
        <p className="small muted">
          By change:{" "}
          {o.spentByChange.map((l) => `${l.label} ${money(l.costUsd)} (${l.sessions})`).join(", ")}.
        </p>
      )}
      {problem && <Problem>{problem}</Problem>}
      <form className="budget-raise" onSubmit={raise}>
        <fieldset disabled={busy}>
          <legend>Raise the budget</legend>
          <label>
            <input
              type="radio"
              name={`raise-${softwareId}`}
              checked={kind === "amount"}
              onChange={() => setKind("amount")}
            />{" "}
            Dollars a week
          </label>{" "}
          <label>
            <input
              type="radio"
              name={`raise-${softwareId}`}
              checked={kind === "share"}
              onChange={() => setKind("share")}
            />{" "}
            Percent of the week's usage
          </label>{" "}
          <label>
            <span className="sr-only">New budget</span>
            <input
              type="text"
              inputMode="decimal"
              size={6}
              value={value}
              placeholder={kind === "share" ? "such as 30" : "such as 10"}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>{" "}
          <button type="submit">Raise and carry on</button>
        </fieldset>
      </form>
      <div className="actions">
        <button
          type="button"
          disabled={busy || !o.canFinish || o.answer === "finish-change"}
          title={
            o.canFinish
              ? "Work on the change it is on carries on; then it stops again."
              : "Nothing is being worked on right now."
          }
          onClick={() => void answer({ answer: "finish-change" })}
        >
          Let it finish the current change
        </button>{" "}
        <button
          type="button"
          disabled={busy || o.answer === "left-paused"}
          onClick={() => void answer({ answer: "leave-paused" })}
        >
          Leave it paused
        </button>
      </div>
      <p className="small muted">
        Other softwares are not affected. You can come back to this on the Usage page at any time.
      </p>
    </section>
  );
}

/** A software's budget: what it is, what has been used this week, and a way to change it. */
export function BudgetEditor({ softwareId, budget }: { softwareId: string; budget: BudgetView }) {
  const { api, notCurrent, refresh } = useSession();
  const [kind, setKind] = useState<"none" | "share" | "amount">(budget.kind);
  const [value, setValue] = useState(
    budget.percent !== null
      ? String(budget.percent)
      : budget.usd !== null
        ? String(budget.usd)
        : "",
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setProblem(null);
    setSaved(false);
    let input: BudgetInput | null;
    if (kind === "none") input = { kind: "none" };
    else input = readBudget(kind, value);
    if (!input) {
      setProblem(
        kind === "share"
          ? "Type a share of the week's usage as a whole number from 1 to 100, such as 30."
          : "Type an amount in dollars as a number, such as 10.",
      );
      return;
    }
    try {
      await api.setBudget(softwareId, input);
      setSaved(true);
      refresh();
    } catch (error) {
      if (error instanceof NotCurrentLink) notCurrent();
      else setProblem((error as ApiError).message);
    }
  }

  return (
    <form onSubmit={save} className="budget-edit">
      <p>
        <strong>Budget:</strong> {budget.words}.{" "}
        <span className="muted small">
          Used this week: {money(budget.spentUsd)} {budget.mocked && <MockedBadge />}
        </span>
      </p>
      <fieldset>
        <legend className="sr-only">Change the budget</legend>
        <label>
          <input type="radio" checked={kind === "none"} onChange={() => setKind("none")} /> No
          budget
        </label>{" "}
        <label>
          <input type="radio" checked={kind === "share"} onChange={() => setKind("share")} />{" "}
          Percent of the week's usage
        </label>{" "}
        <label>
          <input type="radio" checked={kind === "amount"} onChange={() => setKind("amount")} />{" "}
          Dollars a week
        </label>{" "}
        {kind !== "none" && (
          <label>
            <span className="sr-only">Budget</span>
            <input
              type="text"
              inputMode="decimal"
              size={6}
              value={value}
              placeholder={kind === "share" ? "such as 30" : "such as 10"}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        )}{" "}
        <button type="submit">Save budget</button>
      </fieldset>
      {problem && <Problem>{problem}</Problem>}
      {saved && !problem && <p className="small muted">Saved.</p>}
    </form>
  );
}
