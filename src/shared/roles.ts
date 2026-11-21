/**
 * Role labels (decisions 0009, 0065): every ask is for a role, a label and not an account. The
 * record and the asks keep a label as lower-case words joined by hyphens ("account-holder"); people
 * read it as plain words ("account holder"). The record names roles, never people (decision 0081).
 */

const MAX_ROLE = 40;

/** A role as the record keeps it, from what a person or an agent wrote ("The Account Holder"). */
export function roleLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^\s*(the|a|an)\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, MAX_ROLE)
    .replace(/-+$/, "");
}

/** A role label in plain words, for people: "account-holder" is "account holder". */
export function roleWords(label: string): string {
  return label.replace(/-/g, " ");
}
