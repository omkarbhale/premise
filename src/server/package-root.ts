import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** premise's own folder: the one holding its package.json. */
export function packageRoot(): string {
  let folder = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(folder, "package.json"))) {
    const parent = dirname(folder);
    if (parent === folder) break;
    folder = parent;
  }
  return folder;
}

/** premise's prompts and skills (docs/prompts, docs/skills), shipped with the package. */
export function docsFolder(): string {
  return join(packageRoot(), "docs");
}
