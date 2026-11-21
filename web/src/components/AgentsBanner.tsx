import { useState } from "react";
import { ApiError, NotCurrentLink, type Overview } from "../api";
import { useSession } from "../context";

/**
 * Shown when real agents cannot start on this machine (decision 0180): what is missing, how to fix
 * it, and a way to look around with scripted agents meanwhile, labelled as not real.
 */
export function AgentsBanner({ overview }: { overview: Overview }) {
  const { api, notCurrent, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const agents = overview.agents;

  if (agents.scriptedDemo) {
    return (
      <div className="banner warn" role="status">
        <strong>Look-around mode: agents are scripted, not real.</strong> Lists come from fixed
        templates, no AI is called and nothing is really built. Fix what real agents need and
        restart premise to work for real.
      </div>
    );
  }
  if (agents.ready) return null;
  const missing = overview.setup.filter((c) => c.status === "missing");

  async function lookAround() {
    setBusy(true);
    setProblem(null);
    try {
      await api.scriptedDemo();
      refresh();
    } catch (error) {
      if (error instanceof NotCurrentLink) notCurrent();
      else setProblem((error as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="banner warn agents-banner" role="alert" aria-label="Agents cannot start">
      <p>
        <strong>premise's agents cannot start yet.</strong> {agents.unavailable} You can still start
        a software: its work waits until agents can run.
      </p>
      {missing.length > 0 && (
        <ul className="small">
          {missing.map((c) => (
            <li key={c.name}>
              <strong>{c.name}:</strong> {c.fix ?? c.detail}
            </li>
          ))}
        </ul>
      )}
      <p className="small">
        After fixing it, stop premise (Ctrl+C in its terminal) and start it again with{" "}
        <code>npm start</code>.
      </p>
      <button type="button" disabled={busy} onClick={() => void lookAround()}>
        Look around with scripted agents (not real)
      </button>
      {problem && <span className="problem"> {problem}</span>}
    </section>
  );
}
