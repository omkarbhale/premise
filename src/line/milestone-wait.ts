/**
 * Whether premise stops after a milestone is one flag, never words in the milestone's text
 * (decision 0321). A planner, or a person editing a milestone, sometimes writes "(wait)" or
 * "[wait]" into the text; it is taken out and becomes the flag, so the two never disagree.
 */
const WAIT_MARKER = /\s*[[(]\s*(?:wait|stop|stop here|pause|wait here)\s*[\])]\s*/gi;

/** The milestone's text without a wait marker, and whether it had one. */
export function splitWaitMarker(text: string): { text: string; marked: boolean } {
  const marked = WAIT_MARKER.test(text);
  WAIT_MARKER.lastIndex = 0;
  const clean = text
    .replace(WAIT_MARKER, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { text: clean, marked };
}
