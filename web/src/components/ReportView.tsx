import { useSession } from "../context";
import { useLoad } from "../hooks";
import { when } from "../words";
import { MockedBadge, Problem, StandInBadge } from "./Badges";

export function ReportView({ softwareId }: { softwareId: string }) {
  const { api, version, notCurrent } = useSession();
  const report = useLoad(() => api.report(softwareId), [softwareId], version, notCurrent);
  if (report.state === "loading") return <p className="muted">Loading the report…</p>;
  if (report.state === "error") return <Problem>{report.message}</Problem>;
  const r = report.data;
  return (
    <div className="report">
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
      {r.running && (
        <section className="card running" aria-label="Open the running software">
          <h2>Open it</h2>
          <p>{r.running.where}</p>
        </section>
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
                  {line.evidence && <span className="muted small"> ({line.evidence})</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <section className="card" aria-label="Cost">
        <h2>Cost {r.cost.mocked && <MockedBadge />}</h2>
        <p>
          {r.cost.text}
          {r.cost.mocked && " These figures are made up until usage-ledger exists."}
        </p>
      </section>
    </div>
  );
}
