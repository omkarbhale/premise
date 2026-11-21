import { useEffect, useRef } from "react";
import type { SummarySoftware } from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { plural } from "../words";
import { Empty, Problem } from "./Badges";

/**
 * The short summary across every software (decision 0197): what needs you, what is running, and
 * what changed since you last looked. Leaving this view counts as having looked.
 */
export function Summary() {
  const { api, version, notCurrent, go } = useSession();
  const summary = useLoad(() => api.summary(), [], version, notCurrent);
  const upTo = summary.state === "ready" ? summary.data.upTo : null;
  const seen = useRef<number | null>(null);
  useEffect(() => {
    seen.current = upTo;
  }, [upTo]);
  // What was shown counts as seen once you leave the summary, so the next look shows only what is new.
  useEffect(
    () => () => {
      if (seen.current !== null) void api.summarySeen(seen.current).catch(() => {});
    },
    [api],
  );

  if (summary.state === "loading") return <p className="muted">Loading…</p>;
  if (summary.state === "error") return <Problem>{summary.message}</Problem>;
  const s = summary.data;

  const open = (software: SummarySoftware) => (
    <button type="button" className="link" onClick={() => go?.(software.id)}>
      {software.name}
    </button>
  );

  return (
    <section aria-labelledby="summary-title" className="summary">
      <h1 id="summary-title">Summary of every software</h1>
      <p className="lead">{s.headline}</p>
      <p className="muted small">
        Made from what premise recorded, not written by an AI. {s.sessions.running} of{" "}
        {plural(s.sessions.max, "agent session")} in use now.
        {s.archived > 0 && ` ${plural(s.archived, "software")} archived, not counted here.`}
      </p>

      <section className="card" aria-labelledby="summary-needs">
        <h2 id="summary-needs">Waiting on you</h2>
        {s.needsYou.length === 0 ? (
          <p className="muted">Nothing. premise will show it here when it needs you.</p>
        ) : (
          <ul className="summary-list">
            {s.needsYou.map((n) => (
              <li key={n.id}>
                {open(n)}: <span className="needs-you">{n.needsYou}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="summary-changes">
        <h2 id="summary-changes">
          {s.since
            ? `What changed since you last looked (${new Date(s.since).toLocaleString()})`
            : "What has happened so far"}
        </h2>
        {s.changes.length === 0 ? (
          <p className="muted">Nothing new since you last looked.</p>
        ) : (
          s.changes.map((c) => (
            <div key={c.softwareId} className="summary-change">
              <h3>{c.name}</h3>
              <ul>
                {c.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="card" aria-labelledby="summary-all">
        <h2 id="summary-all">Every software</h2>
        {s.softwares.length === 0 ? (
          <Empty>No softwares yet.</Empty>
        ) : (
          <table className="summary-table">
            <thead>
              <tr>
                <th scope="col">Software</th>
                <th scope="col">Where it is</th>
                <th scope="col">Doing now</th>
                <th scope="col">Priority</th>
              </tr>
            </thead>
            <tbody>
              {s.softwares.map((row) => (
                <tr key={row.id}>
                  <td>
                    {open(row)}
                    {row.needsYou && <span className="badge badge-needs">Needs you</span>}
                    {row.paused && <span className="badge">Paused</span>}
                  </td>
                  <td>{row.phase}</td>
                  <td>
                    {row.doing}
                    {row.runningAt && (
                      <>
                        {" "}
                        Running at{" "}
                        <a href={row.runningAt} target="_blank" rel="noreferrer">
                          {row.runningAt}
                        </a>
                        .
                      </>
                    )}
                  </td>
                  <td>
                    <span className="phone-only">Priority </span>
                    {row.priority}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
