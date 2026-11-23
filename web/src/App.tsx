import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Api, type AskView, createApi, sessionToken } from "./api";
import { Activity } from "./components/Activity";
import { AgentsBanner } from "./components/AgentsBanner";
import { MockedBadge, Problem } from "./components/Badges";
import { PauseBanner, PauseControl, SleepNotice, StartupNotice } from "./components/Pausing";
import { Help } from "./components/Help";
import { Needed } from "./components/Needed";
import { Settings } from "./components/Settings";
import { SoftwareView, type SoftwareTab } from "./components/SoftwareView";
import { BringInForm } from "./components/BringInForm";
import { Doing } from "./components/Doing";
import { StartForm } from "./components/StartForm";
import { Summary } from "./components/Summary";
import { Usage } from "./components/Usage";
import { Welcome } from "./components/Welcome";
import { SessionContext, type Session, useSession as useSessionContext } from "./context";
import { type Connection, useEventStream, useLoad } from "./hooks";
import { stageName, whereNow } from "../../src/shared/stages";
import { plural } from "./words";

type View =
  | { name: "software"; id: string | null }
  | { name: "start" }
  | { name: "needed" }
  | { name: "summary" }
  | { name: "activity" }
  | { name: "usage" }
  | { name: "doing" }
  | { name: "settings" }
  | { name: "help" };

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="page narrow" id="main">
      <p className="brand">premise</p>
      <section className="card notice" role="alert">
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}

/** The link to open premise looks like this one, with the real address and port of this page. */
function exampleLink(): string {
  return `${window.location.origin}/#token=…`;
}

export function NoLink({ stale = false }: { stale?: boolean }) {
  return (
    <Notice title={stale ? "This link is old" : "Open premise from its link"}>
      {stale ? (
        <p>
          premise was restarted, or given a new link, since this one was made, so this link no
          longer works. Your work is safe. Copy the new link from premise's terminal, or run{" "}
          <code>npm run new-link</code> in another terminal to print one, then open it (pasting it
          into this tab works).
        </p>
      ) : (
        <p>
          This page needs the private link premise printed in its terminal when it started. It looks
          like <code>{exampleLink()}</code>
        </p>
      )}
      <ul>
        <li>
          premise not running? In the premise folder run <code>npm start</code>, then open the link
          it prints.
        </li>
        <li>
          Lost the link, or this one stopped working? Run <code>npm run new-link</code> in another
          terminal; it prints a fresh link and the old ones stop working.
        </li>
      </ul>
    </Notice>
  );
}

/** One `key=` part of the link's fragment, such as the software or the view this page shows. */
function fromLink(key: string): string | null {
  const match = new RegExp(`(?:^#|&)${key}=([^&]+)`).exec(window.location.hash);
  return match ? decodeURIComponent(match[1]!) : null;
}

/**
 * Remember where you are in the link (the software, the view and the tab), so a refresh comes back
 * to the same place. The token stays as is.
 */
