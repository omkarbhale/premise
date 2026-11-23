import { existsSync, statSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import type { PremiseConfig } from "../config/settings.js";
import type { Database } from "../storage/database.js";

/**
 * Programs the person provided for a software, listed once and used by both the runner and the
 * agents (decision 0311). Two sources:
 *
 * - `runner.extra_tool_paths` in the settings: exact program files or folders, for every software;
 * - the path premise found when the person answered a "needed" tool question with "I installed
 *   it" (a `tool-installed` event), for that software only.
 *
 * The runner binds each read only into its sandbox at the same path and puts it on the PATH;
 * agents put the same folders on their PATH (their sandbox already reads the filesystem, minus the
 * folders premise denies). Never the whole home folder.
 */
export function providedToolPaths(
  db: Database,
  config: Pick<PremiseConfig, "runner">,
  softwareId: string,
): string[] {
  const found = new Set<string>();
  for (const path of config.runner.extra_tool_paths) found.add(path);
  const rows = db
    .prepare(
      "SELECT detail FROM events WHERE software_id = ? AND module = 'line' AND kind = 'tool-installed' ORDER BY id",
    )
    .all(softwareId) as { detail: string | null }[];
  for (const row of rows) {
    try {
      const path = (JSON.parse(row.detail ?? "null") as { path?: unknown } | null)?.path;
      if (typeof path === "string") found.add(path);
    } catch {
      // an unreadable record names nothing
    }
  }
  return [...found].filter((path) => isAbsolute(path) && existsSync(path));
}

/** The folders on the PATH for provided programs: a file's folder, or a folder and its bin. */
export function toolFolders(paths: string[]): string[] {
  const folders: string[] = [];
  for (const path of paths) {
    if (statSync(path).isDirectory()) {
      folders.push(path);
      if (existsSync(join(path, "bin"))) folders.push(join(path, "bin"));
    } else {
      folders.push(dirname(path));
    }
  }
  return [...new Set(folders)];
}

/** A PATH with the provided programs' folders first. */
export function withProvidedTools(path: string | undefined, paths: string[]): string {
  return [...toolFolders(paths), ...(path ? path.split(delimiter) : [])].join(delimiter);
}
