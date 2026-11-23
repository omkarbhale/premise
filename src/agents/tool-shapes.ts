/**
 * The input shape of each premise tool, written once (decision 0285). From one shape premise makes
 * both the JSON Schema it declares to agents in tools/list and the check it runs on every call, so
 * the two cannot drift.
 *
 * Reading a call has two steps:
 * 1. Lenient reading, of exactly these things and nothing more: a list or an object that arrives as
 *    text holding JSON of the right kind (a number too), "yes"/"no" (and "true"/"false") for true or
 *    false, null for a field that may be left out, and, for fields marked `loose`, the case and
 *    spacing the server already ignored ("Not met" for "not-met"). premise never guesses beyond
 *    that.
 * 2. The strict check against the declared shape. A refusal names the field, says what arrived (its
 *    kind and a short excerpt), what to send, and gives a correct example of that field.
 *
 * What the shape cannot say (whether an item ID is live in the record, how many items a stage may
 * hold) stays with the module that serves the tool.
 */

interface Base {
  /** One line on what the field is, shown to agents. */
  description?: string;
  /** A correct value, used in refusals when the tool's own example has none for this field. */
  example?: unknown;
}
export interface StringShape extends Base {
  type: "string";
  enum?: readonly string[];
  /** Case, spaces and underscores are ignored when matching `enum` ("Not met" is "not-met"). */
  loose?: boolean;
}
export interface NumberShape extends Base {
  type: "integer" | "number";
  minimum?: number;
}
export interface BooleanShape extends Base {
  type: "boolean";
}
export interface ArrayShape extends Base {
  type: "array";
  items: Shape;
  minItems?: number;
}
export interface ObjectShape extends Base {
  type: "object";
  properties: Record<string, Shape>;
  required?: readonly string[];
}
export interface UnionShape extends Base {
  anyOf: readonly Shape[];
  /** For a union of objects told apart by one field (an operation's "op"). */
  discriminator?: string;
}
export type Shape =
  StringShape | NumberShape | BooleanShape | ArrayShape | ObjectShape | UnionShape;

// ---- Building shapes ----------------------------------------------------------------------------

export const text = (description: string, more: Partial<StringShape> = {}): StringShape => ({
  type: "string",
  description,
  ...more,
});
export const oneOf = (
  values: readonly string[],
  description: string,
  more: Partial<StringShape> = {},
): StringShape => ({ type: "string", enum: values, description, ...more });
export const yesNo = (description: string): BooleanShape => ({ type: "boolean", description });
export const whole = (description: string, minimum?: number): NumberShape => ({
  type: "integer",
  description,
  ...(minimum !== undefined && { minimum }),
});
export const list = (items: Shape, description: string, minItems?: number): ArrayShape => ({
  type: "array",
  items,
  description,
  ...(minItems !== undefined && { minItems }),
});
export const object = (
  properties: Record<string, Shape>,
  required: readonly string[] = [],
  description?: string,
): ObjectShape => ({
  type: "object",
  properties,
  required,
  ...(description !== undefined && { description }),
});
export const either = (
  anyOf: readonly Shape[],
  description: string,
  discriminator?: string,
): UnionShape => ({
  anyOf,
  description,
  ...(discriminator !== undefined && { discriminator }),
});

// ---- The declared JSON Schema -------------------------------------------------------------------

/** The JSON Schema premise declares for a shape in tools/list. */
export function jsonSchema(shape: Shape): Record<string, unknown> {
  const described = (schema: Record<string, unknown>) =>
    shape.description ? { ...schema, description: shape.description } : schema;
  if ("anyOf" in shape) return described({ anyOf: shape.anyOf.map(jsonSchema) });
  switch (shape.type) {
    case "string":
      return described({ type: "string", ...(shape.enum && { enum: [...shape.enum] }) });
    case "integer":
    case "number":
      return described({
        type: shape.type,
        ...(shape.minimum !== undefined && { minimum: shape.minimum }),
      });
    case "boolean":
      return described({ type: "boolean" });
    case "array":
      return described({
        type: "array",
        items: jsonSchema(shape.items),
        ...(shape.minItems !== undefined && { minItems: shape.minItems }),
      });
    case "object":
      return described({
        type: "object",
        properties: Object.fromEntries(
          Object.entries(shape.properties).map(([k, v]) => [k, jsonSchema(v)]),
        ),
        ...(shape.required && shape.required.length > 0 && { required: [...shape.required] }),
      });
  }
}

// ---- Reading a call -----------------------------------------------------------------------------

