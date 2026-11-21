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
            <ul>
              {section.lines.map((line, i) => (
                <li key={i}>
                  {line.text}
                  {line.evidence && (
                    <details className="evidence">
                      <summary className="small muted">details</summary>
                      <span className="muted small">{line.evidence}</span>
                    </details>
                  )}
                </li>
              ))}
            </ul>
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
        <p>
          {r.cost.text}
          {r.cost.mocked && " These figures are made up until usage-ledger exists."}
        </p>
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
