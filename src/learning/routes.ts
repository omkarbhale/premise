import type { FastifyInstance } from "fastify";
import type { LearningDestination } from "../shared/api-types.js";
import type { Learning } from "./learning.js";

const numberId = {
  type: "object",
  properties: { id: { type: "integer", minimum: 1 } },
  required: ["id"],
} as const;

/**
 * What premise learned from corrections, for the page (docs/specs/learning.md 5): the lists, and
 * the one-click edits a person makes to them. Refusals are ServiceErrors the page shows as they are.
 */
export function registerLearningRoutes(api: FastifyInstance, learning: Learning): void {
  api.get<{ Querystring: { software?: string } }>("/api/learning", async (request) =>
    learning.view(request.query.software ?? null),
  );

  api.post<{ Params: { id: number }; Body: { text: string } }>(
    "/api/lessons/:id/edit",
    {
      schema: {
        params: numberId,
        body: {
          type: "object",
          properties: { text: { type: "string", maxLength: 2000 } },
          required: ["text"],
        },
      },
    },
    async (request) => {
      learning.editLesson(request.params.id, request.body.text);
      return { ok: true };
    },
  );

  api.post<{ Params: { id: number } }>(
    "/api/lessons/:id/delete",
    { schema: { params: numberId } },
    async (request) => {
      learning.deleteLesson(request.params.id);
      return { ok: true };
    },
  );

  api.post<{ Params: { id: number }; Body: { destination: LearningDestination } }>(
    "/api/corrections/:id/move",
    {
      schema: {
        params: numberId,
        body: {
          type: "object",
          properties: {
            destination: { type: "string", enum: ["software", "taste", "premise", "none"] },
          },
          required: ["destination"],
        },
      },
    },
    async (request) => {
      learning.move(request.params.id, request.body.destination);
      return { ok: true };
    },
  );

  api.post<{ Body: { topic: string } }>(
    "/api/improvements/delete",
    {
      schema: {
        body: {
          type: "object",
          properties: { topic: { type: "string", minLength: 1, maxLength: 200 } },
          required: ["topic"],
        },
      },
    },
    async (request) => {
      learning.deleteImprovement(request.body.topic);
      return { ok: true };
    },
  );

  // A text file to keep or pass on by hand. Sending it anywhere outside this machine would be a
  // floor action through the gate; that is not built (docs/specs/learning.md 8).
  api.get("/api/improvements.txt", async (_request, reply) =>
    reply
      .type("text/plain; charset=utf-8")
      .header("content-disposition", 'attachment; filename="premise-improvements.txt"')
      .send(learning.exportImprovements()),
  );
}
