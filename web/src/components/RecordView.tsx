import type { RecordItemView } from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { StandInBadge, Problem } from "./Badges";
import { TERMS } from "../words";

/** An "Outcome: ..." item is replaced by a later one (the person changed their mind). */
function supersededBy(items: RecordItemView[], item: RecordItemView): RecordItemView | null {
  if (item.status === "struck" || !/^Outcome:/i.test(item.text)) return null;
  const later = items.filter(
    (other) =>
      other.status !== "struck" &&
      /^Outcome:/i.test(other.text) &&
      itemNumber(other) > itemNumber(item),
  );
  return later.length > 0 ? later[later.length - 1]! : null;
}

function itemNumber(item: RecordItemView): number {
  return Number(/-(\d+)$/.exec(item.id)?.[1] ?? 0);
}

export function RecordView({ softwareId }: { softwareId: string }) {
  const { api, version, notCurrent } = useSession();
  const record = useLoad(() => api.record(softwareId), [softwareId], version, notCurrent);
  if (record.state === "loading") return <p className="muted">Loading the record…</p>;
  if (record.state === "error") return <Problem>{record.message}</Problem>;
  const { files, source } = record.data;
  return (
    <div className="record">
      <p className="muted">
        {TERMS.record} Struck items stay, crossed out, with the reason.{" "}
        {source === "stand-in" && (
          <>
            <StandInBadge /> Kept by the stand-in until the record keeper writes the real files.
          </>
        )}
      </p>
      {files.map((file) => (
        <section key={file.file} className="card record-file" aria-label={file.title}>
          <h2>
            {file.title} <code className="muted small">{file.file}</code>
          </h2>
          <p className="muted small">{file.plain}</p>
          {file.items.length === 0 ? (
            <p className="empty-line">
              Nothing yet. Written when the {file.title} stage is confirmed.
            </p>
          ) : (
            <ul className="record-items">
              {file.items.map((item) => {
                const newer = supersededBy(file.items, item);
                return (
                  <li
                    key={item.id}
                    className={`record-item record-${item.status}${newer ? " record-superseded" : ""}`}
                  >
                    <code className="item-id">{item.id}</code>{" "}
                    {item.status === "struck" ? <del>{item.text}</del> : <span>{item.text}</span>}
                    {newer && (
                      <span className="chip" title="A later decision replaced this one.">
                        Superseded by {newer.id}
                      </span>
                    )}
                    <span className="marks muted small"> ({item.marks.join("; ")})</span>
                    {item.status === "struck" && (
                      <div className="small reason-line">Struck: {item.reason}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
