import { useState } from "react";
import type { AskView } from "../api";
import { useSession } from "../context";
import { plural } from "../words";
import { AskCard } from "./AskCard";
import { Empty } from "./Badges";

/**
 * Every open ask (docs/specs/page.md 5.3). With roles besides the operator, grouped by the role each
 * is for, and the page says once that one person answers for all of them. With only the operator,
 * no role labels at all: they would only be jargon.
 */
export function Needed({
  asks,
  notifications,
}: {
  asks: AskView[];
  notifications: "offer" | "off";
}) {
  const { roles: known } = useSession();
  const open = asks.filter((a) => a.status === "open");
  const roles = [...new Set(open.map((a) => a.role))].sort(
    (x, y) => Number(y === "operator") - Number(x === "operator") || x.localeCompare(y),
  );
  const labelled = (known?.length ?? 0) > 0 || roles.some((r) => r !== "operator");
  return (
    <section aria-labelledby="needed-title">
      <div className="section-head">
        <h1 id="needed-title">Waiting on you</h1>
        {notifications === "offer" && <NotifyOffer />}
      </div>
      <p className="muted">
        Everything premise has asked and not had an answer to, across every software.
      </p>
      {labelled && (
        <p className="note small" role="note">
          Questions are for different roles: {listWords([...new Set([...roles, ...(known ?? [])])])}
          . A role is a label for who should decide, not an account; in this session you answer for
          all of them.
        </p>
      )}
      {open.length === 0 ? (
        <Empty>
          <strong>Nothing is waiting on you.</strong> When premise needs an answer, it appears here
          and on the software's page, and the browser tab shows a count.
        </Empty>
      ) : labelled ? (
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
      ) : (
        open.map((ask) => <AskCard key={ask.id} ask={ask} showSoftware />)
      )}
    </section>
  );
}

/** "the operator, the designer and the account holder". */
function listWords(roles: string[]): string {
  const named = roles.map((r) => `the ${r}`);
  return named.length <= 1
    ? (named[0] ?? "")
    : `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`;
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
