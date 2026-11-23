import type { WorkingView } from "../api";
import { when } from "../words";

/** Who does a kind of job, in the words the rest of the page uses. */
const WHO: Record<string, string> = {
  build: "A builder",
  check: "The checker",
  draft: "A drafter",
  research: "The researcher",
  plan: "The planner",
  prototype: "The planner",
  size: "The sizer",
  triage: "The triager",
  reading: "The triager",
  recover: "A drafter",
  run: "premise",
};

const STATE: Record<WorkingView["jobs"][number]["status"], string> = {
  running: "working now",
  queued: "next, when a session is free",
  waiting: "waiting",
  paused: "paused",
};

const FATE: Record<WorkingView["answers"][number]["state"], string> = {
  given: "Goes to",
  held: "Held for",
  intake: "Taken in as new work:",
};

/**
 * What is being worked on for this software, in plain words, and where the person's recent
 * answers went (decision 0310; the owner: "a builder is working but I don't know what on, and I
 * also don't know if both my answers will be worked on").
 */
export function WorkingOn({ working }: { working: WorkingView }) {
  if (working.jobs.length === 0 && working.answers.length === 0) return null;
  return (
    <section className="card working-on" aria-label="What is being worked on">
      <h2>What is being worked on</h2>
      {working.jobs.length === 0 ? (
        <p className="empty-line">No agent is working on this software right now.</p>
      ) : (
        <ul className="working-jobs">
          {working.jobs.map((job) => (
            <li key={job.jobId}>
              <strong>{WHO[job.kind] ?? "An agent"}</strong>{" "}
              <span className="muted small">({STATE[job.status]})</span>: {job.doing}
              {job.items.length > 0 && (
                <div className="small">
                  For{" "}
                  {job.items.map((item, n) => (
                    <span key={item.id}>
                      {n > 0 && "; "}
                      <strong>{item.id}</strong>
                      {item.text && ` ${item.text}`}
                    </span>
                  ))}
                </div>
              )}
              {job.answers.length > 0 && (
                <div className="small">
                  With your {job.answers.length === 1 ? "answer" : "answers"}:{" "}
                  {job.answers.join("; ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {working.answers.length > 0 && (
        <>
          <h3>Your recent answers, and where they went</h3>
          <ul className="answer-fates">
            {working.answers.map((a) => (
              <li key={a.askId}>
                <strong>{a.title}</strong>{" "}
                <span className="muted small">answered {when(a.answered)}</span>
                <div className="small">
                  {FATE[a.state]} {a.to}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