/** One field that is wrong, said so it can be fixed in one go. */
export interface FieldProblem {
  /** Where it is, such as `touches` or `operations[2].from`. */
  path: string;
  /** What is wrong, what arrived and what to send. */
  message: string;
}

export interface ReadInput {
  /** The call's arguments after lenient reading. */
  value: Record<string, unknown>;
  /** What premise read leniently, for the agent to send properly next time. */
  notes: string[];
  problems: FieldProblem[];
}

type Kind = "text" | "number" | "boolean" | "list" | "object" | "null" | "missing";

function kindOf(value: unknown): Kind {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "list";
  if (typeof value === "string") return "text";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "object";
}

/** What arrived, in plain words with a short excerpt. */
export function received(value: unknown): string {
  const kind = kindOf(value);
  if (kind === "missing") return "nothing";
  if (kind === "null") return "null";
  const raw = JSON.stringify(value) ?? String(value);
  const excerpt = raw.length > 80 ? `${raw.slice(0, 77)}...` : raw;
  switch (kind) {
    case "text":
      return `text ${excerpt}`;
    case "list":
      return `a list of ${(value as unknown[]).length}: ${excerpt}`;
    case "object": {
      const keys = Object.keys(value as object);
      return keys.length ? `an object with ${keys.map((k) => `"${k}"`).join(", ")}` : "{}";
    }
    case "boolean":
      return `${String(value)}`;
    default:
      return excerpt;
  }
}

/** What a shape wants, in a few words. */
export function wanted(shape: Shape): string {
  if ("anyOf" in shape) {
    if (shape.discriminator) return `an object with "${shape.discriminator}"`;
    return [...new Set(shape.anyOf.map(wanted))].join(" or ");
  }
  switch (shape.type) {
    case "string":
      return shape.enum ? `one of ${shape.enum.map((v) => JSON.stringify(v)).join(", ")}` : "text";
    case "integer":
      return shape.minimum !== undefined
        ? `a whole number from ${shape.minimum}`
        : "a whole number";
    case "number":
      return "a number";
    case "boolean":
      return "true or false";
    case "array":
      return "anyOf" in shape.items
        ? `a list, each ${wanted(shape.items)}`
        : `a list of ${plural(wanted(shape.items))}`;
    case "object":
      return shape.required && shape.required.length
        ? `an object with ${shape.required.map((k) => `"${k}"`).join(", ")}`
        : "an object";
  }
}

function plural(words: string): string {
  if (words === "text") return "texts";
  if (words.startsWith("an object")) return `objects${words.slice("an object".length)}`;
  if (words.startsWith("a whole number")) return `whole numbers${words.slice(14)}`;
  return words;
}

const YES = new Set(["yes", "true"]);
const NO = new Set(["no", "false"]);

