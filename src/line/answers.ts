import { ServiceError } from "../server/services.js";
import type { AskAnswer, ItemAnswer } from "../shared/api-types.js";
import type { Ask } from "../storage/asks.js";

function short(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** Check an answer against its ask, and say plainly what is wrong. Returns a one-line summary. */
export function validateAnswer(ask: Ask, answer: AskAnswer): string {
  const invalid = (why: string): never => {
    throw new ServiceError("INVALID", why);
  };
  if (!answer || typeof answer !== "object") invalid("The answer is empty. Answer again.");
  switch (ask.kind) {
    case "draft":
    case "say-back": {
      if (answer.kind !== "items" || !Array.isArray(answer.items)) {
        return invalid("Answer this list item by item: keep, strike or edit each one.");
      }
      const keys = new Set(ask.items.map((i) => i.key));
      const seen = new Set<string>();
      for (const item of answer.items as ItemAnswer[]) {
        if (!item || typeof item !== "object" || typeof item.key !== "string")
          invalid("One answer is not an item answer. Reload the page.");
        if (!keys.has(item.key))
          invalid("One answer names an item that is not on this list. Reload the page.");
        if (seen.has(item.key)) invalid("One item was answered twice. Reload the page.");
        seen.add(item.key);
        if (!["keep", "strike", "edit"].includes(item.decision))
          invalid("Each item can be kept, struck or edited.");
        if (item.decision === "edit") {
          if (ask.kind === "say-back")
            invalid("A say-back item can only be kept or struck. Say more in chat.");
          if (typeof item.text !== "string" || !item.text.trim())
            invalid("An edited item cannot be empty. Strike it instead.");
          if (item.text.length > 1000) invalid("Keep an edited item under 1000 characters.");
        }
        if (item.decision === "strike" && item.reason !== undefined) {
          if (typeof item.reason !== "string") invalid("A reason for striking must be text.");
          if (item.reason.length > 1000) invalid("Keep the reason under 1000 characters.");
        }
        if ("wait" in item && item.wait !== undefined && typeof item.wait !== "boolean") {
          invalid("Whether to stop after a milestone is yes or no. Reload the page.");
        }
      }
      const count = (d: string) => answer.items.filter((i) => i.decision === d).length;
      const kept = ask.items.length - count("strike") - count("edit");
      return `Kept ${kept}, struck ${count("strike")}, edited ${count("edit")}.`;
    }
    case "question":
      if (answer.kind !== "text" || typeof answer.text !== "string" || !answer.text.trim()) {
        return invalid("Write an answer, or pick one of the choices.");
      }
      if (answer.text.length > 4000) invalid("Keep the answer under 4000 characters.");
      return `Answered: ${short(answer.text)}`;
    case "approval":
      if (
        answer.kind !== "approval" ||
        !["approve-once", "approve-kind", "refuse"].includes(answer.decision)
      ) {
        return invalid("Approve once, or decline.");
      }
      if (answer.decision === "approve-kind" && !ask.extra.approval?.kindLabel) {
        return invalid(
          "This kind of action is always asked one at a time. Approve it once, or decline.",
        );
      }
      return answer.decision === "approve-once"
        ? "Approved once."
        : answer.decision === "approve-kind"
          ? `Approved ${ask.extra.approval!.kindLabel} for this software.`
          : answer.reason?.trim()
            ? `Declined: ${short(answer.reason)}`
            : "Declined.";
    case "needed":
      if (answer.kind !== "needed" || !["done", "cannot"].includes(answer.decision)) {
        return invalid("Mark it done, or say why it cannot be done.");
      }
      return answer.decision === "done" ? "Marked done." : "Cannot be done.";
    case "proposal":
      if (answer.kind !== "proposal" || !["accept", "change"].includes(answer.decision)) {
        return invalid("Accept the proposal, or say what to change.");
      }
      if (
        answer.decision === "change" &&
        (typeof answer.text !== "string" || !answer.text.trim())
      ) {
        return invalid("Say what to change.");
      }
      return answer.decision === "accept" ? "Accepted." : "Asked for changes.";
  }
}
