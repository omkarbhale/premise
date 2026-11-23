import type { EnqueueInput, Job } from "../queue/work-queue.js";

/**
 * Asking an agent once more when its session ended without the structured answer its job needs
 * (decision 0277). In the owner's first real run the triager sent a list as text, was refused four
 * times, and stopped; premise then routed the item by its default, "Not triaged". Now a job that
 * ends done without its answer is queued once more, with the exact shape the answer must have
 * spelled out; only when that one also ends without an answer does premise fall back, and says so.
 */

/** The exact form each structured answer takes, as the second brief spells it out. */
export const ANSWER_SHAPES: Record<string, string> = {
  triage_submit:
    'triage_submit with: "kind" (bug, wish, change-of-purpose, question, opinion, duplicate or noise), "touches" (a JSON list, not text: [{"id": "W-2", "reason": "why"}], or []), "size" (small, medium or large), "touches_floor" ("yes" or "no"), "changes_what" ("yes" or "no"), "route" (in-normally, asked-at-once, held or merged-or-closed), "reason" (one line); "joins" ("I-3") for a duplicate; "answer" for a question.',
  sizing_submit:
    'sizing_submit with: "size" (small, medium or large), "size_reason", "stages" (a JSON list of stage names, not text), "stages_reason", "split" (a JSON list of {"title", "words", "touches"}, or [] to keep it whole), "split_reason", "touches" (a JSON list of the folders, files, modules or record item IDs it changes) and "changes_foundation" (true or false).',
  draft_submit:
    'draft_submit with: "stage" (the stage named in your brief) and "items" (a JSON list, not text, of {"text": "...", "from": "operator" or "assumed"}), plus what your brief asks for that stage.',
  plan_submit:
    'draft_submit with "stage": "plan", "items" (a JSON list of decisions, each {"text", "reason", "rejected", "foundation": true or false, "replaces": "D-6" when it replaces one}, or []) and "tasks" (a JSON list, each {"title", "items": ["W-2"], "check"}), plus anything else your brief asks for.',
  review_submit:
    'review_submit with "reviews": a JSON list, not text, each {"decision": the decision reviewed, "verdict": "agree" or "object", "reasons": one line}.',
  verdict_submit:
    'verdict_submit with "verdicts": a JSON list, not text, each {"item": "W-2", "verdict": "met", "not-met" or "could-not-check", "evidence": what you saw}.',
};

/** True when the job is already the second asking. */
export function askedAgain(job: Job): boolean {
  return job.payload.askedAgain === true;
}

/** The job again, with a note in front of its brief naming the exact answer it must give. */
export function againJob(job: Job, shape: keyof typeof ANSWER_SHAPES): EnqueueInput {
  const note = `Your previous session for this task ended without the answer premise needs, so this is the one more try. End it by calling ${ANSWER_SHAPES[shape]} Lists must be JSON lists, never text holding a list. If premise refuses your answer, read its diagnostics, fix exactly what they name and submit again.`;
  return {
    softwareId: job.softwareId,
    kind: job.kind,
    ...(job.stage !== null && { stage: job.stage }),
    items: job.items,
    payload: {
      ...job.payload,
      askedAgain: true,
      ...(typeof job.payload.brief === "string" && { brief: `${note}\n\n${job.payload.brief}` }),
    },
  };
}
