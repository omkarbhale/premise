import { useState } from "react";
import { ApiError, NotCurrentLink, type ExistingView } from "../api";
import { useSession } from "../context";
import { plural } from "../words";
import { Problem } from "./Badges";

const STATUS_WORDS: Record<ExistingView["status"], string> = {
  copying: "Copying it into premise's own folder",
  "copy-failed": "Could not be copied",
  recovering: "Recovering its record from the code",
  "taken-on": "Taken on",
  stopped: "Stopped: you decided it is no longer needed",
};

function recordWords(existing: ExistingView): string {
  const { status, branch, note } = existing.record;
  switch (status) {
    case "not-yet":
      return "Only in premise's own copy. premise asks before adding it to your repository, once you have gone through what it recovered.";
    case "asked":
      return `premise is asking, under Waiting on you, before adding it to your repository on a branch named ${branch}.`;
    case "added":
      return note ?? `In your repository, on the branch ${branch}.`;
    case "refused":
      return "Only in premise's own copy: you declined adding it to your repository.";
    case "failed":
      return `Only in premise's own copy: adding it to your repository did not work. ${note ?? ""}`.trim();
  }
}

/** A software premise took on from existing code: where from, what it could not check, and its record. */
export function ExistingPanel({
  softwareId,
  existing,
}: {
  softwareId: string;
  existing: ExistingView;
}) {
  const { api, notCurrent, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function offer() {
    setBusy(true);
    setProblem(null);
    try {
      await api.offerRecord(softwareId);
      refresh();
    } catch (error) {
      if (error instanceof NotCurrentLink) notCurrent();
      else setProblem((error as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const started = existing.status !== "copying" && existing.status !== "copy-failed";
  return (
    <details
      className="existing card"
      open={existing.record.canOffer || existing.status === "copy-failed"}
    >
      <summary>
        <strong>Existing software</strong>: {STATUS_WORDS[existing.status]}
      </summary>
      <dl>
        <dt>Taken on from</dt>
        <dd>
          <code>{existing.source}</code> (
          {existing.sourceKind === "folder" ? "a folder on this computer" : "a clone address"}).
          premise works on its own copy; it never changes your folder.
        </dd>
        {existing.problem && (
          <>
            <dt>What went wrong</dt>
            <dd>{existing.problem}</dd>
          </>
        )}
        {started && (
          <>
            <dt>Recovered</dt>
            <dd>
              {plural(existing.recovered, "item")} from {plural(existing.commits, "commit")} of
              history, {existing.confirmed} confirmed by you
              {existing.struck > 0 && `, ${existing.struck} struck`}. A recovered record usually
              misses things: say what is missing or wrong in chat or on the Intake tab, and it goes
              through the line.
            </dd>
            <dt>How to run it</dt>
            <dd>
              {existing.run.start ?? "Not found in the code."}
              {existing.run.check && <> Checked with: {existing.run.check}</>}
            </dd>
          </>
        )}
        {existing.couldNotCheck.length > 0 && (
          <>
            <dt>Could not check</dt>
            <dd>
              <ul className="items plain">
                {existing.couldNotCheck.map((need) => (
                  <li key={need}>{need}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {started && (
          <>
            <dt>Its record</dt>
            <dd>
              {recordWords(existing)}{" "}
              {existing.record.canOffer && (
                <button type="button" disabled={busy} onClick={() => void offer()}>
                  {busy ? "Asking…" : "Offer it again"}
                </button>
              )}
            </dd>
          </>
        )}
      </dl>
      {started && (
        <p className="muted small">
          If you or others still change it by hand outside premise, its record will drift from the
          code: premise cannot follow such changes yet.
        </p>
      )}
      {problem && <Problem>{problem}</Problem>}
    </details>
  );
}
