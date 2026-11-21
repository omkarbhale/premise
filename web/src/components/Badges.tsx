import { TERMS } from "../words";

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
