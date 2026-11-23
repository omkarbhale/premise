import type { SoftwareDetail } from "../api";

const STAGE_WORDS: Record<string, string> = {
  build: "Being built",
  check: "Being checked",
  run: "Landing",
  report: "Being reported",
};

/**
 * Pieces of work built beside what premise is doing now, each on its own branch (decision 0313):
 * what each touches, where it is, and in plain words why any of them waits.
 */
export function InFlight({ software }: { software: SoftwareDetail }) {
  if (software.inFlight.length === 0) return null;
  return (
    <section className="card in-flight" aria-label="Built at the same time">
      <h2>Built at the same time</h2>
      <p className="muted small">
        These pieces of work are built on their own, beside what premise is doing now. Each is
        checked on its own and lands in turn; one that lands after another is checked again first.
      </p>
      <ul className="in-flight-list">
        {software.inFlight.map((piece) => (
          <li key={piece.itemId}>
            <div>
              <strong>{piece.name}</strong>{" "}
              <span className="chip">
                {piece.state === "waiting"
                  ? "Waiting"
                  : (STAGE_WORDS[piece.stage ?? "build"] ?? "Being built")}
              </span>
            </div>
            <p className="small">
              Touches:{" "}
              {piece.touches.length > 0
                ? piece.touches.join(", ")
                : "not known, so it goes after the others"}
              {piece.foundation && " (changes a foundation decision, so it goes alone)"}
            </p>
            {piece.state === "waiting" ? (
              <p className="small">{piece.reason}</p>
            ) : (
              piece.reason && <p className="muted small">{piece.reason}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** How many pieces of this software may be built at once (decision 0313). */
export function PiecesInFlightSetting({
  software,
  busy,
  onChange,
}: {
  software: SoftwareDetail;
  busy: boolean;
  onChange: (value: number | null) => void;
}) {
  const { value, chosen } = software.piecesInFlight;
  const fallback = software.piecesInFlight.default;
  return (
    <section className="card">
      <h2>Work built at the same time</h2>
      <label className="small">
        How many pieces of work premise may build at once for this software.{" "}
        <select
          value={chosen ? String(value) : "default"}
          disabled={busy}
          onChange={(e) => onChange(e.target.value === "default" ? null : Number(e.target.value))}
        >
          <option value="default">
            The default ({fallback === 1 ? "one at a time" : `up to ${fallback}`})
          </option>
          <option value="1">One at a time</option>
          {[2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              Up to {n}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">
        premise builds two pieces at once only when the parts of the software they change do not
        overlap, and neither changes a foundation decision; when it is not sure, it builds them one
        after another. Each piece is checked on its own and lands in turn. The number of agents
        working at once across all your softwares is set on the Settings page.
      </p>
    </section>
  );
}
