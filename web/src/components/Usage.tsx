import { useState } from "react";
import type { Overview, SoftwareUsageView, UsageCost, UsageRowView } from "../api";
import { useSession } from "../context";
import { ageWords, ownFiguresWords } from "../../../src/shared/own-figures";
import { useLoad } from "../hooks";
import { percent, when } from "../words";
import { BudgetEditor, OverrunNotice } from "./Budget";
import { DemoBadge, Problem } from "./Badges";

const money = (usd: number) => `$${usd.toFixed(2)}`;
const minutes = (n: number) =>
  n < 1 ? "under a minute" : n < 90 ? `${Math.round(n)} min` : `${Math.round(n / 6) / 10} h`;
const tokens = (n: number): string =>
  n >= 1_000_000
    ? `${Math.round(n / 100_000) / 10}M`
    : n >= 1000
      ? `${Math.round(n / 100) / 10}k`
      : String(n);

/** A cost in a few words: the dollars, or "not known", with how many sessions it covers. */
function costText(c: UsageCost): string {
  if (c.sessions === 0) return "nothing yet";
  if (c.costUsd === null) return "not known";
  const all = c.priced >= c.sessions;
  return `${money(c.costUsd)}${all ? "" : ` (${c.priced} of ${c.sessions} sessions)`}`;
}

/** A share of the week: whole percent, and "under 1%" rather than a misleading 0%. */
function share(value: number): string {
  if (value === 0) return "none";
  return value < 0.01 ? "under 1%" : percent(value);
}

function tokenText(c: UsageCost): string | null {
  if (c.inputTokens === null && c.outputTokens === null && c.cacheTokens === null) return null;
  const sum = (c.inputTokens ?? 0) + (c.outputTokens ?? 0) + (c.cacheTokens ?? 0);
  return `${tokens(sum)} tokens`;
}

/**
 * Usage and cost, and each software's budget (decision 0330). Cost figures come from usage-ledger,
 * which reads Claude Code's own logs; one that is not known says so and why. Scripted agents use
 * nothing, so with them the figures are made-up demo figures and say so. Sessions and minutes,
 * and premise's own count, are premise's own.
 */
