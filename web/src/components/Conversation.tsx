import { useEffect, useId, useRef, useState } from "react";
import { ApiError, type AskView, NotCurrentLink } from "../api";
import { useSession } from "../context";
import { useLoad } from "../hooks";
import { stageName } from "../../../src/shared/stages";
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
  const end = useRef<HTMLLIElement>(null);
  const inputId = useId();
  const hintId = useId();
  const open = asks.filter((a) => a.status === "open" && a.softwareId === softwareId);
  const draft = open.find((a) => a.kind === "draft");
  const count = messages.state === "ready" ? messages.data.length : 0;

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [count]);

  async function send() {
    if (!text.trim()) return;
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
        <section aria-label="Waiting on you" className="waiting">
          <h2>Waiting on you</h2>
          {open.map((ask) => (
            <AskCard key={ask.id} ask={ask} />
          ))}
        </section>
      )}
      <section aria-label="Chat" className="chat">
        <h2>Conversation</h2>
        {messages.state === "error" && <Problem>{messages.message}</Problem>}
        <ol className="messages" aria-live="polite">
          {messages.state === "ready" &&
            messages.data.map((m) => (
              <li key={m.id} className={`message message-${m.author}`}>
                <span className="who">{m.author === "person" ? "You" : "premise"}</span>
                <span className="said">{m.text}</span>
                <time className="muted small" dateTime={m.time}>
                  {when(m.time)}
                </time>
              </li>
            ))}
          <li ref={end} aria-hidden="true" className="end" />
        </ol>
        <form
          className="say"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor={inputId} className="small">
            Say something to premise
          </label>
          <p id={hintId} className="muted small">
            {draft
              ? `While the ${stageName(draft.stage ?? "")} list is open, what you write is added to it as a correction.`
              : "What you write is taken as new work (intake) for this software."}{" "}
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
              Send
            </button>
          </div>
          {problem && <Problem>{problem}</Problem>}
        </form>
      </section>
    </div>
  );
}
