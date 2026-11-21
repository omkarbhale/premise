import { useState } from "react";
import { ApiError, type JobView, NotCurrentLink } from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { whereNow } from "../../../src/shared/stages";
import { jobLabel, plural, when } from "../words";
import { Problem } from "./Badges";

/** What agents are doing now, what waits, and what is queued (the work queue). */
export function Activity() {
  const { api, version, notCurrent, refresh } = useSession();
  const activity = useLoad(() => api.activity(), [], version, notCurrent);
  const [problem, setProblem] = useState<string | null>(null);

  async function stop(id: number) {
    setProblem(null);
    try {
      await api.stopJob(id);
      refresh();
    } catch (error) {
      if (error instanceof NotCurrentLink) notCurrent();
      else setProblem((error as ApiError).message);
    }
  }

  if (activity.state === "loading") return <p className="muted">Loading…</p>;
  if (activity.state === "error") return <Problem>{activity.message}</Problem>;
  const a = activity.data;
  const groups: { title: string; jobs: JobView[]; empty: string; stoppable: boolean }[] = [
    {
      title: "Working now",
      jobs: a.running,
      empty: "No agent is working. Work starts here when a stage needs one.",
      stoppable: true,
    },
    {
      title: "Waiting",
      jobs: a.waiting,
      empty: "Nothing is waiting on an answer.",
      stoppable: true,
    },
    {
      title: "Queued",
      jobs: a.queued,
      empty: "Nothing is queued.",
      stoppable: true,
    },
    {
      title: "Recently finished",
      jobs: a.recent,
      empty: "Nothing has finished yet.",
      stoppable: false,
    },
  ];
  return (
    <section aria-labelledby="activity-title">
      <h1 id="activity-title">Activity</h1>
      <p>
        {a.runningAgentSessions} of {a.maxAgentSessions} agent sessions in use. premise runs at most{" "}
        {plural(a.maxAgentSessions, "agent session")} at once; change it with the setting{" "}
        <code>queue.max_agent_sessions</code>.
      </p>
      {a.paused && (
        <p className="warn" role="status">
          <strong>All agent work is paused.</strong> {a.pausedReason}
          {a.resumeAt && ` It starts again around ${when(a.resumeAt)}.`}
        </p>
      )}
      {problem && <Problem>{problem}</Problem>}
      {groups.map((g) => (
        <section key={g.title} className="card" aria-label={g.title}>
          <h2>
            {g.title} <span className="count">{g.jobs.length}</span>
          </h2>
          {g.jobs.length === 0 ? (
            <p className="empty-line">{g.empty}</p>
          ) : (
            <ul className="jobs">
              {g.jobs.map((job) => (
                <li key={job.id} className={`job job-${job.status}`}>
                  <div>
                    <strong>{jobLabel(job.kind)}</strong> for {job.softwareName}
                    {job.stage && <span className="muted"> ({whereNow(job.stage)})</span>}
                    <span className="chip">{job.status}</span>
                    {(job.finished ?? job.started) && (
                      <div className="muted small">
                        {job.finished ? "Finished" : "Started"} {when(job.finished ?? job.started)}
                      </div>
                    )}
                    {job.line && <div className="muted small">{job.line}</div>}
                    {job.waitingOn && <div className="small">Waiting on: {job.waitingOn}</div>}
                  </div>
                  {g.stoppable && (
                    <button type="button" className="quiet" onClick={() => void stop(job.id)}>
                      Stop
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </section>
  );
}
