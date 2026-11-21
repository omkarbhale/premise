import { useState } from "react";
import type { Overview, SoftwareUsageView, UsageRowView } from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { TERMS, percent, when } from "../words";
import { BudgetEditor, OverrunNotice } from "./Budget";
import { MockedBadge, Problem } from "./Badges";

const money = (usd: number) => `$${usd.toFixed(2)}`;
const minutes = (n: number) =>
  n < 1 ? "under a minute" : n < 90 ? `${Math.round(n)} min` : `${Math.round(n / 6) / 10} h`;

/**
 * Usage and cost, and each software's budget. The figures come from usage-ledger and are mocked
 * until it exists (decision 0133), so each one is labelled; the counts of sessions and minutes are
 * premise's own and are not.
 */
export function Usage({ overview }: { overview: Overview }) {
  const { api, version, notCurrent } = useSession();
  const usage = useLoad(() => api.usage(), [], version, notCurrent);
  if (usage.state === "loading") return <p className="muted">Loading…</p>;
  if (usage.state === "error") return <Problem>{usage.message}</Problem>;
  const u = usage.data;
  const weekly = u.weekly;
  return (
    <section aria-labelledby="usage-title">
      <h1 id="usage-title">Usage {u.mocked && <MockedBadge />}</h1>
      {u.mocked && (
        <p className="note">
          {TERMS.mocked} Kind of mock: <code>{u.mode}</code> (setting <code>usage_ledger.mode</code>
          ). Sessions and minutes are premise's own counts and are real.
        </p>
      )}
      <p className="muted">
        Set how much each software may use in a week, as a share of your weekly usage or as an
        amount. When one uses it up, only its work pauses; you choose what happens next.
      </p>
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
      {overview.softwares.length === 0 ? (
        <section className="card">
          <h2>Per software</h2>
          <p className="empty-line">
            No software yet. Each one's usage appears here once it starts.
          </p>
        </section>
      ) : (
        u.softwares.map((s) => <SoftwareUsage key={s.softwareId} s={s} />)
      )}
    </section>
  );
}

function SoftwareUsage({ s }: { s: SoftwareUsageView }) {
  return (
    <section className="card" aria-label={`${s.name} usage`}>
      <h2>{s.name}</h2>
      <OverrunNotice softwareId={s.softwareId} budget={s.budget} />
      <BudgetEditor softwareId={s.softwareId} budget={s.budget} />
      {s.problem && <Problem>{s.problem}</Problem>}
      <p>
        <strong>All of it:</strong> {s.total.measured.sessions} agent session
        {s.total.measured.sessions === 1 ? "" : "s"}, {minutes(s.total.measured.minutes)} of work;{" "}
        about {money(s.total.cost.costUsd)} at list prices {s.total.cost.mocked && <MockedBadge />}
      </p>
      <Breakdown title="By phase" rows={s.byPhase} />
      <Breakdown title="By step" rows={s.byStage} />
      <Breakdown title="By change" rows={s.byChange} />
      <Breakdown
        title="By record item"
        rows={s.byItem}
        note="A session that worked on several items shares its cost among them; its count and minutes show in each."
      />
    </section>
  );
}

function Breakdown({ title, rows, note }: { title: string; rows: UsageRowView[]; note?: string }) {
  const [open, setOpen] = useState(title === "By phase");
  if (rows.length === 0) return null;
  const mocked = rows.some((r) => r.cost.mocked);
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        {title} {mocked && <MockedBadge />}
      </summary>
      {note && <p className="small muted">{note}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{title.replace("By ", "").replace(/^./, (c) => c.toUpperCase())}</th>
              <th scope="col">Agent sessions</th>
              <th scope="col">Time worked</th>
              <th scope="col">
                At list prices {mocked && <span className="muted">(mocked)</span>}
              </th>
              <th scope="col">
                Share of a week {mocked && <span className="muted">(mocked)</span>}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td>{r.measured.sessions}</td>
                <td>{minutes(r.measured.minutes)}</td>
                <td>
                  {money(r.cost.costUsd)} {r.cost.mocked && <MockedBadge />}
                </td>
                <td>
                  {percent(r.cost.weeklyShare)} {r.cost.mocked && <MockedBadge />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
