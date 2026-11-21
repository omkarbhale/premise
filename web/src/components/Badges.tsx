import { useState } from "react";
import { useContext } from "react";
import { SessionContext } from "../context";
import { GLOSS, type GlossTerm, TERMS } from "../words";

export function MockedBadge() {
  return (
    <span className="badge badge-mocked" title={TERMS.mocked}>
      Mocked
    </span>
  );
}

export function StandInBadge() {
  return (
    <span className="badge badge-standin" title={TERMS.standIn}>
      Stand-in
    </span>
  );
}

/** A term with its meaning one click away, for keyboard and touch as well as mouse. */
export function Term({ term, children }: { term: keyof typeof TERMS; children: React.ReactNode }) {
  return (
    <details className="term">
      <summary>{children}</summary>
      <span className="term-meaning">{TERMS[term]}</span>
    </details>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p className="problem" role="alert">
      {children}
    </p>
  );
}

/**
 * A premise word. The first time it appears on the page, its plain meaning follows it in place;
 * after that it is the word alone, with the meaning as a tooltip.
 */
export function Define({ term, children }: { term: GlossTerm; children: React.ReactNode }) {
  const explained = useContext(SessionContext)?.explained;
  const [first] = useState(() => {
    if (!explained || explained.has(term)) return false;
    explained.add(term);
    return true;
  });
  return (
    <span className="define" title={GLOSS[term]}>
      {children}
      {first && <span className="define-gloss muted"> ({GLOSS[term]})</span>}
    </span>
  );
}
