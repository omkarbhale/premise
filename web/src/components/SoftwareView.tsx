import { useRef, useState } from "react";
import type { AskView } from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { stageName, whereNow } from "../../../src/shared/stages";
import { Define, Problem } from "./Badges";
import { Conversation } from "./Conversation";
import { ExistingPanel } from "./ExistingPanel";
import { IntakeView } from "./IntakeView";
import { Learned } from "./Learned";
import { Line } from "./Line";
import { RecordView } from "./RecordView";
import { ReportView } from "./ReportView";

export type SoftwareTab = "conversation" | "line" | "record" | "report" | "intake" | "learned";

const TABS: { id: SoftwareTab; label: string; help: string; more?: boolean }[] = [
  {
    id: "conversation",
    label: "Conversation",
    help: "Questions for you, and what you have said to premise",
  },
  { id: "report", label: "Report", help: "What was built, whether it works, and how to try it" },
  {
    id: "line",
    label: "Line",
    help: "The steps the work goes through, and where it is now",
    more: true,
  },
  { id: "record", label: "Record", help: "What was decided, and why", more: true },
  { id: "intake", label: "Intake", help: "Report a problem or ask for a change", more: true },
  {
    id: "learned",
    label: "Learned",
    help: "What premise learned from your corrections, and what it could do better",
    more: true,
  },
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
  const [showMore, setShowMore] = useState(false);

  if (software.state === "loading") return <p className="muted">Loading…</p>;
  if (software.state === "error") return <Problem>{software.message}</Problem>;
  const s = software.data;
  const copyNotReady = s.existing?.status === "copying" || s.existing?.status === "copy-failed";
  const open = asks.filter((a) => a.status === "open" && a.softwareId === s.id).length;

  // Only the tabs a newcomer needs show at first; the rest are one click away, and stay open when
  // one of them is the tab being looked at.
  const expanded = showMore || TABS.find((t) => t.id === tab)?.more === true;
  const tabs = TABS.filter((t) => !t.more || expanded);

  function onTabKey(event: React.KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    onTab(tabs[next]!.id);
    tabRefs.current[next]?.focus();
  }
  const ended = s.state === "ended";

  return (
    <div className="software">
      <header className="software-head">
        <h1>{s.name}</h1>
        <p className="where">
          {ended ? (
            <strong>Ended: you decided not to build it</strong>
          ) : (
            <>
              <strong>{whereNow(s.stage, s.takingOn)}</strong>{" "}
              <span className="muted small">
                · the {stageName(s.stage)} <Define term="step">step</Define>
              </span>
            </>
          )}
        </p>
        <p className={`status status-${open > 0 ? "needs-you" : s.state}`} role="status">
          {open > 0
            ? tab === "conversation"
              ? "Your turn: answer below."
              : "Your turn: the answer is in the Conversation tab."
            : s.status}
        </p>
        <div className="head-facts small muted">
          <span>Size {s.sizeClass}</span>
          <span>Priority {s.priority}</span>
        </div>
        <details className="idea">
          <summary>What you asked for</summary>
          <p>{s.idea}</p>
        </details>
        {s.existing && <ExistingPanel softwareId={s.id} existing={s.existing} />}
      </header>

      <div className="tabs" role="tablist" aria-label={`${s.name} views`}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            title={t.help}
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
        {!expanded && (
          <button type="button" className="quiet" onClick={() => setShowMore(true)}>
            More views
          </button>
        )}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="panel">
        {tab === "conversation" && <Conversation softwareId={s.id} asks={asks} />}
        {tab === "line" && <Line software={s} />}
        {tab === "record" && <RecordView softwareId={s.id} />}
        {tab === "report" && <ReportView softwareId={s.id} />}
        {tab === "intake" && <IntakeView softwareId={s.id} copyNotReady={copyNotReady} />}
        {tab === "learned" && <Learned softwareId={s.id} />}
      </div>
    </div>
  );
}
