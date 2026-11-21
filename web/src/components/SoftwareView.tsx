import { useRef } from "react";
import type { AskView } from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { stageName, whereNow } from "../../../src/shared/stages";
import { percent } from "../words";
import { MockedBadge, Problem, StandInBadge } from "./Badges";
import { Conversation } from "./Conversation";
import { IntakeView } from "./IntakeView";
import { Line } from "./Line";
import { RecordView } from "./RecordView";
import { ReportView } from "./ReportView";

export type SoftwareTab = "conversation" | "line" | "record" | "report" | "intake";

const TABS: { id: SoftwareTab; label: string }[] = [
  { id: "conversation", label: "Conversation" },
  { id: "line", label: "Line" },
  { id: "record", label: "Record" },
  { id: "report", label: "Report" },
  { id: "intake", label: "Intake" },
];

/** One software: where it is, what waits on you, and its conversation, line, record, report and intake. */
export function SoftwareView({
  softwareId,
  tab,
  onTab,
  asks,
}: {
  softwareId: string;
  tab: SoftwareTab;
  onTab: (tab: SoftwareTab) => void;
  asks: AskView[];
}) {
  const { api, version, notCurrent } = useSession();
  const software = useLoad(() => api.software(softwareId), [softwareId], version, notCurrent);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  if (software.state === "loading") return <p className="muted">Loading…</p>;
  if (software.state === "error") return <Problem>{software.message}</Problem>;
  const s = software.data;
  const open = asks.filter((a) => a.status === "open" && a.softwareId === s.id).length;

  function onTabKey(event: React.KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + TABS.length) % TABS.length;
    onTab(TABS[next]!.id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="software">
      <header className="software-head">
        <h1>{s.name}</h1>
        <p className="where">
          <strong>{whereNow(s.stage)}</strong>{" "}
          <span className="muted small">(step: {stageName(s.stage)})</span>
        </p>
        <p className={`status status-${open > 0 ? "needs-you" : s.state}`} role="status">
          {s.status}
        </p>
        <div className="head-facts small muted">
          <span>Size {s.sizeClass}</span>
          <span>Priority {s.priority}</span>
          <span>
            Usage: {s.usage.sessions} sessions, ${s.usage.costUsd.toFixed(2)},{" "}
            {percent(s.usage.weeklyShare)} of the week {s.usage.mocked && <MockedBadge />}
          </span>
          {(["build", "check", "run", "report"] as const).includes(s.stage as "build") && (
            <StandInBadge />
          )}
        </div>
        <details className="idea">
          <summary>What you asked for</summary>
          <p>{s.idea}</p>
        </details>
      </header>

      <div className="tabs" role="tablist" aria-label={`${s.name} views`}>
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => onTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.label}
            {t.id === "conversation" && open > 0 && <span className="count">{open}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="panel">
        {tab === "conversation" && <Conversation softwareId={s.id} asks={asks} />}
        {tab === "line" && <Line software={s} />}
        {tab === "record" && <RecordView softwareId={s.id} />}
        {tab === "report" && <ReportView softwareId={s.id} />}
        {tab === "intake" && <IntakeView softwareId={s.id} />}
      </div>
    </div>
  );
}
