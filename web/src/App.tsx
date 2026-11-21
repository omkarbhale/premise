import { useEffect, useState } from "react";
import { type Overview, NotCurrentLink, fetchOverview, sessionToken } from "./api";

type Load =
  | { state: "loading" }
  | { state: "no-link" }
  | { state: "error"; message: string }
  | { state: "ready"; overview: Overview };

function MockedBadge() {
  return (
    <span
      className="badge badge-mocked"
      title="These figures are made up until usage-ledger exists."
    >
      Mocked
    </span>
  );
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function date(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="page">
      <h1>premise</h1>
      <section className="card notice">
        <h2>{title}</h2>
        {children}
      </section>
    </main>
  );
}

export function App() {
  const [load, setLoad] = useState<Load>(() =>
    sessionToken() ? { state: "loading" } : { state: "no-link" },
  );

  useEffect(() => {
    const token = sessionToken();
    if (!token) return;
    let cancelled = false;
    const refresh = () =>
      fetchOverview(token).then(
        (overview) => !cancelled && setLoad({ state: "ready", overview }),
        (error: unknown) =>
          !cancelled &&
          setLoad(
            error instanceof NotCurrentLink
              ? { state: "no-link" }
              : { state: "error", message: (error as Error).message },
          ),
      );
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (load.state === "no-link") {
    return (
      <Notice title="Open premise from its link">
        <p>
          This page needs the private link premise printed in the terminal when it started. It looks
          like <code>http://localhost:4610/#token=…</code>.
        </p>
        <p>
          Not running yet? In the premise folder run <code>npm start</code>, then open the link it
          prints. If premise was restarted, its old links stop working: use the newest one.
        </p>
      </Notice>
    );
  }
  if (load.state === "loading") return <Notice title="Loading…">{null}</Notice>;
  if (load.state === "error") {
    return (
      <Notice title="premise did not answer">
        <p>{load.message}</p>
        <p>Check that premise is still running in its terminal, then reload this page.</p>
      </Notice>
    );
  }

  const o = load.overview;
  const queued = o.queue.jobs.queued ?? 0;
  const waiting = o.queue.jobs.waiting ?? 0;
  const problems = o.setup.filter((c) => c.status !== "ok");

  return (
    <main className="page">
      <header>
        <h1>premise</h1>
        <p className="lead">
          Takes software from an idea to running software. You say what it is for; premise drafts,
          plans, builds and checks it, and asks you only where it matters.
        </p>
      </header>

      <section className="card">
        <h2>Right now</h2>
        <ul className="facts">
          <li>
            <strong>premise is running</strong> (version {o.version}).
          </li>
          <li>
            <strong>Agents:</strong>{" "}
            {o.agents.mode === "scripted" ? (
              <>
                scripted <span className="badge">No AI is called</span> A stand-in follows a script,
                so you can try everything without using your Claude login.
              </>
            ) : (
              <>real Claude Code sessions on your login.</>
            )}
          </li>
          <li>
            <strong>Work:</strong> {o.queue.runningAgentSessions} of {o.queue.maxAgentSessions}{" "}
            agent sessions running; {queued} waiting to start; {waiting} waiting for an answer.
          </li>
          {o.queue.paused && (
            <li className="warn">
              <strong>Paused:</strong> {o.queue.reason}
              {o.queue.resumeAt && <> Resumes around {date(o.queue.resumeAt)}.</>}
            </li>
          )}
        </ul>
      </section>

      <section className="card">
        <h2>
          Usage this week <MockedBadge />
        </h2>
        <p className="muted">
          usage-ledger, which will report real usage, is not connected yet. Until it is, premise
          shows made-up figures ({o.usage.mode}) so you can see where they will appear.
        </p>
        <div
          className="meter"
          aria-label={`Mocked weekly usage ${percent(o.usage.weekly.utilization)}`}
        >
          <div className="meter-fill" style={{ width: percent(o.usage.weekly.utilization) }} />
        </div>
        <p>
          {percent(o.usage.weekly.utilization)} of the week used (mocked); the week resets{" "}
          {date(o.usage.weekly.resetsAt)}.
        </p>
      </section>

      <section className="card">
        <h2>Softwares</h2>
        {o.softwares.length === 0 ? (
          <p>
            No software yet. Starting one from a one-paragraph idea is coming in the next build of
            premise; this build lays the foundation it runs on.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Priority</th>
                <th>Stage</th>
                <th>State</th>
                <th>
                  Usage <MockedBadge />
                </th>
              </tr>
            </thead>
            <tbody>
              {o.softwares.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.priority}</td>
                  <td>{s.currentStage}</td>
                  <td>{s.state}</td>
                  <td>
                    {s.usage.sessions} sessions, ${s.usage.costUsd.toFixed(2)},{" "}
                    {percent(s.usage.weeklyShare)} of the week
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Setup</h2>
        {problems.length === 0 ? (
          <p>Everything premise checks for is here.</p>
        ) : (
          <ul className="checks">
            {problems.map((c) => (
              <li key={c.name} className={c.status}>
                <strong>{c.name}:</strong> {c.detail}
                {c.fix && <div className="fix">{c.fix}</div>}
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary>Settings in use</summary>
          <p className="muted">
            Change them in <code>config.json</code> in {o.dataFolder}, or with environment
            variables; then restart premise. Every setting is explained in
            docs/reference/configuration.md.
          </p>
          <table>
            <thead>
              <tr>
                <th>Type of task</th>
                <th>Model</th>
                <th>Effort</th>
                <th>Turn limit</th>
                <th>Time limit</th>
              </tr>
            </thead>
            <tbody>
              {o.agents.tasks.map((t) => (
                <tr key={t.kind}>
                  <td>{t.kind}</td>
                  <td>{t.model}</td>
                  <td>{t.effort}</td>
                  <td>{t.max_turns}</td>
                  <td>{t.max_minutes} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
    </main>
  );
}
