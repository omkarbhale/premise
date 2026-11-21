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
            <strong>Understand.</strong> premise works out what you want: why, for whom, what
            already exists, and what it must do. It lists what it understood and assumed; you strike
            anything wrong.
          </li>
          <li>
            <strong>Build.</strong> Agents write the software and a separate agent checks it, with
            no need for you to watch. premise asks before creating anything outside this machine.
          </li>
          <li>
            <strong>Running.</strong> The software starts on this machine with a report of what was
            done, what failed and what is needed. What you say next becomes new work.
          </li>
        </ol>
        <p>
          Whenever something needs you, it appears under <strong>Waiting on you</strong>, and the
          browser tab shows how many things are waiting.
        </p>
      </section>

      <section className="card note" aria-label="This is a trial run">
        <h2>This is a trial run</h2>
        <p>premise is still being built. What you see here is real, except:</p>
        <ul>
          <li>
            Building, checking and running are a <strong>stand-in</strong> for now: premise drafts
            and plans for real, then walks through the later stages without building anything. Each
            one is labelled where it appears.
          </li>
          {overview.agents.mode === "scripted" && (
            <li>
              Agents are <strong>scripted</strong>: their lists come from fixed templates and they
              do no real work. No AI is called, and your Claude login is not used.
            </li>
          )}
          {overview.usage.mocked && (
            <li>
              Usage and cost figures are <strong>mocked</strong>: made up until usage-ledger, which
              will measure them, exists. They are labelled Mocked wherever they appear.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