function looseWord(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

/** Text holding JSON of the wanted kind, read as that kind; undefined when it does not hold one. */
function fromJsonText(value: string, kind: "list" | "object" | "number"): unknown {
  const trimmed = value.trim();
  const opens = kind === "list" ? "[" : kind === "object" ? "{" : "";
  if (opens && !trimmed.startsWith(opens)) return undefined;
  if (!opens && !/^-?\d+(\.\d+)?$/.test(trimmed)) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return kindOf(parsed) === kind ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function join(path: string, key: string | number): string {
  if (typeof key === "number") return `${path}[${key}]`;
  return path ? `${path}.${key}` : key;
}

class Reader {
  readonly notes: string[] = [];
  readonly problems: FieldProblem[] = [];

  constructor(private readonly example: (path: string, shape: Shape) => unknown) {}

  private refuse(path: string, shape: Shape, value: unknown, what?: string): void {
    const example = this.example(path, shape);
    this.problems.push({
      path,
      message: `"${path}" ${what ?? `must be ${wanted(shape)}`}; it is ${received(value)}.${example === undefined ? "" : ` For example: "${lastKey(path)}": ${JSON.stringify(example)}`}`,
    });
  }

  /** Read one value against its shape: the value as read, or undefined after a refusal. */
  read(shape: Shape, value: unknown, path: string): unknown {
    if ("anyOf" in shape) return this.readUnion(shape, value, path);
    switch (shape.type) {
      case "string": {
        if (typeof value !== "string") {
          this.refuse(path, shape, value);
          return undefined;
        }
        if (!shape.enum) return value;
        if (shape.enum.includes(value)) return value;
        const loose = shape.loose ? shape.enum.find((v) => v === looseWord(value)) : undefined;
        if (loose !== undefined) return loose;
        this.refuse(path, shape, value);
        return undefined;
      }
      case "integer":
      case "number": {
        let number = value;
        if (typeof value === "string") {
          const parsed = fromJsonText(value, "number");
          if (parsed !== undefined) number = parsed;
        }
        const fits =
          typeof number === "number" &&
          Number.isFinite(number) &&
          (shape.type === "number" || Number.isInteger(number)) &&
          (shape.minimum === undefined || number >= shape.minimum);
        if (!fits) {
          this.refuse(path, shape, value);
          return undefined;
        }
        return number;
      }
      case "boolean": {
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
          const word = value.trim().toLowerCase();
          if (YES.has(word)) return true;
          if (NO.has(word)) return false;
        }
        this.refuse(path, shape, value);
        return undefined;
      }
      case "array": {
        let items = value;
        if (typeof value === "string") {
          const parsed = fromJsonText(value, "list");
          if (parsed !== undefined) {
            items = parsed;
            this.notes.push(
              `"${path}" came as text holding a list; premise read it as the list. Send it as a list, not as quoted text.`,
            );
          }
        }
        if (!Array.isArray(items)) {
          this.refuse(path, shape, value);
          return undefined;
        }
        if (shape.minItems !== undefined && items.length < shape.minItems) {
          this.refuse(
            path,
            shape,
            items,
            `must be a list of at least ${shape.minItems} (${plural(wanted(shape.items))})`,
          );
          return undefined;
        }
        return items.map((item, i) => this.read(shape.items, item, join(path, i)));
      }
      case "object": {
        let entries = value;
        if (typeof value === "string") {
          const parsed = fromJsonText(value, "object");
          if (parsed !== undefined) {
            entries = parsed;
            this.notes.push(
              `"${path}" came as text holding an object; premise read it as the object. Send it as an object, not as quoted text.`,
            );
          }
        }
        if (kindOf(entries) !== "object") {
          this.refuse(path, shape, value);
          return undefined;
        }
        return this.readObject(shape, entries as Record<string, unknown>, path);
      }
    }
  }

  private readObject(
    shape: ObjectShape,
    value: Record<string, unknown>,
    path: string,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...value };
    const unknown = Object.keys(value).filter((k) => !(k in shape.properties));
    for (const key of shape.required ?? []) {
      if (value[key] === undefined || value[key] === null) {
        const where = join(path, key);
        const example = this.example(where, shape.properties[key]!);
        const others = unknown.length
          ? ` It has ${unknown.map((k) => `"${k}"`).join(", ")}, which premise does not read here${unknown.length === 1 && likelyMeant(unknown[0]!, key) ? `: put that in "${key}"` : ""}.`
          : "";
        this.problems.push({
          path: where,
          message: `"${where}" is missing: ${(shape.properties[key]!.description ?? wanted(shape.properties[key]!)).replace(/\.$/, "")}.${others}${example === undefined ? "" : ` For example: "${key}": ${JSON.stringify(example)}`}`,
        });
      }
    }
    for (const [key, field] of Object.entries(shape.properties)) {
      // null for a field that may be left out means leaving it out.
      if (value[key] === null) delete out[key];
      if (value[key] === undefined || value[key] === null) continue;
      out[key] = this.read(field, value[key], join(path, key));
    }
    return out;
  }

  private readUnion(shape: UnionShape, value: unknown, path: string): unknown {
    if (shape.discriminator) {
      const key = shape.discriminator;
      const tag = kindOf(value) === "object" ? (value as Record<string, unknown>)[key] : undefined;
      const variant = shape.anyOf.find(
        (v) =>
          "type" in v &&
          v.type === "object" &&
          (v.properties[key] as StringShape | undefined)?.enum?.includes(tag as string),
      );
      if (variant) return this.read(variant, value, path);
      if (kindOf(value) === "text") {
        const parsed = fromJsonText(value as string, "object");
        if (parsed !== undefined) {
          this.notes.push(
            `"${path}" came as text holding an object; premise read it as the object. Send it as an object, not as quoted text.`,
          );
          return this.readUnion(shape, parsed, path);
        }
      }
      const tags = shape.anyOf.flatMap(
        (v) =>
          ("type" in v && v.type === "object" && (v.properties[key] as StringShape)?.enum) || [],
      );
      const where = join(path, key);
      this.problems.push({
        path: where,
        message:
          kindOf(value) === "object"
            ? `"${where}" must be one of ${tags.map((t) => JSON.stringify(t)).join(", ")}; it is ${received(tag)}.${exampleLine(this.example(path, shape))}`
            : `"${path}" must be an object with "${key}"; it is ${received(value)}.${exampleLine(this.example(path, shape))}`,
      });
      return undefined;
    }
    // The first alternative that reads without a problem; else the one closest in kind.
    for (const alternative of shape.anyOf) {
      const trial = new Reader(this.example);
      const read = trial.read(alternative, value, path);
      if (trial.problems.length === 0) {
        this.notes.push(...trial.notes);
        return read;
      }
    }
    const kind = kindOf(value);
    const closest = shape.anyOf.find((a) => sameKind(a, kind));
    if (closest && kind !== "text") return this.read(closest, value, path);
    this.refuse(path, shape, value);
    return undefined;
  }
}

