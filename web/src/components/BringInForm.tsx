import { useId, useState } from "react";
import { ApiError, NotCurrentLink, type SoftwareSummary } from "../api";
import { useSession } from "../context";
import { Problem } from "./Badges";

/** Bring in software that already exists, from a folder on this computer or a clone address. */
export function BringInForm({
  onStarted,
  autoFocus = false,
}: {
  onStarted: (software: SoftwareSummary) => void;
  autoFocus?: boolean;
}) {
  const { api, notCurrent, refresh } = useSession();
  const [source, setSource] = useState("");
  const [idea, setIdea] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const sourceId = useId();
  const hintId = useId();
  const ideaId = useId();
  const nameId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!source.trim()) {
      setProblem("Say where the software is first: a folder on this computer or a clone address.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const started = await api.bringIn(
        source.trim(),
        name.trim() || undefined,
        idea.trim() || undefined,
      );
      setSource("");
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
    <form className="start-form" onSubmit={submit} aria-label="Bring in software you already have">
      <label htmlFor={sourceId} className="big-label">
        Where is it?
      </label>
      <p id={hintId} className="muted">
        A folder on this computer that is a git repository, or a clone address. premise copies it
        into its own folder and works on the copy; it never changes your folder.
      </p>
      <input
        id={sourceId}
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder="For example: /home/you/projects/notes or https://github.com/you/notes.git"
        aria-describedby={hintId}
        autoFocus={autoFocus}
        spellCheck={false}
        autoCapitalize="off"
      />
      <details className="optional">
        <summary>Say what it is for, or give it a name (optional)</summary>
        <label htmlFor={ideaId}>What it is for, in your words</label>
        <textarea
          id={ideaId}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={3}
          placeholder="premise works it out from the code when you leave this empty"
        />
        <label htmlFor={nameId}>Name</label>
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="premise uses the folder's name"
        />
      </details>
      {problem && <Problem>{problem}</Problem>}
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Bringing it in…" : "Bring it in"}
        </button>
      </div>
      <details className="optional small">
        <summary>What happens after you bring it in</summary>
        <ol className="steps">
          <li>
            A drafter reads the code, its documents and its history, and writes down why it exists,
            who it is for, what it does and the decisions it shows. Where the code and its documents
            disagree, it asks you.
          </li>
          <li>
            premise works out how to build, start and check it, and says plainly what it could not
            check and what it would need.
          </li>
          <li>
            You go through what it recovered once and strike what is wrong. A recovered record
            usually misses things; what is missing comes in afterwards as ordinary requests.
          </li>
          <li>
            premise asks before adding its record (a <code>premise/</code> folder) to your
            repository, on a branch of its own. From then on, changes go through premise. Changes
            made by hand outside premise are not followed yet, so the record drifts from them.
          </li>
        </ol>
      </details>
    </form>
  );
}
