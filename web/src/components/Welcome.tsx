import { stageName } from "../../../src/shared/stages";
import type { Overview, SoftwareSummary } from "../api";
import { BringInForm } from "./BringInForm";
import { Define } from "./Badges";
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
          premise takes software from an idea to running software. You say what it is for;{" "}
          <Define term="agent">agents</Define> draft, plan, build and check it. premise asks you
          only where your answer matters.
        </p>
        <StartForm onStarted={onStarted} autoFocus />
      </section>

      <section className="card" aria-labelledby="bring-in-title">
        <h2 id="bring-in-title">Bring in software you already have</h2>
        <p>
          Point premise at a repository and it drafts the record from the code: what it is for, who
          it is for and what it does. You strike what is wrong, and from then on changes go through
          premise.
        </p>
        <BringInForm onStarted={onStarted} />
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
          Whenever something needs you, it appears under{" "}
          <strong>
            <Define term="waitingOnYou">Waiting on you</Define>
          </strong>
          , and the browser tab shows how many things are waiting.
        </p>
      </section>

      <section className="card note" aria-label="What is real here and what is not">
        <h2>What is real here, and what is not</h2>
        {overview.agents.mode === "scripted" ? (
          <>
            <p>
              <strong>This is a demo.</strong> The agents are{" "}
              <Define term="scriptedAgents">scripted</Define>: no AI is called, your Claude login is
              not used, and nothing real is built. The lists, the plan and the "software" at the end
              come from fixed templates, so they will not match your idea closely. Every one is
              labelled where it appears.
            </p>
            <p>
              To see a whole scripted build, check and run, use <code>npm run demo:cli</code>. To
              build for real, restart premise without <code>--scripted</code> (
              <code>npm start</code>
              ).
            </p>
          </>
        ) : (
          <p>
            <strong>The agents are real.</strong> They are Claude Code sessions on your own login:
            they draft, plan, build, check and run your software, and premise asks you before
            anything leaves this machine. This uses part of your Claude plan.
          </p>
        )}
        {overview.line.standInStages.length > 0 && (
          <p>
            Not built yet in premise, so <Define term="standIn">stand-ins</Define>:{" "}
            {overview.line.standInStages.map(stageName).join(", ")}.
          </p>
        )}
        {overview.usage.mocked && (
          <p>
            Usage and cost figures are <Define term="mocked">mocked</Define>: made up until
            usage-ledger exists. They are labelled Mocked wherever they appear.
          </p>
        )}
      </section>
    </div>
  );
}
