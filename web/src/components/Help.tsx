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
          <dt>Mocked</dt>
          <dd>{TERMS.mocked}</dd>
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
