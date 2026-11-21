/**
 * Small value checks with plain-language messages.
 * Each check returns null when the value is fine, or a sentence saying what is wrong.
 */
export type Check = (value: unknown) => string | null;

function show(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

export function wholeNumber(min: number, max: number): Check {
  return (value) =>
    typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
      ? null
      : `must be a whole number from ${min} to ${max}; it is ${show(value)}`;
}

export function positiveNumber(min: number, max: number): Check {
  return (value) =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
      ? null
      : `must be a number from ${min} to ${max}; it is ${show(value)}`;
}

export const yesNo: Check = (value) =>
  typeof value === "boolean" ? null : `must be true or false; it is ${show(value)}`;

export function oneOf(choices: readonly string[]): Check {
  return (value) =>
    typeof value === "string" && choices.includes(value)
      ? null
      : `must be one of ${choices.map((c) => `"${c}"`).join(", ")}; it is ${show(value)}`;
}

export const text: Check = (value) =>
  typeof value === "string" && value.trim().length > 0
    ? null
    : `must be a non-empty piece of text; it is ${show(value)}`;

export function orNone(check: Check): Check {
  return (value) => (value === null ? null : check(value));
}

export function describeCheck(check: Check): string {
  return (check as Check & { summary?: string }).summary ?? "";
}

/** Attach a one-line summary used by the configuration reference. */
export function summarised(check: Check, summary: string): Check {
  return Object.assign((value: unknown) => check(value), { summary });
}

/** A list of non-empty pieces of text (possibly empty). */
export const textList: Check = (value) => {
  if (!Array.isArray(value))
    return `must be a list of text, such as ["a", "b"]; it is ${show(value)}`;
  const wrong = value.find((v) => typeof v !== "string" || v.trim().length === 0);
  return wrong === undefined
    ? null
    : `must hold only non-empty pieces of text; ${show(wrong)} is not one`;
};
