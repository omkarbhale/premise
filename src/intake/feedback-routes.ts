import type { FastifyInstance, FastifyReply } from "fastify";
import { ServiceError, type FeedbackService } from "../server/services.js";

/**
 * The feedback page of a software (docs/specs/intake.md 5.1, decision 0119): a plain form at its
 * own link. The link's token is its only key; it opens this page and nothing in the session. The
 * pages work without scripts, so they open in any browser. premise listens on this machine only,
 * so the page says who can reach it.
 */

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2.5rem auto; padding: 0 1rem; line-height: 1.5; color: #1b1f24; background: #fff; }
  h1 { font-size: 1.5rem; }
  label { display: block; font-weight: 600; margin: 1rem 0 .25rem; }
  textarea { width: 100%; box-sizing: border-box; font: inherit; padding: .5rem; border: 1px solid #5b6570; border-radius: 4px; }
  button { font: inherit; padding: .5rem 1rem; border: 1px solid #1f4f99; background: #1f4f99; color: #fff; border-radius: 4px; cursor: pointer; margin-top: .75rem; }
  .note { color: #3d4550; font-size: .95rem; }
  .problem { border-left: 4px solid #b3261e; padding: .25rem .75rem; background: #fdf0ef; }
  .standing { border: 1px solid #5b6570; border-radius: 6px; padding: .75rem 1rem; }
  blockquote { margin: .5rem 0; padding-left: .75rem; border-left: 3px solid #c3c9d0; white-space: pre-wrap; }
  @media (prefers-color-scheme: dark) { body { background: #14171a; color: #e6e9ec; } textarea { background: #1c2024; color: inherit; border-color: #8a94a0; } .note { color: #b8c0c8; } .problem { background: #2a1917; } blockquote { border-color: #4a525b; } }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

const WHO =
  "Who can reach this page: only people using the computer this software's owner runs premise on. People anywhere else cannot open it. If your users are elsewhere, they can report through the software's GitHub issues instead.";

function formPage(name: string, limit: number, text = "", problem = ""): string {
  return layout(
    `Feedback for ${name}`,
    `<h1>Feedback for ${escapeHtml(name)}</h1>
<p>Tell the people who look after ${escapeHtml(name)} what is wrong, what you would like, or what you think of it. Say it in your own words; one thing at a time works best.</p>
${problem ? `<p class="problem" role="alert">${escapeHtml(problem)}</p>` : ""}
<form method="post">
  <label for="text">Your feedback</label>
  <textarea id="text" name="text" rows="7" maxlength="${limit}" required>${escapeHtml(text)}</textarea>
  <p class="note">Plain text only, up to ${limit} characters. Please do not include passwords or private details.</p>
  <button type="submit">Send feedback</button>
</form>
<p class="note">${escapeHtml(WHO)}</p>
<p class="note">When you send it you get a link to a page that shows where your feedback stands. Keep that link: it is the only way back to it.</p>`,
  );
}

function notFoundPage(): string {
  return layout(
    "This link does not work",
    `<h1>This link does not work</h1>
<p>The feedback link is wrong or has been replaced. Ask whoever gave it to you for the current one.</p>`,
  );
}

function send(reply: FastifyReply, status: number, html: string) {
  return reply
    .code(status)
    .type("text/html; charset=utf-8")
    .header("cache-control", "no-store")
    .send(html);
}

export function registerFeedbackRoutes(app: FastifyInstance, feedback: FeedbackService): void {
  // A plain form posts as application/x-www-form-urlencoded.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string", bodyLimit: 64 * 1024 },
    (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    },
  );

  app.get<{ Params: { token: string } }>("/feedback/:token", async (request, reply) => {
    const page = feedback.page(request.params.token);
    if (!page) return send(reply, 404, notFoundPage());
    return send(reply, 200, formPage(page.softwareName, page.limit));
  });

  app.post<{ Params: { token: string }; Body: { text?: string } }>(
    "/feedback/:token",
    async (request, reply) => {
      const token = request.params.token;
      const page = feedback.page(token);
      if (!page) return send(reply, 404, notFoundPage());
      const text = typeof request.body?.text === "string" ? request.body.text : "";
      try {
        const { receipt } = feedback.submit(token, text);
        return reply
          .code(303)
          .header("location", `/feedback/${encodeURIComponent(token)}/received/${receipt}`)
          .send();
      } catch (error) {
        if (error instanceof ServiceError) {
          return send(reply, 422, formPage(page.softwareName, page.limit, text, error.message));
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { token: string; receipt: string } }>(
    "/feedback/:token/received/:receipt",
    async (request, reply) => {
      const { token, receipt } = request.params;
      const page = feedback.page(token);
      if (!page) return send(reply, 404, notFoundPage());
      const standing = feedback.standing(token, receipt);
      if (!standing) {
        return send(
          reply,
          404,
          layout(
            "No feedback here",
            `<h1>No feedback here</h1><p>This receipt is not right. Use the link you were given when you sent your feedback.</p>`,
          ),
        );
      }
      return send(
        reply,
        200,
        layout(
          `Your feedback to ${page.softwareName}`,
          `<h1>Your feedback to ${escapeHtml(page.softwareName)}</h1>
<div class="standing" role="status">
  <p><strong>${escapeHtml(standing.headline)}</strong></p>
  <p>${escapeHtml(standing.detail)}</p>
</div>
<p class="note">What you sent:</p>
<blockquote>${escapeHtml(standing.text)}</blockquote>
<p class="note">Bookmark this page and come back to see where your feedback stands. It shows only your own feedback.</p>
<p><a href="/feedback/${encodeURIComponent(token)}">Send more feedback</a></p>`,
        ),
      );
    },
  );
}
