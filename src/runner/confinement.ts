import { existsSync, lstatSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import type { RunnerConfinement } from "../config/settings.js";

/**
 * How running software is confined (decision 0163): bubblewrap gives it a view of the machine with
 * only the system's programs (read only), its own copy of the code (writable) and an empty
 * temporary folder. premise's data folder, the owner's home folder and every credential are
 * simply not there. Command-line software also gets no network at all.
 */

export interface ConfinedCommand {
  file: string;
  args: string[];
  /** False when the owner turned confinement off; the page says so. */
  confined: boolean;
}

export interface ConfineInput {
  mode: RunnerConfinement;
  /** The run's own copy of the code: the only writable folder. */
  copy: string;
  /** What to run, as one line for the shell. */
  shellCommand: string;
  /** Web software must share the machine's network to be opened; command-line software gets none. */
  network: boolean;
  readOnlyPaths: string[];
  /** Files and folders the network needs, whose links are followed; default NETWORK_PATHS. */
  networkPaths?: string[];
}

const SYSTEM_FOLDERS = ["/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64", "/etc"];

/**
 * What looking up a host name and trusting a site needs. On some machines these are links to files
 * outside the system folders (on WSL2, /etc/resolv.conf points into /mnt/wsl), which would point
 * nowhere inside the sandbox unless the real file is bound as well.
 */
export const NETWORK_PATHS = [
  "/etc/resolv.conf",
  "/etc/hosts",
  "/etc/nsswitch.conf",
  "/etc/ssl",
  "/etc/ca-certificates",
];

/** A link target so broad that binding it would expose more than the network needs. */
function tooBroad(path: string): boolean {
  return path.split(sep).filter(Boolean).length < 2;
}

function inside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(folder.endsWith(sep) ? folder : folder + sep);
}

/** Every link found at or under a path (folders are searched a few levels deep, never followed). */
function linksUnder(path: string, depth = 3, found: string[] = []): string[] {
  let info;
  try {
    info = lstatSync(path);
  } catch {
    return found;
  }
  if (info.isSymbolicLink()) {
    found.push(path);
  } else if (info.isDirectory() && depth > 0) {
    let names: string[] = [];
    try {
      names = readdirSync(path);
    } catch {
      return found;
    }
    for (const name of names) linksUnder(join(path, name), depth - 1, found);
  }
  return found;
}

/**
 * The real target of every symbolic link at or under the given paths that is not already inside one
 * of the bound folders, each once. Never a whole mount: a target with fewer than two path parts
 * is left out, and a folder is only bound when the link points at a folder.
 */
export function linkTargetsOutside(paths: string[], bound: string[]): string[] {
  const targets = new Set<string>();
  for (const path of paths) {
    for (const link of linksUnder(path)) {
      let real: string;
      try {
        real = realpathSync(link);
      } catch {
        continue;
      }
      if (tooBroad(real) || bound.some((folder) => inside(real, folder))) continue;
      targets.add(real);
    }
  }
  return [...targets].sort();
}

/** Where a link at the path finally points, or null when it is not a link or points nowhere. */
export function finalLinkTarget(path: string): string | null {
  try {
    if (!lstatSync(path).isSymbolicLink()) return null;
    return realpathSync(path);
  } catch {
    return null;
  }
}

/**
 * The bubblewrap arguments that make each read-only path visible, given the folders already bound.
 * A path inside a bound folder is visible already and is not bound again: binding over it fails
 * when it is a link whose target the sandbox does not have (bubblewrap then cannot create the
 * mount point and nothing runs). For a link, its real target is bound instead, with the folder
 * that holds it when the target is a program (a program such as a browser needs the files beside
 * it), never the home folder or a whole mount; and the link itself is recreated when it is not
 * inside a bound folder.
 */
export function readOnlyBinds(paths: string[], alreadyBound: string[]): string[] {
  const args: string[] = [];
  const bound = [...alreadyBound];
  const visible = (path: string) => bound.some((folder) => inside(path, folder));
  for (const path of paths) {
    let info;
    try {
      info = lstatSync(path);
    } catch {
      continue;
    }
    if (!info.isSymbolicLink()) {
      if (visible(path)) continue;
      args.push("--ro-bind", path, path);
      bound.push(path);
      continue;
    }
    let real: string;
    try {
      real = realpathSync(path);
    } catch {
      continue; // a link that points nowhere names nothing to show
    }
    let target = real;
    if (!lstatSync(real).isDirectory()) {
      const folder = dirname(real);
      const home = homedir();
      if (!tooBroad(folder) && folder !== home && !inside(home, folder)) target = folder;
    }
    if (!visible(target)) {
      args.push("--ro-bind", target, target);
      bound.push(target);
    }
    if (!visible(path)) args.push("--symlink", real, path);
  }
  return args;
}

export function confine(input: ConfineInput): ConfinedCommand {
  if (input.mode === "none") {
    return { file: "sh", args: ["-c", input.shellCommand], confined: false };
  }
  const args = [
    "--die-with-parent",
    "--new-session",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    ...(input.network ? [] : ["--unshare-net"]),
  ];
  for (const folder of SYSTEM_FOLDERS) {
    if (!existsSync(folder)) continue;
    if (lstatSync(folder).isSymbolicLink()) {
      args.push("--symlink", readlinkSync(folder), folder);
    } else {
      args.push("--ro-bind", folder, folder);
    }
  }
  const bound = [...SYSTEM_FOLDERS, ...input.readOnlyPaths];
  for (const target of linkTargetsOutside(input.networkPaths ?? NETWORK_PATHS, bound)) {
    args.push("--ro-bind", target, target);
  }
  args.push(...readOnlyBinds(input.readOnlyPaths, SYSTEM_FOLDERS));
  args.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp");
  args.push("--bind", input.copy, input.copy, "--chdir", input.copy);
  args.push("sh", "-c", input.shellCommand);
  return { file: "bwrap", args, confined: true };
}
