import type { Overview, SettingView } from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { Problem } from "./Badges";

function show(value: unknown): string {
  return value === null ? "none" : JSON.stringify(value);
}

/** The settings someone is most likely to want; the rest sit under "advanced". */
const COMMON = [
  "agents.mode",
  "queue.max_agent_sessions",
  "usage_ledger.mode",
  "usage_ledger.command",
  "server.port",
  "softwares.default_priority",
  "softwares.default_milestone_waits",
];

/** The configuration in use, read only, with where to change it. */
export function Settings({ overview }: { overview: Overview }) {
  const { api, version, notCurrent } = useSession();
  const settings = useLoad(() => api.settings(), [], version, notCurrent);
  const general =
    settings.state === "ready"
      ? settings.data.settings.filter((s) => !s.key.startsWith("agents.tasks."))
      : [];
  const common = general.filter((s) => COMMON.includes(s.key)).length;
  const problems = overview.setup.filter((c) => c.status !== "ok");
  return (
    <section aria-labelledby="settings-title">
      <h1 id="settings-title">Settings</h1>
      <section className="card">
        <h2>Setup check</h2>
        {problems.length === 0 ? (
          <p>Everything premise checks for on this machine is here.</p>
        ) : (
          <ul className="checks">
            {problems.map((c) => (
              <li key={c.name} className={c.status}>
                <strong>{c.name}:</strong> {c.detail}
                {c.fix && <div className="fix">{c.fix}</div>}
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">
          Run <code>npm run doctor</code> in a terminal for the full check.
        </p>
      </section>
      {settings.state === "error" && <Problem>{settings.message}</Problem>}
      {settings.state === "ready" && (
        <>
          <p className="muted">
            premise works with the defaults. Change a setting only when you want something
            different, such as how many agents run at once, or which model each type of task uses.
          </p>
          <section className="card">
            <h2>How to change a setting</h2>
            <ol>
              <li>
                Edit <code>{settings.data.configFile}</code> (create it if it is not there). It
                holds one JSON object; a dotted name is nested, so{" "}
                <code>queue.max_agent_sessions</code> is{" "}
                <code>{`{ "queue": { "max_agent_sessions": 3 } }`}</code>.
              </li>
              <li>
                Or set the environment variable shown under each setting; it wins over the file.
              </li>
              <li>
                Restart premise. A wrong setting stops it at start, with a message saying why.
              </li>
            </ol>
            <p className="muted small">The page shows settings; it does not change them.</p>
          </section>
          <SettingsTable
            title="The settings most people change"
            settings={general.filter((s) => COMMON.includes(s.key))}
          />
          <TaskTable
            settings={settings.data.settings.filter((s) => s.key.startsWith("agents.tasks."))}
          />
          <details className="card advanced">
            <summary>
              <strong>All other settings</strong>{" "}
              <span className="muted small">
                ({general.length - common} more, for advanced use)
              </span>
            </summary>
            <SettingsTable
              title="Everything else"
              settings={general.filter((s) => !COMMON.includes(s.key))}
            />
          </details>
        </>
      )}
    </section>
  );
}

function SettingsTable({ title, settings }: { title: string; settings: SettingView[] }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <dl className="settings">
        {settings.map((s) => (
          <div key={s.key} className={s.changed ? "setting changed" : "setting"}>
            <dt>
              <code>{s.key}</code> <strong>{show(s.value)}</strong>
              {s.changed && <span className="chip">changed; default {show(s.default)}</span>}
            </dt>
            <dd>
              {s.meaning} <span className="muted small">Allowed: {s.allowed}.</span>
              <div className="muted small">
                Environment variable: <code>{s.envName}</code>
              </div>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Model, effort and limits per type of task, as one table. */
function TaskTable({ settings }: { settings: SettingView[] }) {
  const kinds = [...new Set(settings.map((s) => s.key.split(".")[2]!))];
  const value = (kind: string, field: string) =>
    settings.find((s) => s.key === `agents.tasks.${kind}.${field}`);
  const cell = (kind: string, field: string, suffix = "") => {
    const s = value(kind, field);
    if (!s) return <td />;
    return (
      <td className={s.changed ? "changed" : undefined}>
        {show(s.value)}
        {suffix}
      </td>
    );
  };
  return (
    <section className="card">
      <h2>Per type of task</h2>
      <p className="muted small">
        Each type of agent task has its own model, effort and limits, for example{" "}
        <code>agents.tasks.build.model</code>. Changed values are marked.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Type of task</th>
              <th scope="col">Model</th>
              <th scope="col">Effort</th>
              <th scope="col">Turn limit</th>
              <th scope="col">Time limit</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((kind) => (
              <tr key={kind}>
                <th scope="row">{kind}</th>
                {cell(kind, "model")}
                {cell(kind, "effort")}
                {cell(kind, "max_turns")}
                {cell(kind, "max_minutes", " min")}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
