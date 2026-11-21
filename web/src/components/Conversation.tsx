import { useId, useState } from "react";
import { ApiError, type AskView, NotCurrentLink } from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { when } from "../words";
import { AskCard } from "./AskCard";
import { Problem } from "./Badges";

/** The software's conversation, with what is waiting on you on top. */
export function Conversation({ softwareId, asks }: { softwareId: string; asks: AskView[] }) {
  const { api, version, notCurrent, refresh } = useSession();
  const messages = useLoad(() => api.chat(softwareId), [softwareId], version, notCurrent);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const inputId = useId();
  const hintId = useId();
  const open = asks.filter((a) => a.status === "open" && a.softwareId === softwareId);
  const draft = open.find((a) => a.kind === "draft");
  const RECENT = 12;

  async function send() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      await api.say(softwareId, text);
      setText("");
      refresh();
    } catch (error) {
      if (error instanceof NotCurrentLink) notCurrent();
      else setProblem((error as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="conversation">
      {open.length > 0 && (
        <section aria-label="Your turn" className="waiting">
          <h2>Your turn</h2>
          {open.map((ask) => (
            <AskCard key={ask.id} ask={ask} />
          ))}
        </section>
      )}
      <section aria-label="Chat" className="chat">
        <h2>Conversation</h2>
        {messages.state === "error" && <Problem>{messages.message}</Problem>}
        <ol className="messages" aria-live="polite">
          {messages.state === "ready" && messages.data.length > RECENT && !showAll && (
            <li className="earlier">
              <button type="button" className="quiet" onClick={() => setShowAll(true)}>
                Show {messages.data.length - RECENT} earlier messages
              </button>
            </li>
          )}
          {messages.state === "ready" &&
            (showAll ? messages.data : messages.data.slice(-RECENT)).map((m) => (
              <li key={m.id} className={`message message-${m.author}`}>
                <span className="who">{m.author === "person" ? "You" : "premise"}</span>
                <span className="said">{m.text}</span>
                <time className="muted small" dateTime={m.time}>
                  {when(m.time)}
                </time>
              </li>
            ))}
        </ol>
        <form
          className="say"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor={inputId} className="small">
            {draft ? "Add a correction to the open list" : "Ask premise for a change"}
          </label>
          <p id={hintId} className="muted small">
            {draft
              ? "What you write here is added to the list above as a correction. It does not start new work."
              : "What you write here is taken in as a request for a change (intake): premise answers with its number, and the Intake tab shows where it stands."}{" "}
            Enter sends; Shift+Enter makes a new line.
          </p>
          <div className="say-row">
            <textarea
              id={inputId}
              rows={2}
              value={text}
              aria-describedby={hintId}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button type="submit" className="primary" disabled={busy || !text.trim()}>
              {draft ? "Add correction" : "Ask for this change"}
            </button>
          </div>
          {problem && <Problem>{problem}</Problem>}
        </form>
      </section>
    </div>
  );
}
