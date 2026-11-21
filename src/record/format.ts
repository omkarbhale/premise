/**
 * The shape of the lasting record: files, item kinds, and one item per line (decision 0082).
 * See docs/specs/record-keeper.md section 4.
 */
export const ITEM_KINDS = ["Y", "U", "R", "E", "W", "T", "D", "M"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const PRIORITIES = ["must", "should", "could"] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface RecordFileSpec {
  file: string;
  title: string;
  /** The kinds of item the file holds. Empty for a file that holds free text. */
  kinds: ItemKind[];
}

/** Every file of the record, in reading order. `run.md` is free text; the others hold items. */
export const RECORD_FILES: readonly RecordFileSpec[] = [
  { file: "why.md", title: "Why", kinds: ["Y"] },
  { file: "who.md", title: "Who", kinds: ["U", "R"] },
  { file: "exists.md", title: "What already exists", kinds: ["E"] },
  { file: "what.md", title: "What it must do", kinds: ["W"] },
  { file: "taste.md", title: "Taste", kinds: ["T"] },
  { file: "decisions.md", title: "Decisions", kinds: ["D"] },
  { file: "milestones.md", title: "Milestones", kinds: ["M"] },
  { file: "run.md", title: "How to run it", kinds: [] },
];

export const FILE_OF_KIND: Readonly<Record<ItemKind, string>> = Object.fromEntries(
  RECORD_FILES.flatMap((f) => f.kinds.map((k) => [k, f.file])),
) as Record<ItemKind, string>;

export const KIND_NAMES: Readonly<Record<ItemKind, string>> = {
  Y: "a reason to build",
  U: "a user",
  R: "a role",
  E: "something that already exists",
  W: "something it must do",
  T: "a taste",
  D: "a decision",
  M: "a milestone",
};

/** Roles are lower-case words, or `assumed` / `recovered`. Never a person's name (decision 0081). */
export const FROM_PATTERN = /^[a-z][a-z0-9-]*$/;

export interface Marks {
  /** Only for W items. */
  priority?: Priority;
  from: string;
  /** The item this one replaces. */
  replaces?: string;
  /** Only for D items: language, framework, storage, how it runs, data model, who can get in. */
  foundation?: boolean;
  /** Only for M items: premise stops after this milestone until the operator says go on. */
  wait?: boolean;
  /** The date the say-back confirmed a recovered item. */
  confirmed?: string;
  date: string;
}

export interface RecordItem {
  id: string;
  kind: ItemKind;
  number: number;
  file: string;
  /** 1-based line in the file. */
  line: number;
  text: string;
  marks: Marks;
  struck?: { date: string; reason: string };
  /** The item that replaced this one, when there is one. */
  replacedBy?: string;
}

export function itemId(kind: ItemKind, number: number): string {
  return `${kind}-${number}`;
}

export const ID_PATTERN = /^([YUREWTDM])-([1-9]\d*)$/;

/** Every ID written in a piece of text. `I-n` (intake) is allowed and lives in premise's database. */
export const ID_MENTION = /\b([YUREWTDMI])-([1-9]\d*)\b/g;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** The marks in canonical order, as written between the parentheses. */
export function formatMarks(marks: Marks): string {
  const parts: string[] = [];
  if (marks.priority) parts.push(marks.priority);
  parts.push(`from: ${marks.from}`);
  if (marks.replaces) parts.push(`replaces: ${marks.replaces}`);
  if (marks.foundation) parts.push("foundation");
  if (marks.wait) parts.push("wait");
  if (marks.confirmed) parts.push(`confirmed: ${marks.confirmed}`);
  parts.push(marks.date);
  return parts.join("; ");
}

export function formatItemLine(item: Pick<RecordItem, "id" | "text" | "marks" | "struck">): string {
  const live = `[${item.id}] ${item.text} (${formatMarks(item.marks)})`;
  return item.struck
    ? `- ~~${live}~~ struck ${item.struck.date}: ${item.struck.reason}`
    : `- ${live}`;
}

/** The first lines of a new, empty record file. */
export function emptyFile(spec: RecordFileSpec): string {
  return `# ${spec.title}\n`;
}
