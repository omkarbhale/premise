import type { Overview, SoftwareSummary } from "../api";
import { StartForm } from "./StartForm";

/** The first thing someone new sees: what premise is, what to type, and what happens next. */
export function Welcome({
  overview,
  onStarted,
}: {
  overview: Overview;
  onStarted: (software: SoftwareSummary) => void;
}) {
  const trial = overview.line.mode === "stand-in" || overview.agents.mode === "scripted";
  return (
    <div className="welcome">
      <section className="card hero">
        <h1>Welcome to premise</h1>
        <p className="lead">
          premise takes software from an idea to running software. You say what it is for; agents
          draft, plan, build and check it. premise asks you only where your answer matters.
        </p>
        <StartForm onStarted={onStarted} autoFocus />
      </section>

      <section className="card">
        <h2>What happens next</h2>
        <ol className="steps">
          <li>
            premise drafts <strong>why</strong> it is worth building and <strong>who</strong> it is
            for, as short lists. You strike what is wrong and edit what is half right.
          </li>
          <li>It looks at whether something already does this, and asks what you want to do.</li>
          <li>
            It drafts <strong>what</strong> it must do, then <strong>says back</strong> everything
            it understood and assumed. You strike anything wrong.
          </li>
          <li>
            It plans the work, asks before creating anything outside this machine, then builds and
            checks it without you.
          </li>
          <li>
            It starts the software and writes a <strong>report</strong>: what was done, what failed,
            what is needed.
          </li>
        </ol>
        <p>
          Whenever something needs you, it appears under <strong>Waiting on you</strong>, and the
          browser tab shows how many things are waiting.
        </p>
      </section>

      {trial && (
        <section className="card note" aria-label="This is a trial run">
          <h2>This is a trial run</h2>
          <ul>
            {overview.line.mode === "stand-in" && (
              <li>
                The line is a <strong>stand-in</strong>: lists come from fixed templates, no AI is
                called, and nothing is really built. Every step and question works as it will.
              </li>
            )}
            {overview.agents.mode === "scripted" && (
              <li>
                Agents are <strong>scripted</strong>: they take a moment and report progress, but do
                no real work. Your Claude login is not used.
              </li>
            )}
            {overview.usage.mocked && (
              <li>
                Usage and cost figures are <strong>mocked</strong>: made up until usage-ledger,
                which will measure them, exists. They are labelled Mocked wherever they appear.
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
