import type { BuildTaskView, BuildView, CheckView, VerdictValue } from "../api";
import { when } from "../words";

const TASK_STATUS: Record<BuildTaskView["status"], string> = {
  "waiting-to-start": "Waiting to start",
  building: "Being built now",
  built: "Built",
  "waiting-on-person": "Waiting for your answer",
  stopped: "Stopped",
};

const CHECK_STATUS: Record<CheckView["status"], string> = {
  "writing-scenarios": "Writing the checks from your record, before anything is built",
  checking: "Being checked now",
  passed: "Passed: everything it had to check is met",
  "not-fully-verified":
    "No failure found, but not fully verified: some things could not be checked",
  "not-verified": "Not verified: nothing failed, but nothing could be checked",
  "not-passed": "Not passed: back to the builder with what was wrong",
  stopped: "Stopped: premise asks you what to do",
  "did-not-finish": "The check did not finish",
  "waiting-for-tool":
    "Could not use it: a program the agents need is missing. Not counted as a failed round; it runs again once you answer",
};

const VERDICT: Record<VerdictValue, string> = {
  met: "Met",
  "not-met": "Not met",
  "could-not-check": "Could not check",
};

const short = (sha: string) => sha.slice(0, 7);

function tally(check: CheckView): string {
  const count = (v: VerdictValue) => check.verdicts.filter((x) => x.verdict === v).length;
  if (check.verdicts.length === 0) return "";
  return ` (${count("met")} met, ${count("not-met")} not met, ${count("could-not-check")} could not check)`;
}

/** How the landed version's check ended, never "passed" unless it did (decision 0197). */
function landedWords(checks: CheckView[], commit: string): string {
  const check = [...checks].reverse().find((c) => c.commit === commit && c.verdicts.length > 0);
  switch (check?.status) {
    case "passed":
      return "passed its check";
    case "not-fully-verified":
      return "had no failure found, but is not fully verified";
    case "not-verified":
      return "is not verified: its check could check nothing";
    default:
      return "was landed with what its check found still open";
  }
}

/**
 * Build and Check for the milestone being worked on, in plain words: each task and where it is,
 * each check of an exact version with its verdict per item and the evidence, what landed, and what
 * waits on a person (docs/specs/page.md).
 */
export function BuildPanel({ build }: { build: BuildView }) {
  const lastCheck = build.checks.length - 1;
  return (
    <section className="build-panel" aria-label="What is being built and checked">
      <h3>
        {build.milestone
          ? `Milestone: ${build.milestone.text.trim().replace(/\.+$/, "")}`
          : "Building what the plan says"}
      </h3>
      <p className="muted small">
        Agents build each task in their own copy of the code. A separate agent then checks the
        result the way a user would, against what you asked for, without seeing how it was built. If
        a must item is not met, the work goes back to the builder with the evidence; after{" "}
        {build.roundsAllowed} rounds premise stops and asks you.
      </p>

      {build.waiting.length > 0 && (
        <div className="build-waiting" role="note">
          <strong>Waiting on you:</strong>
          <ul>
            {build.waiting.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <span className="small">It is in the Conversation tab.</span>
        </div>
      )}

      <h4>Tasks{build.round > 1 ? ` (round ${build.round} of ${build.roundsAllowed})` : ""}</h4>
      {build.tasks.length === 0 ? (
        <p className="muted small">No task has started yet.</p>
      ) : (
        <ol className="build-tasks">
          {build.tasks.map((t) => (
            <li key={`${t.number}-${t.title}`} className={`build-task task-${t.status}`}>
              <span>
                {t.fix ? <strong>Fix: </strong> : null}
                {t.title}
                {t.items.length > 0 && (
                  <span className="muted small"> (serves {t.items.join(", ")})</span>
                )}
              </span>{" "}
              <span className={`chip chip-task-${t.status}`}>{TASK_STATUS[t.status]}</span>
              {t.commit && <span className="muted small"> version {short(t.commit)}</span>}
              {t.note && <p className="small muted">{t.note}</p>}
            </li>
          ))}
        </ol>
      )}

      <h4>Checks</h4>
      <p className="muted small">
        {build.scenarios === 0
          ? "No check scenarios are written yet."
          : `${build.scenarios} check ${build.scenarios === 1 ? "scenario was" : "scenarios were"} written from your record, kept where builders cannot read them.`}
      </p>
      {build.checks.length === 0 ? (
        <p className="muted small">Nothing has been checked yet.</p>
      ) : (
        <ul className="build-checks">
          {build.checks.map((c, i) => (
            <li key={`${c.round}-${c.commit}-${i}`} className={`check check-${c.status}`}>
              <details open={i === lastCheck}>
                <summary>
                  {c.commit ? `Round ${c.round}, version ${short(c.commit)}: ` : ""}
                  <strong>{CHECK_STATUS[c.status]}</strong>
                  {tally(c)}
                </summary>
                {c.scripted && (
                  <p className="note small">
                    This check was made by a scripted agent. Scripted agents cannot judge software:
                    at most they run fixed steps and compare what is printed.
                  </p>
                )}
                {c.verdicts.length > 0 && (
                  <ul className="verdicts">
                    {c.verdicts.map((v) => (
                      <li key={v.item}>
                        <span className={`chip verdict-${v.verdict}`}>{VERDICT[v.verdict]}</span>{" "}
                        <strong>{v.item}</strong> {v.text}
                        <details className="evidence">
                          <summary className="small">What the checker saw</summary>
                          <pre>{v.evidence}</pre>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
                {c.findings.length > 0 && (
                  <>
                    <p className="small">Also found:</p>
                    <ul className="small">
                      {c.findings.map((f) => (
                        <li key={f.text}>
                          {f.text}
                          {f.blocking ? " (must be fixed before it lands)" : ""}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}

      {build.landed && (
        <p className="build-landed">
          <strong>Landed:</strong> version {short(build.landed.commit)}{" "}
          {landedWords(build.checks, build.landed.commit)} and was merged on{" "}
          {when(build.landed.when)}. How to open it is under Running.
        </p>
      )}
    </section>
  );
}
