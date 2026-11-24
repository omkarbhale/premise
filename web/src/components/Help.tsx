import { PHASES, STAGES } from "../../../src/shared/stages";
import { GLOSS, TERMS } from "../words";

/** Everything a newcomer might wonder about, on one short page. */
export function Help() {
  return (
    <section aria-labelledby="help-title" className="help">
      <h1 id="help-title">How premise works</h1>
      <section className="card">
        <h2>In one minute</h2>
        <ul>
          <li>You describe a software in a sentence or two.</li>
          <li>
            premise drafts each step as a short list. You correct it: strike what is wrong, edit
            what is half right, leave the rest.
          </li>
          <li>
            Agents build and check it without you. premise asks only where your answer matters.
          </li>
          <li>
            Whatever needs you is under <strong>Waiting on you</strong>, and on the software's own
            page; the browser tab shows how many things are waiting.
          </li>
        </ul>
      </section>
      <section className="card">
        <h2>The three phases</h2>
        <ol>
          {PHASES.map((p) => (
            <li key={p.id}>
              <strong>{p.name}:</strong> {p.plain}
              <details className="term">
                <summary>Steps in {p.name}</summary>
                <ul>
                  {STAGES.filter((s) => (p.stages as readonly string[]).includes(s.id)).map((s) => (
                    <li key={s.id}>
                      <strong>{s.name}:</strong> {s.plain}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ol>
        <p className="muted small">
          Some software does not need every step; premise passes over the ones it does not need.
        </p>
      </section>
      <section className="card">
        <h2>Software you already have</h2>
        <ul>
          <li>
            Under <strong>Start or bring in</strong>, give a folder on this computer that is a git
            repository, or a clone address. premise copies it and works on its copy; your folder is
            never changed.
          </li>
          <li>
            A drafter reads the code, its documents and its history and writes down why it exists,
            who it is for, what it does and its decisions, each marked recovered. Where the code and
            its documents disagree, it asks you.
          </li>
          <li>
            You go through that list once and strike what is wrong. It usually misses things: say
            what is missing in chat or on the Intake tab, and it goes through the line like any
            change.
          </li>
          <li>
            premise says what it could not check (for example, how to start it) and what it would
            need, and asks before adding its record to your repository, on a branch named premise.
          </li>
          <li>
            Changes made by hand outside premise are not followed yet, so the record drifts from
            them.
          </li>
        </ul>
      </section>
      <section className="card">
        <h2>Several softwares at once</h2>
        <ul>
          <li>
            Start as many as you like. The list puts whatever is waiting on you first. Each one
            shows where it is and what it is doing now.
          </li>
          <li>
            Agents are shared between them: the most important software (priority 1) goes first, and
            none waits forever. Change a software's priority under its name.
          </li>
          <li>
            <strong>Pause</strong> a software to stop new work on it and give its agents to the
            others; its questions stay answerable. <strong>Resume</strong> carries on where it
            stopped.
          </li>
          <li>
            <strong>Archive</strong> a finished or paused software to hide it from the list. Nothing
            is deleted, and <strong>Restore</strong> brings it back.
          </li>
          <li>
            <strong>Summary</strong> (once there are two) says in one place what waits on you and
            what changed since you last looked.
          </li>
        </ul>
      </section>
      <section className="card">
        <h2>Words you will see</h2>
        <dl className="glossary">
          <dt>The record</dt>
          <dd>{TERMS.record}</dd>
          <dt>Say back</dt>
          <dd>{TERMS.sayBack}</dd>
          <dt>The floor</dt>
          <dd>{TERMS.floor}</dd>
          <dt>Roles</dt>
          <dd>{TERMS.role}</dd>
          <dt>Intake</dt>
          <dd>{TERMS.intake}</dd>
          <dt>Stand-in</dt>
          <dd>{TERMS.standIn}</dd>
          <dt>usage-ledger</dt>
          <dd>{TERMS.usageLedger}</dd>
          <dt>Demo figures</dt>
          <dd>{TERMS.demoFigures}</dd>
          <dt>Milestone</dt>
          <dd>{GLOSS.milestone[0]!.toUpperCase() + GLOSS.milestone.slice(1)}.</dd>
          <dt>Approval</dt>
          <dd>{GLOSS.approval[0]!.toUpperCase() + GLOSS.approval.slice(1)}.</dd>
          <dt>Scripted agents</dt>
          <dd>{GLOSS.scriptedAgents[0]!.toUpperCase() + GLOSS.scriptedAgents.slice(1)}.</dd>
        </dl>
      </section>
      <section className="card">
        <h2>Keyboard</h2>
        <ul>
          <li>Tab moves between controls; Enter or Space presses a button.</li>
          <li>In chat, Enter sends and Shift+Enter starts a new line.</li>
          <li>When starting a software, Ctrl+Enter starts it.</li>
        </ul>
      </section>
      <section className="card">
        <h2>Stopping and coming back</h2>
        <ul>
          <li>
            <strong>Pause everything</strong> (top of the page) starts nothing new in any software.
            Choose <em>let what is running finish</em> (the default) or <em>stop it now</em>; then
            the banner says what is still finishing and when it is safe to close premise. You can
            still answer questions while paused. <strong>Resume</strong> starts work again.
          </li>
          <li>
            To stop premise, press Ctrl+C in its terminal once: it lets the running work finish,
            then stops. Press it again to stop at once; the cut-off work is simply redone next time.
            From another terminal, run <code>npm run stop</code> (or{" "}
            <code>npm run stop -- --now</code>).
          </li>
          <li>
            If you paused everything before stopping, premise starts paused and says so; press
            Resume. Otherwise it carries on from where it stopped. A setting,{" "}
            <code>queue.start_paused</code>, makes it always start paused.
          </li>
          <li>
            A software premise was running stops when premise stops; the page offers to start it
            again.
          </li>
          <li>
            If the computer sleeps while agents work, premise checks them when it wakes and restarts
            any that died, and says so.
          </li>
          <li>
            premise makes a new link each time it starts. Copy it from the terminal, or run{" "}
            <code>npm run new-link</code>. If you work alone on your own machine you can keep the
            same link with <code>server.keep_link</code>; the Settings page explains the risk.
          </li>
        </ul>
      </section>
      <section className="card">
        <h2>The link</h2>
        <p>
          The link premise printed holds a private token: anyone with it on this machine can use
          premise. If you lose it, or think someone else has it, run <code>npm run new-link</code>{" "}
          in a terminal: it prints a new link, and every older one stops working.
        </p>
      </section>
    </section>
  );
}
