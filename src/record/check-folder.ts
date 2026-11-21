import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatDiagnostics } from "./diagnostics.js";
import { RECORD_FILES } from "./format.js";
import { parseRecord } from "./parse.js";

/** Check a record folder on disk, for the command `premise record check <folder>`. */
export function checkRecordFolder(folder: string): { ok: boolean; message: string } {
  if (!existsSync(folder)) {
    return {
      ok: false,
      message: `There is no folder at ${folder}. Give the path of a software's record folder (the one named premise).`,
    };
  }
  const files = new Map<string, string>();
  for (const spec of RECORD_FILES) {
    const path = join(folder, spec.file);
    if (existsSync(path)) files.set(spec.file, readFileSync(path, "utf8"));
  }
  if (files.size === 0) {
    return {
      ok: false,
      message: `${folder} holds none of the record's files (${RECORD_FILES.map((f) => f.file).join(", ")}). Is it the right folder?`,
    };
  }
  const { items, diagnostics } = parseRecord(files);
  if (diagnostics.length > 0) {
    return {
      ok: false,
      message: `The record has ${diagnostics.length} problem${diagnostics.length === 1 ? "" : "s"}:\n${formatDiagnostics(diagnostics)}`,
    };
  }
  const live = items.filter((i) => !i.struck).length;
  return {
    ok: true,
    message: `The record is in order: ${live} live item${live === 1 ? "" : "s"}, ${items.length - live} struck through.`,
  };
}
