import type { Overview } from "../api";
import { TERMS, percent, when } from "../words";
import { MockedBadge } from "./Badges";

/** Usage and cost, from usage-ledger; mocked until it exists (decision 0133). */
export function Usage({ overview }: { overview: Overview }) {
  const weekly = overview.usage.weekly;
  return (
    <section aria-labelledby="usage-title">
      <h1 id="usage-title">Usage {overview.usage.mocked && <MockedBadge />}</h1>
      {overview.usage.mocked && (
        <p className="note">
          {TERMS.mocked} Kind of mock: <code>{overview.usage.mode}</code> (setting{" "}
          <code>usage_ledger.mode</code>).
        </p>
      )}
      <section className="card">
        <h2>This week {weekly.mocked && <MockedBadge />}</h2>
        <div
          className="meter"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(weekly.utilization * 100)}
          aria-label={`${weekly.mocked ? "Mocked " : ""}share of the week's usage used`}
        >
          <div className="meter-fill" style={{ width: percent(weekly.utilization) }} />
        </div>
        <p>
          {percent(weekly.utilization)} of the subscription's weekly usage used
          {weekly.mocked && " (mocked)"}. The week resets {when(weekly.resetsAt)}.
        </p>
      </section>
      <SoftwaresUsage overview={overview} />
    </section>
  );
}

function SoftwaresUsage({ overview }: { overview: Overview }) {
  if (overview.softwares.length === 0) {
    return (
      <section className="card">
        <h2>Per software</h2>
        <p className="empty-line">No software yet. Each one's usage appears here once it starts.</p>
      </section>
    );
  }
  return (
    <section className="card">
      <h2>Per software {overview.usage.mocked && <MockedBadge />}</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Software</th>
              <th scope="col">Agent sessions</th>
              <th scope="col">Tokens in, out</th>
              <th scope="col">At list prices</th>
              <th scope="col">Share of the week</th>
            </tr>
          </thead>
          <tbody>
            {overview.softwares.map((s) => {
              const u = overview.softwareUsage.find((x) => x.softwareId === s.id);
              return (
                <tr key={s.id}>
                  <th scope="row">{s.name}</th>
                  <td>{u ? u.sessions : "–"}</td>
                  <td>
                    {u
                      ? `${u.inputTokens.toLocaleString()}, ${u.outputTokens.toLocaleString()}`
                      : "–"}
                  </td>
                  <td>{u ? `$${u.costUsd.toFixed(2)}` : "–"}</td>
                  <td>{u ? percent(u.weeklyShare) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
