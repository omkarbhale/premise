import { useSession } from "../context";
import { useLoad } from "../hooks";
import { StandInBadge, Problem } from "./Badges";
import { TERMS } from "../words";

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
              {file.items.map((item) => (
                <li key={item.id} className={`record-item record-${item.status}`}>
                  <code className="item-id">{item.id}</code>{" "}
                  {item.status === "struck" ? <del>{item.text}</del> : <span>{item.text}</span>}
                  <span className="marks muted small"> ({item.marks.join("; ")})</span>
                  {item.status === "struck" && (
                    <div className="small reason-line">Struck: {item.reason}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
