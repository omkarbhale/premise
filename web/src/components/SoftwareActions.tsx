import { useState } from "react";
import { type ApiError, NotCurrentLink, type SoftwareDetail } from "../api";
import { useSession } from "../context";
import { Problem } from "./Badges";

/**
 * What you can do to a software as a whole, beside the others (decision 0197): its priority,
 * pausing and resuming it, and archiving or restoring it. Archiving keeps everything.
 */
export function SoftwareActions({ software }: { software: SoftwareDetail }) {
  const { api, refresh, notCurrent } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  async function act(work: () => Promise<unknown>) {
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
      setConfirmArchive(false);
    }
  }

  if (software.archived) {
    return (
      <div className="software-actions">
        <p className="small">
          <strong>Archived.</strong> Everything is kept; it is hidden from the main list and nothing
          starts for it.{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => api.restore(software.id))}
          >
            Restore it
          </button>
        </p>
        {problem && <Problem>{problem}</Problem>}
      </div>
    );
  }

  const can = software.archivable;
  return (
    <div className="software-actions small">
      <label>
        Priority{" "}
        <select
          value={software.priority}
          disabled={busy}
          title="When agents are busy, the most important software goes first; none waits forever."
          onChange={(e) => void act(() => api.setPriority(software.id, Number(e.target.value)))}
        >
          {[1, 2, 3, 4, 5].map((p) => (
            <option key={p} value={p}>
              {p === 1 ? "1 (most important)" : p === 5 ? "5 (least important)" : p}
            </option>
          ))}
        </select>
      </label>
      {software.paused ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(() => api.resume(software.id))}
        >
          Resume
        </button>
      ) : (
        <button
          type="button"
          className="quiet"
          disabled={busy}
          title="Nothing new starts for it, and its agents make room for other softwares. Its questions stay answerable."
          onClick={() => void act(() => api.pause(software.id))}
        >
          Pause
        </button>
      )}
      {confirmArchive ? (
        <span className="confirm">
          Archive {software.name}? It is kept and can be restored; nothing is deleted.{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => api.archive(software.id))}
          >
            Archive
          </button>{" "}
          <button type="button" className="quiet" onClick={() => setConfirmArchive(false)}>
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="quiet"
          disabled={busy || can?.ok === false}
          title={can?.ok === false ? can.why : "Hide it from the main list; it can be restored."}
          onClick={() => setConfirmArchive(true)}
        >
          Archive
        </button>
      )}
      {can?.ok === false && !software.paused && (
        <span className="muted">Archive is for finished or paused softwares.</span>
      )}
      {problem && <Problem>{problem}</Problem>}
    </div>
  );
}
