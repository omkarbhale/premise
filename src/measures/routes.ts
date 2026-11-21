import type { FastifyInstance } from "fastify";
import type { Measures } from "./measures.js";

/**
 * The measures for the page (docs/specs/measures.md), and the two things the page tells premise:
 * that it is in front of someone, and that a question was shown. Neither writes an event, so a
 * page's beats never wake the other pages.
 */
export function registerMeasureRoutes(api: FastifyInstance, measures: Measures): void {
  api.get("/api/measures", async () => measures.overview());

  api.get<{ Params: { id: string } }>(
    "/api/softwares/:id/measures",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string", minLength: 1, maxLength: 100 } },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      if (!measures.known(request.params.id)) {
        return reply
          .code(404)
          .send({ error: "There is no software with that id.", code: "NOT_FOUND" });
      }
      return measures.view(request.params.id);
    },
  );

  api.post<{ Body: { visible: boolean } }>(
    "/api/presence",
    {
      schema: {
        body: {
          type: "object",
          properties: { visible: { type: "boolean" } },
          required: ["visible"],
        },
      },
    },
    async (request) => {
      measures.presence(request.body.visible);
      return { ok: true };
    },
  );

  api.post<{ Params: { id: number } }>(
    "/api/asks/:id/shown",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "integer", minimum: 1 } },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      if (!measures.shown(request.params.id)) {
        return reply
          .code(404)
          .send({ error: "That question is not in premise any more.", code: "NOT_FOUND" });
      }
      return { ok: true };
    },
  );
}
