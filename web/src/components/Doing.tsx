import type { MeasuresView } from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { plural } from "../words";
import { Problem } from "./Badges";
import { Learned } from "./Learned";

/**
 * "How premise is doing": its own return, for every software together and for each one
 * (docs/specs/measures.md), then what it learned from corrections across softwares. The figures
 * are real, worked out from what premise recorded; none of them is mocked.
 */
export function Doing() {
  const { api, version, notCurrent } = useSession();
  const measures = useLoad(() => api.measures(), [], version, notCurrent);
  return (
    <div className="doing">
      <h1>How premise is doing</h1>
      <p className="muted">
        premise's own return: how much of your attention it took, how long things took, and how
        often something it said worked came back as a bug. Worked out from what premise recorded;
        these figures are real, not mocked. With too few events to go on, a figure says "not enough
        yet".
      </p>
      {measures.state === "loading" && <p className="muted">Loading the figures…</p>}
      {measures.state === "error" && <Problem>{measures.message}</Problem>}
      {measures.state === "ready" && (
        <>
          <Figures view={measures.data.overall} heading="Every software" />
          {measures.data.softwares.length > 1 &&
            measures.data.softwares.map((s) => (
              <Figures key={s.softwareId} view={s} heading={s.name} collapsed />
            ))}
          <p className="muted small">
            A rate or a typical time needs at least {measures.data.minEvents} events (the setting
            measures.min_events).
          </p>
        </>
      )}
      <Learned softwareId={null} />
    </div>
  );
}

function Figures({
  view,
  heading,
  collapsed = false,
}: {
  view: MeasuresView;
  heading: string;
  collapsed?: boolean;
}) {
  const body = (
    <>
      <dl className="figures">
        {view.figures.map((f) => (
          <div key={f.key} className={`figure ${f.enough ? "" : "figure-thin"}`}>
            <dt>{f.label}</dt>
            <dd>
              <strong>{f.value}</strong>
              <span className="muted small"> {f.counts}</span>
              <details className="evidence">
                <summary className="small muted">how this is worked out</summary>
                <span className="muted small">{f.how}</span>
              </details>
            </dd>
          </div>
        ))}
      </dl>
      {view.attentionByRole.length > 0 && (
        <>
          <h3>Attention by role</h3>
          <ul>
            {view.attentionByRole.map((r) => (
              <li key={r.name}>
                {r.name}: about {Math.round(r.minutes)} min, on {plural(r.asks, "question")}
              </li>
            ))}
          </ul>
        </>
      )}
      {view.attentionByChange.length > 0 && (
        <>
          <h3>Attention by change</h3>
          <ul>
            {view.attentionByChange.map((r) => (
              <li key={r.name}>
                {r.name}: about {Math.round(r.minutes)} min, on {plural(r.asks, "question")}
              </li>
            ))}
          </ul>
        </>
      )}
      {view.sessionsByChange.length > 0 && (
        <>
          <h3>Agent sessions by change</h3>
          <ul>
            {view.sessionsByChange.map((r) => (
              <li key={r.name}>
                {r.name}: {plural(r.sessions, "session")}
              </li>
            ))}
          </ul>
        </>
      )}
      {view.misses.length > 0 && (
        <>
          <h3>Said to work, came back as a bug</h3>
          <ul>
            {view.misses.map((m) => (
              <li key={`${m.softwareId}-${m.intake}`}>
                {m.intake} against {m.item}: {m.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
  return collapsed ? (
    <details className="card">
      <summary>{heading}</summary>
      {body}
    </details>
  ) : (
    <section className="card" aria-label={heading}>
      <h2>{heading}</h2>
      {body}
    </section>
  );
}
