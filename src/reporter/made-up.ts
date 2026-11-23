/**
 * Whether a check verdict rests only on made-up data (decision 0280): the checker said what real
 * data, service or environment it did not have, or its evidence says so in words. A verdict "met"
 * on made-up data only is not "works": the report says so and names what to try it on.
 *
 * Returns what was missing, in the checker's words where it gave them ("" when it said only that
 * the data was made up), or null when the verdict does not rest on made-up data alone.
 */
export function madeUpData(evidence: string, notAvailable?: string | null): string | null {
  const said = (notAvailable ?? "").trim();
  if (said) return said.replace(/[.\s]+$/, "");
  const text = evidence.replace(/\s+/g, " ");
  const missing =
    /\b((?:the )?(?:real|actual|live|production)\b[^.;]{0,80}?)\s+(?:was|were|is|are)\s+(?:not available|unavailable|not reachable|not present|missing|not accessible|out of reach)/i.exec(
      text,
    );
  if (missing) return missing[1]!.trim();
  const noReal =
    /\bno (real|actual|live|production) ([^.;,]{1,60}?)(?: was| were| is| are)? (?:available|here|to (?:use|check|test)|could be (?:used|reached))/i.exec(
      text,
    );
  if (noReal) return `${noReal[1]!.toLowerCase()} ${noReal[2]!.trim()}`;
  if (
    /\b(?:only|just)\s+(?:checked|tested|exercised|run|ran|tried|judged)\s+(?:it\s+)?(?:against|on|with)\s+(?:the\s+|my\s+own\s+|its\s+own\s+|own\s+)?(?:fixtures?|samples?|sample data|made[- ]up|fake|synthetic|mock(?:ed)?|stand-in|test data)/i.test(
      text,
    ) ||
    /\b(?:made[- ]up|fabricated|synthetic|fake|mock(?:ed)?) (?:data|input|logs?|records?) only\b/i.test(
      text,
    )
  ) {
    return "";
  }
  return null;
}

/** "real data" when the checker did not say what was missing. */
export function tryItOn(missing: string): string {
  return missing.length > 0 ? missing : "real data";
}
