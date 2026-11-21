import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Small existing softwares in temporary local git repositories, for taking on existing software:
 * a command-line project with a few commits of history, and a web project whose README says one
 * thing while its code does another. Nothing touches the network; "clone addresses" are file://
 * paths to bare repositories made here.
 */

export function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Someone",
      GIT_AUTHOR_EMAIL: "someone@example.invalid",
      GIT_COMMITTER_NAME: "Someone",
      GIT_COMMITTER_EMAIL: "someone@example.invalid",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function write(folder: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), content);
  }
}

/** A repository built commit by commit: each step's files, then its message. */
export function repository(
  folder: string,
  steps: { files: Record<string, string>; message: string }[],
): string {
  mkdirSync(folder, { recursive: true });
  git(folder, ["init", "--quiet", "--initial-branch", "main"]);
  for (const step of steps) {
    write(folder, step.files);
    git(folder, ["add", "--all"]);
    git(folder, ["commit", "--quiet", "--message", step.message]);
  }
  return folder;
}

/** A word-counting command with three commits of history. */
export function commandLineProject(folder: string): string {
  return repository(folder, [
    {
      message: "Count the words in a file",
      files: {
        "package.json": JSON.stringify(
          {
            name: "wordcount",
            version: "1.0.0",
            bin: { wordcount: "wc.js" },
            scripts: { test: "node test.js" },
          },
          null,
          2,
        ),
        "wc.js": `const fs = require("node:fs");\nconst text = fs.readFileSync(process.argv[2], "utf8");\nconsole.log(text.split(/\\s+/).filter(Boolean).length);\n`,
        "README.md":
          "# wordcount\n\nCounts the words in a text file, for writers checking a draft's length.\n",
      },
    },
    {
      message: "Add --lines to count lines instead",
      files: {
        "wc.js": `const fs = require("node:fs");\nconst lines = process.argv.includes("--lines");\nconst file = process.argv.filter((a) => !a.startsWith("--"))[2];\nconst text = fs.readFileSync(file, "utf8");\nconsole.log(lines ? text.split("\\n").length : text.split(/\\s+/).filter(Boolean).length);\n`,
      },
    },
    {
      message: "Add a test",
      files: { "test.js": `require("node:assert").ok(true);\n` },
    },
  ]);
}

/** A web page of books: its README says sorted by title, its code sorts by author. */
export function webProject(folder: string): string {
  return repository(folder, [
    {
      message: "A page listing the books",
      files: {
        "README.md":
          "# Bookshelf\n\nA web page listing my books, sorted by title. Start it with `npm start`; it listens on port 3000.\n",
        "package.json": JSON.stringify(
          { name: "bookshelf", scripts: { start: "node server.js" } },
          null,
          2,
        ),
        "server.js": `const http = require("node:http");\nconst books = [{ title: "B", author: "Z" }, { title: "A", author: "Y" }];\nbooks.sort((a, b) => a.author.localeCompare(b.author));\nhttp.createServer((q, r) => r.end(books.map((b) => b.title).join("\\n"))).listen(Number(process.env.PORT), process.env.HOST);\n`,
      },
    },
  ]);
}

/** A bare copy of a repository, reachable at a file:// clone address. */
export function bareCopy(source: string, folder: string): string {
  git(dirname(folder), ["clone", "--quiet", "--bare", source, folder]);
  return `file://${folder}`;
}
