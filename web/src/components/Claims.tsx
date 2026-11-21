import { useState } from "react";
import { type ApiError, type ClaimView, NotCurrentLink, type SoftwareDetail } from "../api";
import { useSession } from "../context";
import { Problem } from "./Badges";

const STATE_WORDS: Record<ClaimView["state"], string> = {
  waiting: "a proposal comes before it is built",
  proposing: "premise is preparing a proposal",
  "proposal-open": "a proposal is waiting for an answer, under Waiting on you",
  decided: "decided",
  released: "released: premise decides it",
};

/** The claim form's first field, which links elsewhere on the page bring into view. */
const CLAIM_INPUT = "claim-an-area";

/**
 * A link to the claim form (on the Line tab) from where claiming is mentioned: it opens the tab,
 * scrolls to the form and puts the cursor in it.
 */
export function ClaimAreaLink({
  softwareId,
  children = "Claim an area",
}: {
  softwareId: string;
  children?: React.ReactNode;
}) {
  const { go } = useSession();
  if (!go) return null;
  return (
    <button
      type="button"
      className="link"
      onClick={() => {
        go(softwareId, "line");
        // The Line tab loads first; look for the form a few times.
        let tries = 0;
        const look = () => {
          const input = document.getElementById(CLAIM_INPUT);
          if (input) {
            input.scrollIntoView?.({ block: "center" });
            input.focus();
          } else if (++tries < 30) window.setTimeout(look, 100);
        };
        window.setTimeout(look, 0);
      }}
    >
      {children}
    </button>
  );
}

/**
 * Taste claims (decision 0102): by default premise decides every part of the software. Claiming a
 * part, in plain words, means premise shows a proposal for it before building it, to keep or
 * correct. A claim can be released.
 */
export function Claims({ software }: { software: SoftwareDetail }) {
  const { api, notCurrent, refresh } = useSession();
  const [area, setArea] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

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
    }
  }
  const claim = (a: string, r: string) => api.claim(software.id, a, r);
  const release = (id: number) => api.releaseClaim(id);
  const open = software.claims.filter((c) => c.state !== "released");
  const released = software.claims.filter((c) => c.state === "released");
  const showRole = software.claims.some((c) => c.role !== "operator");

  return (
    <section className="card" aria-labelledby="claims-title">
      <h2 id="claims-title">Parts you want to see first</h2>
      <p className="muted small">
        premise decides how every part of the software looks and works, unless you claim it. For a
        claimed part premise shows you a proposal before building it, and builds it the way you keep
        or correct. Only that part waits for you; the rest goes on.
      </p>
      {open.length > 0 && (
        <ul className="claims">
          {open.map((c) => (
            <li key={c.id}>
              <span>
                <strong>{c.area}</strong>
                {showRole && <span className="muted"> · for the {c.role}</span>}
                <span className="muted small">
                  {" "}
                  · {STATE_WORDS[c.state]}
                  {c.decision ? `: ${c.decision}` : ""}
                </span>
              </span>{" "}
              <button
                type="button"
                className="quiet"
                disabled={busy}
                title="premise decides this part itself again; anything waiting on its proposal goes on."
                onClick={() => void act(() => release(c.id))}
              >
                Release
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="claim-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!area.trim()) return;
          void act(async () => {
            await claim(area.trim(), role.trim());
            setArea("");
            setRole("");
          });
        }}
      >
        <label className="small">
          Which part?
          <input
            id={CLAIM_INPUT}
            value={area}
            maxLength={200}
            placeholder="for example: the look of the main screen"
            onChange={(e) => setArea(e.target.value)}
          />
        </label>
        <label className="small">
          Who decides it? (optional)
          <input
            value={role}
            maxLength={40}
            placeholder="for example: designer. Empty means you."
            onChange={(e) => setRole(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy || area.trim().length < 3}>
          Claim it
        </button>
      </form>
      {problem && <Problem>{problem}</Problem>}
      <p className="muted small">
        Who decides is a label for whose taste it is, such as a designer or whoever writes the
        wording, not an account: in this session you answer for every role.
      </p>
      {released.length > 0 && (
        <details className="small">
          <summary>Released ({released.length})</summary>
          <ul>
            {released.map((c) => (
              <li key={c.id}>
                {c.area}
                {c.decision ? ` (it was decided: ${c.decision})` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
