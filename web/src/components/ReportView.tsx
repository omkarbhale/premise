import type { ReportLine } from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { when } from "../words";
import { MockedBadge, Problem, StandInBadge } from "./Badges";
import { RunPanel } from "./RunPanel";
import { useState } from "react";

export function ReportView({ softwareId }: { softwareId: string }) {
  const { api, version, notCurrent } = useSession();
  const [detail, setDetail] = useState(false);
  const report = useLoad(
    () => api.report(softwareId, detail),
    [softwareId, detail],
    version,
    notCurrent,
  );
  if (report.state === "loading") return <p className="muted">Loading the report…</p>;
  if (report.state === "error") return <Problem>{report.message}</Problem>;
  const r = report.data;
  return (
    <div className="report">
      <p className="muted small">
        This is what premise knows, taken only from what it recorded: the record, the code, the
        checks, what is running and the work queue. If something is not here, it is not known.
      </p>
      <section className="card headline" aria-label="The short version">
        <h2>{r.headline}</h2>
        {r.running ? (
          <p>
            <strong>To try it:</strong> {r.running.how}{" "}
            {r.running.folder && (
              <>
                In the folder <code>{r.running.folder}</code>:{" "}
              </>
            )}
            <code>{r.running.where}</code>
          </p>
        ) : (
          <p className="muted">Nothing is running yet, so there is nothing to try.</p>
        )}
        {r.counts && <p className="small">{r.counts}</p>}
        {r.scripted && (
          <p className="note small" role="note">
            {r.scripted}
          </p>
        )}
      </section>
      <RunPanel softwareId={softwareId} />
      {r.written ? (
        <p>
          Report written {when(r.written)}. {r.source === "stand-in" && <StandInBadge />}
        </p>
      ) : (
        <p className="empty-line">
          No report yet. premise writes one when the software reaches Run. Until then, this shows
          what is known so far.
        </p>
      )}
      {r.sections.map((section) => (
        <section key={section.title} className="card" aria-label={section.title}>
          <h2>{section.title}</h2>
          <p className="muted small">{section.plain}</p>
          {section.lines.length === 0 ? (
            <p className="empty-line">Nothing here.</p>
          ) : (
            <ReportLines lines={section.lines} />
          )}
        </section>
      ))}
      <p>
        <button
          type="button"
          className="quiet"
          aria-pressed={detail}
          onClick={() => setDetail((d) => !d)}
        >
          {detail ? "Show the short report" : "Show more detail"}
        </button>{" "}
        {!detail && r.hiddenLines > 0 && (
          <span className="muted small">
            {r.hiddenLines} more line{r.hiddenLines === 1 ? " is" : "s are"} left out of the short
            report.
          </span>
        )}
      </p>
      {r.doing && (
        <section className="card" aria-label="How premise is doing">
          <h2>How premise is doing</h2>
          <p className="muted small">{r.doing.plain}</p>
          <ul>
            {r.doing.lines.map((line, i) => (
              <li key={i}>
                {line.text}
                {line.evidence && (
                  <details className="evidence">
                    <summary className="small muted">how this is worked out</summary>
                    <span className="muted small">{line.evidence}</span>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card" aria-label="Cost">
        <h2>Cost {r.cost.mocked && <MockedBadge />}</h2>
        {r.cost.own && <p>{r.cost.own}</p>}
        <p>
          {r.cost.text}
          {r.cost.mocked && " These figures are made up until usage-ledger exists."}
        </p>
        {r.cost.lines && r.cost.lines.length > 0 && (
          <details>
            <summary>
              What it went on, by step, change and item {r.cost.mocked && <MockedBadge />}
            </summary>
            <p className="small muted">
              The counts of sessions and minutes are premise's own. The dollar figures come from
              usage-ledger{r.cost.mocked ? " and are mocked" : ""}.
            </p>
            {(["stage", "change", "item"] as const).map((group) => {
              const lines = r.cost.lines!.filter((l) => l.group === group);
              if (lines.length === 0) return null;
              return (
                <div key={group}>
                  <h3>
                    {{ stage: "By step", change: "By change", item: "By record item" }[group]}
                  </h3>
                  <ul>
                    {lines.map((l) => (
                      <li key={l.label}>
                        {l.label}: {l.measured}; {l.cost} {l.mocked && <MockedBadge />}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </details>
        )}
      </section>
      {r.limits.length > 0 && (
        <section className="card note" aria-label="What this report cannot tell you">
          <h2>What this report cannot tell you</h2>
          <ul>
            {r.limits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * A section's lines: what people said first; premise's own assumptions and choices folded under a
 * disclosure, so the person sees their own decisions without reading premise's.
 */
function ReportLines({ lines }: { lines: ReportLine[] }) {
  const people = lines.filter((l) => !l.premises && !l.earlier);
  const own = lines.filter((l) => l.premises && !l.earlier);
  const earlier = lines.filter((l) => l.earlier);
  return (
    <>
      {people.length > 0 ? (
        <ul>
          {people.map((line, i) => (
            <Line key={i} line={line} />
          ))}
        </ul>
      ) : (
        own.length > 0 && <p className="empty-line">Nothing you decided yet.</p>
      )}
      {own.length > 0 && (
        <details className="premises-own">
          <summary>
            What premise assumed or chose itself ({own.length}). Strike anything wrong at the next
            say back, or say so in chat.
          </summary>
          <ul>
            {own.map((line, i) => (
              <Line key={i} line={line} />
            ))}
          </ul>
        </details>
      )}
      {earlier.length > 0 && (
        <details className="premises-own">
          <summary>Decided before this report, unchanged ({earlier.length})</summary>
          <ul>
            {earlier.map((line, i) => (
              <Line key={i} line={line} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Line({ line }: { line: ReportLine }) {
  return (
    <li>
      {line.text}
      {line.evidence && (
        <details className="evidence">
          <summary className="small muted">details</summary>
          <span className="muted small">{line.evidence}</span>
        </details>
      )}
    </li>
  );
}
