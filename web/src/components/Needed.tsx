import { useState } from "react";
import type { AskView } from "../api";
import { TERMS, plural } from "../words";
import { AskCard } from "./AskCard";
import { Empty } from "./Badges";

/** Every open ask, grouped by the role it is for (docs/specs/page.md 5.3). */
export function Needed({
  asks,
  notifications,
}: {
  asks: AskView[];
  notifications: "offer" | "off";
}) {
  const open = asks.filter((a) => a.status === "open");
  const roles = [...new Set(open.map((a) => a.role))].sort();
  return (
    <section aria-labelledby="needed-title">
      <div className="section-head">
        <h1 id="needed-title">Waiting on you</h1>
        {notifications === "offer" && <NotifyOffer />}
      </div>
      <p className="muted">
        Everything premise has asked and not had an answer to, across every software. {TERMS.role}
      </p>
      {open.length === 0 ? (
        <Empty>
          <strong>Nothing is waiting on you.</strong> When premise needs an answer, it appears here
          and on the software's page, and the browser tab shows a count.
        </Empty>
      ) : (
        roles.map((role) => {
          const forRole = open.filter((a) => a.role === role);
          return (
            <section key={role} className="role-group" aria-label={`For the ${role}`}>
              <h2>
                For the {role} <span className="count">{plural(forRole.length, "thing")}</span>
              </h2>
              {forRole.map((ask) => (
                <AskCard key={ask.id} ask={ask} showSoftware />
              ))}
            </section>
          );
        })
      )}
    </section>
  );
}

/** Browser notifications are offered, never asked for unprompted (decision 0157). */
function NotifyOffer() {
  const supported = typeof Notification !== "undefined";
  const [permission, setPermission] = useState(supported ? Notification.permission : "denied");
  if (!supported) return null;
  if (permission === "granted") {
    return <span className="muted small">Notifications are on while this page is open.</span>;
  }
  if (permission === "denied") return null;
  return (
    <button
      type="button"
      onClick={() => void Notification.requestPermission().then((p) => setPermission(p))}
    >
      Notify me when something new is waiting
    </button>
  );
}
