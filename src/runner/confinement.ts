import { existsSync, lstatSync, readlinkSync } from "node:fs";
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
}

const SYSTEM_FOLDERS = ["/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64", "/etc"];

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
  for (const path of input.readOnlyPaths) {
    if (existsSync(path)) args.push("--ro-bind", path, path);
  }
  args.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp");
  args.push("--bind", input.copy, input.copy, "--chdir", input.copy);
  args.push("sh", "-c", input.shellCommand);
  return { file: "bwrap", args, confined: true };
}
