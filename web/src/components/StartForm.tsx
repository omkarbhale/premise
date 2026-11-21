import { useId, useState } from "react";
import { ApiError, NotCurrentLink, type SoftwareSummary } from "../api";
import { useSession } from "../context";
import { Problem } from "./Badges";

export const IDEA_EXAMPLE =
  "A small web page where I keep my reading list, with what I thought of each book.";

/** Start a software from a sentence or two. */
export function StartForm({
  onStarted,
  autoFocus = false,
}: {
  onStarted: (software: SoftwareSummary) => void;
  autoFocus?: boolean;
}) {
  const { api, notCurrent, refresh } = useSession();
  const [idea, setIdea] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ideaId = useId();
  const nameId = useId();
  const hintId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!idea.trim()) {
      setProblem("Write a sentence or two about what the software should do first.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const started = await api.start(idea, name.trim() || undefined);
      setIdea("");
      setName("");
      refresh();
      onStarted(started);
    } catch (error) {
      if (error instanceof NotCurrentLink) notCurrent();
      else setProblem((error as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="start-form" onSubmit={submit} aria-label="Start a software">
      <label htmlFor={ideaId} className="big-label">
        What should the software do, and for whom?
      </label>
      <p id={hintId} className="muted">
        A sentence or two is enough. premise drafts the rest and asks you to correct it.
      </p>
      <textarea
        id={ideaId}
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        rows={4}
        placeholder={`For example: ${IDEA_EXAMPLE}`}
        aria-describedby={hintId}
        autoFocus={autoFocus}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit(e);
        }}
      />
      <details className="optional">
        <summary>Give it a name (optional)</summary>
        <label htmlFor={nameId}>Name</label>
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="premise makes one from your first words"
        />
      </details>
      {problem && <Problem>{problem}</Problem>}
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Starting…" : "Start"}
        </button>
        <span className="muted small">Ctrl+Enter also starts it.</span>
      </div>
    </form>
  );
}
