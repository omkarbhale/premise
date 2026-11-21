import { STAGES } from "../../../src/shared/stages";
import { TERMS } from "../words";

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
            Whatever needs you is under <strong>Waiting on you</strong>; the browser tab shows how
            many things are waiting.
          </li>
        </ul>
      </section>
      <section className="card">
        <h2>The eleven stages (the line)</h2>
        <ol>
          {STAGES.map((s) => (
            <li key={s.id}>
              <strong>{s.name}:</strong> {s.plain}
            </li>
          ))}
        </ol>
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