export function Usage({ overview }: { overview: Overview }) {
  const { api, version, notCurrent } = useSession();
  const usage = useLoad(() => api.usage(), [], version, notCurrent);
  if (usage.state === "loading") return <p className="muted">Loading…</p>;
  if (usage.state === "error") return <Problem>{usage.message}</Problem>;
  const u = usage.data;
  const demo = u.source === "demo";
  return (
    <section aria-labelledby="usage-title">
      <h1 id="usage-title">Usage {demo && <DemoBadge />}</h1>
      {u.problem && <Problem>{u.problem}</Problem>}
      {demo ? (
        <p className="note">
          Agents are scripted: they call no AI and use nothing, so the cost figures here are made up
          to show where real ones appear (setting <code>usage_ledger.mode</code>, now{" "}
          <code>{u.mode}</code>). Sessions and minutes are premise's own counts and are real.
        </p>
      ) : (
        <p className="muted">
          What the agents' work used, per software. Cost and tokens come from usage-ledger, which
          reads Claude Code's own logs, at list prices (not what your plan charges). premise asks it
          about each session soon after the session ends.
        </p>
      )}
      <p className="muted">
        You can also set how much each software may use in a week, as a share of your weekly usage
        or as an amount.
      </p>
      <section className="card" aria-label="This week">
        <h2>This week</h2>
        {u.ownWindow ? (
          <>
            <div
              className="meter"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(u.ownWindow.usedPercent)}
              aria-label="Share of the week's usage used"
            >
              <div
                className="meter-fill"
                style={{ width: `${Math.min(100, Math.max(0, u.ownWindow.usedPercent))}%` }}
              />
            </div>
            <p>
              {Math.round(u.ownWindow.usedPercent)}% of your plan's weekly usage was used when a
              real agent session last reported it, {ageWords(u.ownWindow.readAt)}
              {u.ownWindow.resetsAt ? `; the week resets ${when(u.ownWindow.resetsAt)}` : ""}. It
              counts everything on your plan, not only premise, and is only as fresh as the last
              real session.
            </p>
          </>
        ) : (
          <p className="empty-line">
            No reading yet: the week's figure comes with the first real agent session. Scripted
            agents report none.
          </p>
        )}
        {u.demoWeekly && (
          <p>
            <DemoBadge /> The demo's made-up week: {percent(u.demoWeekly.utilization)} used,
            resetting {when(u.demoWeekly.resetsAt)}.
          </p>
        )}
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
  const c = s.total.cost;
  const demo = c.source === "demo";
  const tok = tokenText(c);
  return (
    <section className="card" aria-label={`${s.name} usage`}>
      <h2>{s.name}</h2>
      <OverrunNotice softwareId={s.softwareId} budget={s.budget} />
      <BudgetEditor softwareId={s.softwareId} budget={s.budget} />
      {s.problem && <Problem>{s.problem}</Problem>}
      <p>
        <strong>All of it:</strong> {s.total.measured.sessions} agent session
        {s.total.measured.sessions === 1 ? "" : "s"}, {minutes(s.total.measured.minutes)} of work.
      </p>
      <p>
        <strong>premise's own count:</strong> {ownFiguresWords(s.total.measured.figures)}{" "}
        <span className="muted small">(from each session's own result)</span>
      </p>
      <p>
        <strong>usage-ledger:</strong>{" "}
        {c.sessions === 0
          ? "nothing yet."
          : c.costUsd === null
            ? `cost not known yet${c.why ? `: ${c.why}` : ""}.`
            : `about ${money(c.costUsd)} at list prices${tok ? `, ${tok}` : ""}${c.why ? `; ${c.why}` : ""}.`}{" "}
        {demo && <DemoBadge />}
      </p>
      <p>
        <strong>Share of this week:</strong>{" "}
        {c.weeklyShare === null
          ? (c.weeklyWhy ?? "not known.")
          : `${c.weeklyShare === 0 ? "" : "about "}${share(c.weeklyShare)}${c.weeklyWhy ? ` (${c.weeklyWhy})` : ""}.`}{" "}
        {demo && <DemoBadge />}
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
  const demo = rows.some((r) => r.cost.source === "demo");
  // Real figures have no share of the week below a software: say why once, not in every row.
  const shares = rows.some((r) => r.cost.weeklyShare !== null);
  const noShare = shares ? null : (rows.find((r) => r.cost.weeklyWhy)?.cost.weeklyWhy ?? null);
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        {title} {demo && <DemoBadge />}
      </summary>
      {note && <p className="small muted">{note}</p>}
      {noShare && <p className="small muted">Share of the week: {noShare}.</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{title.replace("By ", "").replace(/^./, (c) => c.toUpperCase())}</th>
              <th scope="col">Agent sessions</th>
              <th scope="col">Time worked</th>
              <th scope="col">premise's own count</th>
              <th scope="col">At list prices {demo && <span className="muted">(demo)</span>}</th>
              {shares && (
                <th scope="col">Share of a week {demo && <span className="muted">(demo)</span>}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td>{r.measured.sessions}</td>
                <td>{minutes(r.measured.minutes)}</td>
                <td>{ownFiguresWords(r.measured.figures)}</td>
                <td>
                  {costText(r.cost)} {r.cost.source === "demo" && <DemoBadge />}
                  {r.cost.why && <div className="small muted">{r.cost.why}</div>}
                </td>
                {shares && (
                  <td>
                    {r.cost.weeklyShare === null ? "not known" : share(r.cost.weeklyShare)}{" "}
                    {r.cost.source === "demo" && <DemoBadge />}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
