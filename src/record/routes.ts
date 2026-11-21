import type { FastifyInstance } from "fastify";
import { ITEM_KINDS, type ItemKind } from "./format.js";
import { RecordError, type RecordKeeper } from "./record-keeper.js";

/**
 * The record's reading API for the page and for agents: list, get, history, and the effort plan.
 * Writing goes only through the record keeper's own steps, never through these routes (spec 3).
 */
export function registerRecordRoutes(api: FastifyInstance, keeper: RecordKeeper): void {
  const guard = <T>(
    reply: { code: (n: number) => unknown },
    work: () => T,
  ): T | { error: string } => {
    try {
      return work();
    } catch (error) {
      if (error instanceof RecordError) {
        reply.code(error.code === "UNKNOWN_ITEM" ? 404 : 400);
        return { error: error.message };
      }
      throw error;
    }
  };

  api.get<{
    Params: { id: string };
    Querystring: { file?: string; kind?: string; struck?: string };
  }>("/api/softwares/:id/record-items", async (request, reply) =>
    guard(reply, () => {
      const kind = request.query.kind;
      if (kind !== undefined && !(ITEM_KINDS as readonly string[]).includes(kind)) {
        throw new RecordError(
          "MALFORMED",
          `"${kind}" is not a kind of record item. The kinds are ${ITEM_KINDS.join(", ")}.`,
        );
      }
      return {
        items: keeper.list(request.params.id, {
          ...(request.query.file !== undefined ? { file: request.query.file } : {}),
          ...(kind !== undefined ? { kind: kind as ItemKind } : {}),
          includeStruck: request.query.struck === "1" || request.query.struck === "true",
        }),
      };
    }),
  );

  api.get<{ Params: { id: string } }>("/api/softwares/:id/effort-plan", async (request, reply) =>
    guard(reply, () => keeper.effortPlan(request.params.id)),
  );

  api.get<{ Params: { id: string; item: string } }>(
    "/api/softwares/:id/record/:item",
    async (request, reply) =>
      guard(reply, () => keeper.get(request.params.id, request.params.item)),
  );

  api.get<{ Params: { id: string; item: string } }>(
    "/api/softwares/:id/record/:item/history",
    async (request, reply) =>
      guard(reply, () => keeper.history(request.params.id, request.params.item)),
  );
}
