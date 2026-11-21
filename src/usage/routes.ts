import type { FastifyInstance } from "fastify";
import type { Usage } from "./usage.js";
import type { BudgetInput, OverrunAnswerInput } from "../shared/api-types.js";
import { getSoftware } from "../storage/softwares.js";
import type { Database } from "../storage/database.js";
import { ServiceError } from "../server/services.js";

const idParams = {
  type: "object",
  properties: { id: { type: "string", minLength: 1, maxLength: 100 } },
  required: ["id"],
} as const;

const budgetBody = {
  type: "object",
  properties: {
    kind: { enum: ["none", "share", "amount"] },
    percent: { type: "number" },
    usd: { type: "number" },
  },
  required: ["kind"],
  additionalProperties: false,
} as const;

/**
 * Usage, budgets and the operator's answers to an overrun (docs/specs/usage.md). Figures come from
 * usage-ledger and carry its mock's mark; the counts of sessions and minutes are premise's own.
 */
export function registerUsageRoutes(api: FastifyInstance, usage: Usage, db: Database): void {
  const known = (id: string) => {
    if (!getSoftware(db, id)) {
      throw new ServiceError("NOT_FOUND", "There is no software with that id.");
    }
  };

  api.get("/api/usage", async () => usage.overview());

  api.get<{ Params: { id: string } }>(
    "/api/softwares/:id/usage",
    { schema: { params: idParams } },
    async (request) => {
      known(request.params.id);
      return usage.view(request.params.id);
    },
  );

  api.post<{ Params: { id: string }; Body: BudgetInput }>(
    "/api/softwares/:id/budget",
    { schema: { params: idParams, body: budgetBody } },
    async (request) => {
      known(request.params.id);
      return usage.setBudget(request.params.id, request.body);
    },
  );

  api.post<{ Params: { id: string }; Body: OverrunAnswerInput }>(
    "/api/softwares/:id/budget/answer",
    {
      schema: {
        params: idParams,
        body: {
          type: "object",
          properties: {
            answer: { enum: ["raise", "finish-change", "leave-paused"] },
            budget: budgetBody,
          },
          required: ["answer"],
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      known(request.params.id);
      const body = request.body;
      if (body.answer === "raise" && !body.budget) {
        throw new ServiceError("INVALID", "Say how much the new budget is.");
      }
      return usage.answer(request.params.id, body);
    },
  );
}