function rememberInLink(change: Record<string, string | null>) {
  const keys = Object.keys(change);
  const parts = window.location.hash
    .replace(/^#/, "")
    .split("&")
    .filter((p) => p && !keys.some((k) => p.startsWith(`${k}=`)));
  for (const [key, value] of Object.entries(change)) {
    if (value !== null) parts.push(`${key}=${encodeURIComponent(value)}`);
  }
  window.history.replaceState(null, "", `#${parts.join("&")}`);
}

const VIEW_NAMES = [
  "software",
  "start",
  "needed",
  "summary",
  "activity",
  "usage",
  "doing",
  "settings",
  "help",
] as const;
const TAB_NAMES: readonly SoftwareTab[] = [
  "conversation",
  "line",
  "record",
  "report",
  "intake",
  "learned",
];

/** The view the link names, or the software view. */
function viewFromLink(): View {
  const name = fromLink("view");
  if (name && name !== "software" && (VIEW_NAMES as readonly string[]).includes(name)) {
    return { name } as View;
  }
  return { name: "software", id: fromLink("software") };
}

function tabFromLink(): SoftwareTab {
  const tab = fromLink("tab");
  return tab && (TAB_NAMES as readonly string[]).includes(tab)
    ? (tab as SoftwareTab)
    : "conversation";
}

/** The whole page: one session where everything is open (decision 0065). */
export function App({ api: given }: { api?: Api } = {}) {
  // The link's token can change under the page (a new link pasted into this tab): follow it.
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const changed = () => setHash(window.location.hash);
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const token = useMemo(() => sessionToken(), [hash]);
  const api = useMemo(() => given ?? (token ? createApi(token) : null), [given, token]);
  const [refused, setRefused] = useState<string | null>(null);
  if (!api) return <NoLink />;
  if (refused !== null && refused === token) return <NoLink stale />;
  return <Session key={token ?? "given"} api={api} onNotCurrent={() => setRefused(token)} />;
}

function Session({ api, onNotCurrent }: { api: Api; onNotCurrent: () => void }) {
  const [version, setVersion] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [view, setViewState] = useState<View>(viewFromLink);
  const [tab, setTabState] = useState<SoftwareTab>(tabFromLink);
  // Where you are is kept in the link, so a refresh keeps your place.
  const setView = useCallback((next: View) => {
    rememberInLink({
      view: next.name === "software" ? null : next.name,
      ...(next.name === "software" && next.id ? { software: next.id } : {}),
    });
    setViewState(next);
  }, []);
  const setTab = useCallback((next: SoftwareTab) => {
    rememberInLink({ tab: next === "conversation" ? null : next });
    setTabState(next);
  }, []);
  const [more, setMore] = useState(false);
  const [explained] = useState(() => new Set<string>());
  const pending = useRef<number | null>(null);

  // Many events arrive together; reload once for each burst.
  const refresh = useCallback(() => {
    if (pending.current !== null) return;
    pending.current = window.setTimeout(() => {
      pending.current = null;
      setVersion((v) => v + 1);
    }, 60);
  }, []);
  const connection = useEventStream(api.eventsUrl(), refresh);

  const openSoftware = useCallback(
    (id: string, to?: SoftwareTab) => {
      if (to) setTab(to);
      setView({ name: "software", id });
    },
    [setTab, setView],
  );
  const overview = useLoad(() => api.overview(), [], version, onNotCurrent);
  const known = overview.state === "ready" ? overview.data : null;
  const session: Session = useMemo(
    () => ({
      api,
      version,
      notCurrent: onNotCurrent,
      report: setProblem,
      refresh,
      go: openSoftware,
      ...(known && {
        softwares: known.softwares,
        defaults: known.defaults,
        agentsMode: known.agents.mode,
        roles: known.roles,
      }),
      explained,
    }),
    [api, version, onNotCurrent, refresh, openSoftware, known, explained],
  );
  const asks = useLoad(() => api.asks({ status: "open" }), [], version, onNotCurrent);
  const openAsks = asks.state === "ready" ? asks.data : [];

  // A change's notice waits on nobody: it is listed, but neither counted nor notified.
  const waiting = openAsks.filter((a) => !a.notice);
  useTabTitle(waiting.length);
  usePresence(api, overview.state === "ready" ? (overview.data.page.presenceSeconds ?? 30) : null);
  useNotifications(
    asks.state === "ready" ? waiting : null,
    overview.state === "ready" ? overview.data.page.notifications : "off",
  );

  if (overview.state === "loading") {
    return (
      <main className="page narrow" id="main">
        <p className="brand">premise</p>
        <p className="muted">Loading…</p>
      </main>
    );
  }
  if (overview.state === "error") {
    return (
      <Notice title="premise did not answer">
        <p>{overview.message}</p>
        <button type="button" onClick={() => overview.reload()}>
          Try again
        </button>
      </Notice>
    );
  }
  const o = overview.data;
  // Which software to show: the one asked for, else the one waiting on you, else the first.
  const selected =
    view.name === "software"
      ? (o.softwares.find((s) => s.id === view.id) ??
        o.softwares.find((s) => s.openAsks > 0) ??
        o.softwares[0] ??
        null)
      : null;
  const firstRun = o.softwares.length === 0;

  const nav: { view: View; label: string; extra?: React.ReactNode; more?: boolean }[] = [
    { view: { name: "software", id: selected?.id ?? null }, label: "Softwares" },
    ...(o.softwares.length > 1 ? [{ view: { name: "summary" } as View, label: "Summary" }] : []),
    ...(o.openAsks > 0 || !firstRun
      ? [
          {
            view: { name: "needed" } as View,
            label: "Waiting on you",
            extra: o.openAsks > 0 ? <span className="count">{o.openAsks}</span> : null,
          },
        ]
      : []),
    {
      view: { name: "activity" },
      label: "Activity",
      more: true,
      extra:
        o.activity.running > 0 ? <span className="count live">{o.activity.running}</span> : null,
    },
    {
      view: { name: "usage" },
      label: "Usage",
      more: true,
      extra: o.usage.mocked ? <MockedBadge /> : null,
    },
    { view: { name: "doing" }, label: "How premise is doing", more: true },
    { view: { name: "settings" }, label: "Settings", more: true },
    { view: { name: "help" }, label: "Help" },
  ];
  // A first visit shows only what is needed; the rest is one click away (and stays open when it is
  // the page being looked at).
  const onMorePage = nav.some((n) => n.more && n.view.name === view.name);
  const showMore = more || onMorePage;
  const shownNav = nav.filter((n) => !n.more || showMore);

  return (
    <SessionContext.Provider value={session}>
      <a href="#main" className="skip">
        Skip to the content
      </a>
      <header className="topbar">
        <div className="brand-row">
          <span className="brand">premise</span>
          <span className="trial small">
            {o.agents.mode === "scripted" && (
              <span
                className="badge badge-standin"
                title="Agents follow a script: no AI is called and the software built is a placeholder. Anything premise asks to write to a repository of yours is still real, and its card says so."
              >
                Scripted agents, not real
              </span>
            )}
          </span>
          <ConnectionState connection={connection} />
          {o.pause && <PauseControl pause={o.pause} />}
        </div>
        <nav aria-label="premise">
          {shownNav.map((item) => (
            <button
              key={item.view.name}
              type="button"
              className="nav"
              aria-current={view.name === item.view.name ? "page" : undefined}
              onClick={() => setView(item.view)}
            >
              {item.label}
              {item.extra}
            </button>
          ))}
          {!onMorePage && (
            <button
              type="button"
              className="nav quiet"
              aria-expanded={showMore}
              onClick={() => setMore((m) => !m)}
            >
              {showMore ? "Fewer" : "More"}
            </button>
          )}
        </nav>
      </header>

      {problem && (
        <div className="banner" role="alert">
          {problem}{" "}
          <button type="button" className="link" onClick={() => setProblem(null)}>
            Dismiss
          </button>
        </div>
      )}
      <AgentsBanner overview={o} />
      {o.pause ? (
        <PauseBanner pause={o.pause} />
      ) : (
        o.activity.paused && (
          <div className="banner warn" role="status">
            All agent work is paused. See Activity for why and when it starts again.
          </div>
        )
      )}
      <StartupNotice overview={o} />
      <SleepNotice overview={o} />

      <main className="page" id="main" tabIndex={-1}>
        {view.name === "software" &&
          (firstRun ? (
            <Welcome overview={o} onStarted={(s) => openSoftware(s.id, "conversation")} />
          ) : (
            <div className="split">
              <aside className="softwares" aria-label="Softwares">
                <div className="section-head">
                  <h2>Softwares</h2>
                  <button type="button" onClick={() => setView({ name: "start" })}>
                    Start or bring in
                  </button>
                </div>
                <ul>
                  {o.softwares.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="software-pick"
                        aria-current={selected?.id === s.id ? "true" : undefined}
                        onClick={() => openSoftware(s.id)}
                      >
                        <span className="name">{s.name}</span>
                        <span className="small muted">
                          {s.state === "ended" ? "Ended: not built" : whereNow(s.stage, s.takingOn)}
                          <span className="sr-only"> (step: {stageName(s.stage)})</span>
                        </span>
                        <span className={`small ${s.openAsks > 0 ? "needs-you" : "muted"}`}>
                          {s.openAsks > 0 && s.id === selected?.id ? "Your turn." : s.status}
                        </span>
                        {(s.openAsks > 0 || s.state === "waiting-milestone" || s.paused) && (
                          <span className="pick-badges">
                            {(s.openAsks > 0 || s.state === "waiting-milestone") && (
                              <span className="badge badge-needs">Waiting on you</span>
                            )}
                            {s.paused && <span className="badge">Paused</span>}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                {(o.archivedSoftwares ?? 0) > 0 && (
                  <Archived count={o.archivedSoftwares!} onRestored={(id) => openSoftware(id)} />
                )}
              </aside>
              <div className="detail">
                {selected && (
                  <SoftwareView
                    key={selected.id}
                    softwareId={selected.id}
                    tab={tab}
                    onTab={setTab}
                    asks={openAsks}
                  />
                )}
              </div>
            </div>
          ))}
        {view.name === "start" && (
          <>
            <section className="card narrow-card" aria-labelledby="start-title">
              <h1 id="start-title">Start another software</h1>
              <StartForm autoFocus onStarted={(s) => openSoftware(s.id, "conversation")} />
            </section>
            <section className="card narrow-card" aria-labelledby="bring-in-title">
              <h2 id="bring-in-title">Or bring in software you already have</h2>
              <BringInForm onStarted={(s) => openSoftware(s.id, "conversation")} />
            </section>
          </>
        )}
        {view.name === "needed" && <Needed asks={openAsks} notifications={o.page.notifications} />}
        {view.name === "summary" && <Summary />}
        {view.name === "activity" && <Activity />}
        {view.name === "usage" && <Usage overview={o} />}
        {view.name === "doing" && <Doing />}
        {view.name === "settings" && <Settings overview={o} />}
        {view.name === "help" && <Help />}
        {asks.state === "error" && <Problem>{asks.message}</Problem>}
      </main>
      <footer className="footer muted small">
        premise {o.version} · data in <code>{o.dataFolder}</code> ·{" "}
        {plural(o.activity.max, "agent session")} at once
      </footer>
    </SessionContext.Provider>
  );
}

/** Archived softwares: kept, hidden from the list above, restorable (decision 0197). */
function Archived({ count, onRestored }: { count: number; onRestored: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="archived" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="small muted">Archived ({count})</summary>
      {open && <ArchivedList onRestored={onRestored} />}
    </details>
  );
}

function ArchivedList({ onRestored }: { onRestored: (id: string) => void }) {
  const { api, version, notCurrent, refresh, report } = useSessionContext();
  const list = useLoad(() => api.softwares(true), [], version, notCurrent);
  if (list.state === "loading") return <p className="muted small">Loading…</p>;
  if (list.state === "error") return <Problem>{list.message}</Problem>;
  return (
    <ul>
      {list.data.map((s) => (
        <li key={s.id} className="small">
          <span className="name">{s.name}</span>{" "}
          <span className="muted">
            {s.state === "ended" ? "Ended" : whereNow(s.stage, s.takingOn)}
          </span>{" "}
          <button
            type="button"
            className="quiet"
            onClick={() =>
              void api.restore(s.id).then(
                () => {
                  refresh();
                  onRestored(s.id);
                },
                (error: Error) => report(error.message),
              )
            }
          >
            Restore
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConnectionState({ connection }: { connection: Connection }) {
  if (connection === "live") {
    return (
      <span className="conn conn-live small" title="Updates arrive as they happen.">
        Live
      </span>
    );
  }
  return (
    <span className="conn conn-off small" role="status">
      {connection === "connecting"
        ? "Connecting…"
        : "Reconnecting… if this lasts, premise has stopped: start it again and open the new link it prints."}
    </span>
  );
}

/**
 * Tell premise while this page is in front of someone, so minutes of attention count only then
 * (docs/specs/measures.md). A beat every few seconds while visible; one "not visible" when hidden.
 */
function usePresence(api: Api, seconds: number | null) {
  useEffect(() => {
    if (seconds === null || typeof document === "undefined") return;
    const beat = () => {
      api.presence(document.visibilityState === "visible").catch(() => {});
    };
    const changed = () => beat();
    if (document.visibilityState === "visible") beat();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") beat();
    }, seconds * 1000);
    document.addEventListener("visibilitychange", changed);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", changed);
    };
  }, [api, seconds]);
}

/** The browser tab shows how many asks are open (decision 0099). */
function useTabTitle(open: number) {
  useEffect(() => {
    document.title = open > 0 ? `(${open}) premise` : "premise";
  }, [open]);
}

/** A browser notification for each new ask while the page is hidden, once allowed. */
function useNotifications(asks: AskView[] | null, setting: "offer" | "off") {
  const seen = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!asks) return;
    const ids = new Set(asks.map((a) => a.id));
    if (seen.current === null) {
      seen.current = ids;
      return;
    }
    const fresh = asks.filter((a) => !seen.current!.has(a.id));
    seen.current = ids;
    if (
      setting === "off" ||
      fresh.length === 0 ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted" ||
      !document.hidden
    ) {
      return;
    }
    for (const ask of fresh) {
      new Notification(`premise: ${ask.softwareName}`, { body: ask.title, tag: `ask-${ask.id}` });
    }
  }, [asks, setting]);
}
