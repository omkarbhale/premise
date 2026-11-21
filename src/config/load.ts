import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { type PremiseConfig, SETTINGS, SETTINGS_BY_KEY } from "./settings.js";

export const CONFIG_FILE_NAME = "config.json";
export const DATA_FOLDER_ENV = "PREMISE_DATA_FOLDER";
const ENV_PREFIX = "PREMISE_";

/** One wrong setting, said plainly. */
export interface ConfigProblem {
  key: string;
  source: string;
  message: string;
}

export class ConfigError extends Error {
  constructor(readonly problems: ConfigProblem[]) {
    super(formatProblems(problems));
    this.name = "ConfigError";
  }
}

export function formatProblems(problems: ConfigProblem[]): string {
  const head =
    problems.length === 1
      ? "premise cannot start: 1 setting is wrong."
      : `premise cannot start: ${problems.length} settings are wrong.`;
  const lines = problems.map((p) => `  - ${p.key} (${p.source}): ${p.message}.`);
  return [head, ...lines, "Every setting is described in docs/reference/configuration.md."].join(
    "\n",
  );
}

/** The environment variable that overrides a dotted key. */
export function envNameFor(key: string): string {
  return ENV_PREFIX + key.toUpperCase().replace(/\./g, "__");
}

function keyForEnvName(name: string): string {
  return name.slice(ENV_PREFIX.length).toLowerCase().replace(/__/g, ".");
}

/** Where the data folder is: the --data flag, then PREMISE_DATA_FOLDER, then ~/.premise. */
export function resolveDataFolder(options: {
  flag?: string | undefined;
  env?: NodeJS.ProcessEnv;
  home?: string;
}): string {
  const fromEnv = options.env?.[DATA_FOLDER_ENV];
  const chosen = options.flag ?? (fromEnv && fromEnv.length > 0 ? fromEnv : undefined);
  return resolve(chosen ?? join(options.home ?? homedir(), ".premise"));
}

function flatten(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out.set(prefix, value);
  }
}

function parseEnvValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function setPath(target: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split(".");
  let node = target;
  for (const part of parts.slice(0, -1)) {
    node[part] ??= {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]!] = value;
}

export interface LoadOptions {
  dataFolder: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Load the configuration: defaults, then config.json in the data folder, then PREMISE_* environment
 * variables. Throws ConfigError naming every wrong setting.
 */
export function loadConfig(options: LoadOptions): PremiseConfig {
  const env = options.env ?? {};
  const file = join(options.dataFolder, CONFIG_FILE_NAME);
  const problems: ConfigProblem[] = [];
  const values = new Map<string, { value: unknown; source: string }>();

  if (existsSync(file)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new ConfigError([
        {
          key: CONFIG_FILE_NAME,
          source: file,
          message: `is not valid JSON (${(error as Error).message})`,
        },
      ]);
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ConfigError([
        { key: CONFIG_FILE_NAME, source: file, message: "must hold one JSON object" },
      ]);
    }
    const flat = new Map<string, unknown>();
    flatten(parsed, "", flat);
    for (const [key, value] of flat) {
      if (!SETTINGS_BY_KEY.has(key)) {
        problems.push({ key, source: file, message: "is not a setting premise knows" });
        continue;
      }
      values.set(key, { value, source: file });
    }
  }

  for (const [name, raw] of Object.entries(env)) {
    if (!name.startsWith(ENV_PREFIX) || name === DATA_FOLDER_ENV || raw === undefined) continue;
    const key = keyForEnvName(name);
    if (!SETTINGS_BY_KEY.has(key)) {
      problems.push({
        key: name,
        source: "environment",
        message: "is not a setting premise knows",
      });
      continue;
    }
    values.set(key, { value: parseEnvValue(raw), source: `environment variable ${name}` });
  }

  const config: Record<string, unknown> = {};
  for (const setting of SETTINGS) {
    const given = values.get(setting.key);
    const value = given ? given.value : setting.default;
    const wrong = setting.check(value);
    if (wrong) {
      problems.push({ key: setting.key, source: given?.source ?? "default", message: wrong });
    }
    setPath(config, setting.key, value);
  }
  setPath(config, "data.folder", options.dataFolder);

  if (problems.length > 0) throw new ConfigError(problems);
  return config as unknown as PremiseConfig;
}
