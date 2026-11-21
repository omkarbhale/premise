import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Api, type AskView, createApi, sessionToken } from "./api";
import { Activity } from "./components/Activity";
import { MockedBadge, Problem, StandInBadge } from "./components/Badges";
import { Help } from "./components/Help";
import { Needed } from "./components/Needed";
import { Settings } from "./components/Settings";
import { SoftwareView, type SoftwareTab } from "./components/SoftwareView";
import { StartForm } from "./components/StartForm";
import { Usage } from "./components/Usage";
import { Welcome } from "./components/Welcome";
import { SessionContext, type Session } from "./context";
import { type Connection, useEventStream, useLoad } from "./hooks";
import { stageName, stageNumber } from "../../src/shared/stages";
import { plural } from "./words";

type View =
  | { name: "software"; id: string | null }
  | { name: "start" }
  | { name: "needed" }
  | { name: "activity" }
  | { name: "usage" }
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

export function NoLink() {
  return (
    <Notice title="Open premise from its link">
      <p>
        This page needs the private link premise printed in its terminal when it started. It looks
        like <code>http://localhost:4610/#token=…</code>
      </p>
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

/** The whole page: one session where everything is open (decision 0065). */
export function App({ api: given }: { api?: Api } = {}) {
  const token = useMemo(() => sessionToken(), []);
  const api = useMemo(() => given ?? (token ? createApi(token) : null), [given, token]);
  const [linkOk, setLinkOk] = useState(true);
  if (!api || !linkOk) return <NoLink />;
  return <Session api={api} onNotCurrent={() => setLinkOk(false)} />;
}

function Session({ api, onNotCurrent }: { api: Api; onNotCurrent: () => void }) {
  const [version, setVersion] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [view, setView] = useState<View>({ name: "software", id: null });
  const [tab, setTab] = useState<SoftwareTab>("conversation");
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

  const session: Session = useMemo(
    () => ({ api, version, notCurrent: onNotCurrent, report: setProblem, refresh }),
    [api, version, onNotCurrent, refresh],
  );
  const overview = useLoad(() => api.overview(), [], version, onNotCurrent);
  const asks = useLoad(() => api.asks({ status: "open" }), [], version, onNotCurrent);
  const openAsks = asks.state === "ready" ? asks.data : [];

  useTabTitle(openAsks.length);
  useNotifications(openAsks, overview.state === "ready" ? overview.data.page.notifications : "off");

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
  const selected =
    view.name === "software"
      ? (o.softwares.find((s) => s.id === view.id) ?? o.softwares[0] ?? null)
      : null;
  const firstRun = o.softwares.length === 0;

  const nav: { view: View; label: string; extra?: React.ReactNode }[] = [
    { view: { name: "software", id: selected?.id ?? null }, label: "Softwares" },
    {
      view: { name: "needed" },
      label: "Waiting on you",
      extra: o.openAsks > 0 ? <span className="count">{o.openAsks}</span> : null,
    },
    {
      view: { name: "activity" },
      label: "Activity",
      extra:
        o.activity.running > 0 ? <span className="count live">{o.activity.running}</span> : null,
    },
    { view: { name: "usage" }, label: "Usage", extra: o.usage.mocked ? <MockedBadge /> : null },
    { view: { name: "settings" }, label: "Settings" },
    { view: { name: "help" }, label: "Help" },
  ];

  return (
    <SessionContext.Provider value={session}>
      <a href="#main" className="skip">
        Skip to the content
      </a>
      <header className="topbar">
        <div className="brand-row">
          <span className="brand">premise</span>
          <span className="trial small">
            {o.line.mode === "stand-in" && <StandInBadge />}
            {o.agents.mode === "scripted" && (
              <span className="badge" title="Agents follow a script; no AI is called.">
                Scripted agents
              </span>
            )}
          </span>
          <ConnectionState connection={connection} />
        </div>
        <nav aria-label="premise">
          {nav.map((item) => (
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
      {o.activity.paused && (
        <div className="banner warn" role="status">
          All agent work is paused. See Activity for why and when it starts again.
        </div>
      )}

      <main className="page" id="main" tabIndex={-1}>
        {view.name === "software" &&
          (firstRun ? (
            <Welcome
              overview={o}
              onStarted={(s) => {
                setTab("conversation");
                setView({ name: "software", id: s.id });
              }}
            />
          ) : (
            <div className="split">
              <aside className="softwares" aria-label="Softwares">
                <div className="section-head">
                  <h2>Softwares</h2>
                  <button type="button" onClick={() => setView({ name: "start" })}>
                    Start another
                  </button>
                </div>
                <ul>
                  {o.softwares.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="software-pick"
                        aria-current={selected?.id === s.id ? "true" : undefined}
                        onClick={() => setView({ name: "software", id: s.id })}
                      >
                        <span className="name">{s.name}</span>
                        <span className="small muted">
                          {stageNumber(s.stage)} of 11: {stageName(s.stage)}
                        </span>
                        <span className={`small ${s.openAsks > 0 ? "needs-you" : "muted"}`}>
                          {s.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
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
          <section className="card narrow-card" aria-labelledby="start-title">
            <h1 id="start-title">Start another software</h1>
            <StartForm
              autoFocus
              onStarted={(s) => {
                setTab("conversation");
                setView({ name: "software", id: s.id });
              }}
            />
          </section>
        )}
        {view.name === "needed" && <Needed asks={openAsks} notifications={o.page.notifications} />}
        {view.name === "activity" && <Activity />}
        {view.name === "usage" && <Usage overview={o} />}
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
        : "Reconnecting… if this lasts, check premise is still running."}
    </span>
  );
}

/** The browser tab shows how many asks are open (decision 0099). */
function useTabTitle(open: number) {
  useEffect(() => {
    document.title = open > 0 ? `(${open}) premise` : "premise";
  }, [open]);
}

/** A browser notification for each new ask while the page is hidden, once allowed. */
function useNotifications(asks: AskView[], setting: "offer" | "off") {
  const seen = useRef<Set<number> | null>(null);
  useEffect(() => {
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