function exampleLine(example: unknown): string {
  return example === undefined ? "" : ` For example: ${JSON.stringify(example)}`;
}

function sameKind(shape: Shape, kind: Kind): boolean {
  if ("anyOf" in shape) return shape.anyOf.some((s) => sameKind(s, kind));
  if (kind === "list") return shape.type === "array";
  if (kind === "object") return shape.type === "object";
  return false;
}

function lastKey(path: string): string {
  const m = /([A-Za-z_][A-Za-z0-9_]*)(?:\[\d+\])*$/.exec(path);
  return m?.[1] ?? path;
}

/** A field under a near name ("line" for "text", "items" for "item") is probably the one meant. */
function likelyMeant(given: string, key: string): boolean {
  const pairs: Record<string, readonly string[]> = {
    text: ["line", "content", "item", "description", "words", "statement"],
    from: ["mark", "source", "origin"],
    kind: ["type", "id_prefix", "prefix"],
    reason: ["why", "because", "reasons"],
  };
  return (pairs[key] ?? []).includes(given.toLowerCase());
}

/** A value along a path ("operations[2].from") in an example call, if it has one. */
export function exampleAt(example: unknown, path: string): unknown {
  let at: unknown = example;
  for (const part of path.match(/[A-Za-z_][A-Za-z0-9_]*|\[\d+\]/g) ?? []) {
    if (part.startsWith("[")) {
      if (!Array.isArray(at) || at.length === 0) return undefined;
      const index = Number(part.slice(1, -1));
      at = at[Math.min(index, at.length - 1)];
    } else {
      if (kindOf(at) !== "object") return undefined;
      at = (at as Record<string, unknown>)[part];
    }
  }
  return at;
}

/** A correct value made from the shape alone, for fields the tool's example leaves out. */
export function sample(shape: Shape): unknown {
  if (shape.example !== undefined) return shape.example;
  if ("anyOf" in shape)
    return sample(shape.anyOf.find((s) => "type" in s && s.type === "object") ?? shape.anyOf[0]!);
  switch (shape.type) {
    case "string":
      return shape.enum ? shape.enum[0] : "...";
    case "integer":
    case "number":
      return shape.minimum ?? 1;
    case "boolean":
      return false;
    case "array":
      return [sample(shape.items)];
    case "object":
      return Object.fromEntries(
        (shape.required ?? []).map((k) => [k, sample(shape.properties[k]!)]),
      );
  }
}

/**
 * Read a call's arguments against the tool's shape. `example` is the tool's example call, which
 * gives the example in each refusal.
 */
export function readInput(
  shape: ObjectShape,
  args: Record<string, unknown>,
  example?: Record<string, unknown>,
): ReadInput {
  const reader = new Reader((path, field) => {
    const fromExample = example === undefined ? undefined : exampleAt(example, path);
    if (fromExample !== undefined && fits(field, fromExample)) return fromExample;
    return sample(field);
  });
  const value = reader.read(shape, args, "") as Record<string, unknown> | undefined;
  return { value: value ?? args, notes: reader.notes, problems: reader.problems };
}

/** Whether a value already fits a shape, with no lenient reading. */
export function fits(shape: Shape, value: unknown): boolean {
  if ("anyOf" in shape) return shape.anyOf.some((s) => fits(s, value));
  switch (shape.type) {
    case "string":
      return typeof value === "string" && (!shape.enum || shape.enum.includes(value));
    case "integer":
    case "number":
      return (
        typeof value === "number" &&
        (shape.type === "number" || Number.isInteger(value)) &&
        (shape.minimum === undefined || value >= shape.minimum)
      );
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return (
        Array.isArray(value) &&
        (shape.minItems === undefined || value.length >= shape.minItems) &&
        value.every((v) => fits(shape.items, v))
      );
    case "object": {
      if (kindOf(value) !== "object") return false;
      const v = value as Record<string, unknown>;
      return (
        (shape.required ?? []).every((k) => v[k] !== undefined && v[k] !== null) &&
        Object.entries(shape.properties).every(
          ([k, s]) => v[k] === undefined || v[k] === null || fits(s, v[k]),
        )
      );
    }
  }
}
