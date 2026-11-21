import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PremiseConfig } from "../../src/config/settings.js";
import { Git } from "../../src/git/git.js";
import { type Database } from "../../src/storage/database.js";
import { createSoftware } from "../../src/storage/softwares.js";

/**
 * Tiny softwares in temporary local repositories, for the runner's and reporter's tests: a
 * command-line script, a minimal web server, and ways of going wrong. Nothing touches the network.
 */

export const HELLO_SCRIPT = `
const name = process.argv[2] ?? "friend";
console.log("Hello, " + name + "!");
`;

export const WEB_SERVER = `
const http = require("node:http");
const port = Number(process.env.PORT);
const host = process.env.HOST;
http
  .createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("hello from the fixture web app");
  })
  .listen(port, host, () => console.log("listening on " + host + ":" + port));
`;

/** Answers, then dies shortly after, every time it is started. */
export const CRASHING_SERVER = `
const http = require("node:http");
http.createServer((q, r) => r.end("up")).listen(Number(process.env.PORT), process.env.HOST, () => {
  console.log("up, and about to crash");
  setTimeout(() => process.exit(3), 300);
});
`;

/** Listens on every address of the machine, which premise must refuse. */
export const OPEN_SERVER = `
const http = require("node:http");
http.createServer((q, r) => r.end("up")).listen(Number(process.env.PORT), "0.0.0.0");
`;

export function runBlock(lines: string[]): string {
  return [
    "# How to run it",
    "",
    "Plain words for people.",
    "",
    "```premise-run",
    ...lines,
    "```",
    "",
  ].join("\n");
}

export interface FixtureFiles {
  [path: string]: string;
}

export interface FixtureSoftware {
  id: string;
  repo: string;
  git: Git;
  /** Commit more files, with a trace trailer; returns the new commit. */
  commit(files: FixtureFiles, serves?: string[], subject?: string): string;
}

/** A software row and its own repository under the data folder, with a first commit. */
export function makeSoftware(
  db: Database,
  config: PremiseConfig,
  name: string,
  files: FixtureFiles,
  serves: string[] = ["W-1"],
): FixtureSoftware {
  const id = createSoftware(db, { name }, config.softwares).id;
  const repo = join(config.data.folder, "repos", id);
  const git = new Git({ name: "premise", email: "premise@localhost" }, "main");
  git.init(repo);
  const fixture: FixtureSoftware = {
    id,
    repo,
    git,
    commit(more, ids = serves, subject = "Change") {
      for (const [path, content] of Object.entries(more)) {
        const full = join(repo, path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
      }
      return git.commit(repo, { subject, trailers: [[config.record.trailer, ids.join(", ")]] });
    },
  };
  fixture.commit(files, serves, "First version");
  return fixture;
}
