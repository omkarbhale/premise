import type { ScenarioSpec } from "./scripted-work.js";

/**
 * The two kept demos (decisions 0108-0110): small softwares of different kinds, each taken from a
 * one-paragraph idea to running software by the scripted agent and a scripted operator. Everything
 * an agent "writes" here is fixed in advance, including a defect planted in the first build that
 * the checker was not told about: the check must catch it, and the fix round then mends it.
 */

export interface DraftLine {
  text: string;
  from?: "operator" | "assumed" | "suggestion";
  kind?: string;
  priority?: "must" | "should" | "could";
}

export interface DemoTask {
  title: string;
  /** Matched against the record's lines to name the items the task serves. */
  serves: RegExp[];
  check: string;
}

export interface DemoSoftware {
  id: "cli" | "web";
  title: string;
  idea: string;
  why: DraftLine[];
  who: DraftLine[];
  what: DraftLine[];
  /** The assumption the scripted operator strikes at the say-back, and why. */
  strike: { match: RegExp; reason: string };
  decisions: (DraftLine & { foundation?: boolean })[];
  milestones: string[];
  tasks: DemoTask[];
  kind: string;
  howToRun: string;
  /** The files the builder leaves after task n (cumulative), with the planted defect. */
  build(task: number): Record<string, string>;
  /** The files after the fix round: the defect mended. */
  fixed(): Record<string, string>;
  /** The checker's scenarios, matched to record items by their words. */
  scenarios: { match: RegExp; scenario: ScenarioSpec }[];
  /** The record item the planted defect breaks, matched by its words. */
  planted: RegExp;
  /** premise stops after the milestone until the scripted operator says go on. */
  waitAfterMilestone: boolean;
}

const runBlock = (lines: string[]) => ["```premise-run", ...lines, "```"].join("\n");

// ---- A command-line utility: counting lines, words and characters ---------------------------------

const COUNT_TEXT = "one two\\n\\nthree  four\\n";

function countProgram(task: number, fixed: boolean): string {
  const words = fixed
    ? "const words = text.split(/\\s+/).filter(Boolean).length;"
    : // Planted defect: splitting on single white-space characters counts the gaps as words.
      "const words = text.split(/\\s/).length;";
  return [
    'import { readFileSync } from "node:fs";',
    "",
    "const file = process.argv[2];",
    "if (!file) {",
    '  console.error("Give a file to count, for example: node count.mjs notes.txt");',
    "  process.exit(2);",
    "}",
    ...(task >= 3 || fixed
      ? [
          "let text;",
          "try {",
          '  text = readFileSync(file, "utf8");',
          "} catch (error) {",
          "  console.error(`count: cannot read ${file} (${error.code ?? error.message}).`);",
          "  process.exit(1);",
          "}",
        ]
      : ['const text = readFileSync(file, "utf8");']),
    "const lines = (text.match(/\\n/g) ?? []).length;",
    ...(task >= 2 || fixed ? [words] : []),
    "console.log(`lines: ${lines}`);",
    ...(task >= 2 || fixed ? ["console.log(`words: ${words}`);"] : []),
    "console.log(`characters: ${text.length}`);",
    "",
  ].join("\n");
}

function countFiles(task: number, fixed = false): Record<string, string> {
  return {
    "count.mjs": countProgram(task, fixed),
    "sample.txt": "premise took this tool from an idea\nto running software.\n",
    "README.md": [
      "# count",
      "",
      "Counts the lines, words and characters of a text file.",
      "",
      "    node count.mjs notes.txt",
      "",
      ...(task >= 3 || fixed
        ? ["If the file cannot be read, it says so and why, and exits with code 1.", ""]
        : []),
    ].join("\n"),
    "premise/run.md": [
      "# How to run it",
      "",
      "A command-line tool. It needs Node.js 22 or later and nothing else.",
      "",
      runBlock([
        "kind: command",
        "command: node count.mjs <file>",
        "sample: node count.mjs sample.txt",
      ]),
      "",
      "## How to check",
      "",
      "Count a small file whose lines, words and characters you know, and compare.",
      "",
    ].join("\n"),
  };
}

export const COUNT_DEMO: DemoSoftware = {
  id: "cli",
  title: "a command-line utility",
  idea: "A small command-line tool that counts the lines, words and characters of a text file, so I can check the length of what I write without opening an editor. It should work on any plain text file I give it and say plainly when it cannot read one.",
  why: [
    {
      text: "Checking the length of a text means opening an editor today.",
      from: "operator",
    },
    { text: "Word limits come up often when writing.", from: "assumed" },
    { text: "Size: small. One command and short stages.", from: "assumed", kind: "size" },
  ],
  who: [
    { kind: "U", text: "You, at your own terminal.", from: "assumed" },
    {
      kind: "U",
      text: "A team of writers sharing it on a server.",
      from: "assumed",
    },
    { kind: "R", text: "Operator: you. Decides what it is for.", from: "assumed" },
  ],
  what: [
    {
      priority: "must",
      text: "It prints the number of lines and characters in a text file it is given.",
      from: "operator",
    },
    {
      priority: "must",
      text: "It prints the number of words in that file; words are separated by any spaces or line breaks.",
      from: "operator",
    },
    {
      priority: "should",
      text: "It says plainly what went wrong when the file cannot be read.",
      from: "operator",
    },
    {
      priority: "could",
      text: "Suggestion: it also counts what is piped into it, when no file is named. Not checked whether anyone needs it.",
      from: "assumed",
    },
  ],
  strike: {
    match: /team of writers/,
    reason: "It is only for me, on my own machine.",
  },
  decisions: [
    {
      kind: "D",
      foundation: true,
      text: "A single Node.js script with no dependencies. Reason: nothing to install beyond Node.js. Rejected: a compiled binary, more to build for one user.",
    },
    {
      kind: "D",
      text: "It reads the whole file at once. Reason: the files are short texts. Rejected: streaming, needed only for very large files.",
    },
  ],
  milestones: ["A command that counts a file's lines, words and characters."],
  tasks: [
    {
      title: "The smallest version that runs: count lines and characters, with run.md",
      serves: [/lines and characters/],
      check: "Running it on a file prints its lines and characters.",
    },
    {
      title: "Count words",
      serves: [/number of words/],
      check: "It prints the right number of words, whatever spaces separate them.",
    },
    {
      title: "Say plainly when the file cannot be read",
      serves: [/cannot be read/],
      check: "Giving it a file that is not there prints a plain message.",
    },
  ],
  kind: "a command-line tool",
  howToRun:
    "Run `node count.mjs <file>`; it prints lines, words and characters. run.md runs it once on sample.txt. To check it, count a small file whose counts you know.",
  build: (task) => countFiles(task),
  fixed: () => countFiles(3, true),
  scenarios: [
    {
      match: /lines and characters/,
      scenario: {
        name: "Count the lines and characters of a known file",
        steps: [`run: printf '${COUNT_TEXT}' > known.txt && node count.mjs known.txt`],
        expected: "lines: 3",
      },
    },
    {
      match: /lines and characters/,
      scenario: {
        name: "Characters of a known file",
        steps: [`run: printf '${COUNT_TEXT}' > known.txt && node count.mjs known.txt`],
        expected: "characters: 21",
      },
    },
    {
      match: /number of words/,
      scenario: {
        name: "Words separated by several spaces and an empty line",
        steps: [`run: printf '${COUNT_TEXT}' > known.txt && node count.mjs known.txt`],
        expected: "words: 4",
      },
    },
    {
      match: /cannot be read/,
      scenario: {
        name: "A file that is not there",
        steps: ["run: node count.mjs no-such-file.txt"],
        expected: "cannot read no-such-file.txt",
      },
    },
  ],
  planted: /number of words/,
  waitAfterMilestone: false,
};

// ---- A small web app: a reading list -------------------------------------------------------------

function readingListServer(fixed: boolean): string {
  return [
    'import { createServer } from "node:http";',
    "",
    'const portFlag = process.argv.indexOf("--port");',
    "const port = Number(portFlag > 0 ? process.argv[portFlag + 1] : process.env.PORT ?? 4700);",
    "const books = [];",
    "",
    "const escape = (text) =>",
    '  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;" })[c]);',
    "",
    "function page() {",
    "  const list = books.length",
    '    ? `<ul>${books.map((b) => `<li>${escape(b)}</li>`).join("")}</ul>`',
    '    : "<p>Nothing on the list yet. Add the first title above.</p>";',
    '  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Reading list</title>',
    "<h1>Reading list</h1>",
    '<form method="post" action="/add"><label>Title <input name="title" required></label> <button>Add</button></form>',
    "${list}</html>`;",
    "}",
    "",
    "createServer((req, res) => {",
    '  if (req.method === "POST" && req.url === "/add") {',
    '    let body = "";',
    '    req.on("data", (chunk) => (body += chunk));',
    '    req.on("end", () => {',
    '      const title = new URLSearchParams(body).get("title")?.trim();',
    fixed
      ? "      if (title) books.push(title);"
      : // Planted defect: the title is checked, then dropped instead of kept.
        "      if (title) [...books].push(title);",
    '      res.writeHead(303, { location: "/" }).end();',
    "    });",
    "    return;",
    "  }",
    '  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page());',
    '}).listen(port, "127.0.0.1", () => console.log(`Reading list on http://127.0.0.1:${port}/`));',
    "",
  ].join("\n");
}

function readingListFiles(fixed = false): Record<string, string> {
  return {
    "server.mjs": readingListServer(fixed),
    "README.md": [
      "# Reading list",
      "",
      "A page where you keep the books you want to read. Type a title and press Add.",
      "",
      "    node server.mjs --port 4700",
      "",
      "Then open http://127.0.0.1:4700/. The list lasts while the server runs.",
      "",
    ].join("\n"),
    "premise/run.md": [
      "# How to run it",
      "",
      "A small web app. It needs Node.js 22 or later and nothing else.",
      "",
      runBlock(["kind: web", "start: node server.mjs --port {port}", "open: /"]),
      "",
      "## How to check",
      "",
      "Open the page, add a title, and see it on the list.",
      "",
    ].join("\n"),
  };
}

export const READING_LIST_DEMO: DemoSoftware = {
  id: "web",
  title: "a small web app",
  idea: "A small web page where I keep the books I want to read. I type a title, add it, and see the whole list on the same page, so I stop losing book recommendations in chat messages.",
  why: [
    { text: "Book recommendations get lost in chat messages.", from: "operator" },
    { text: "A list kept in one place is looked at more often.", from: "assumed" },
    { text: "Size: small. One page and short stages.", from: "assumed", kind: "size" },
  ],
  who: [
    { kind: "U", text: "You, in your browser on this machine.", from: "assumed" },
    { kind: "R", text: "Operator: you. Decides what it is for.", from: "assumed" },
  ],
  what: [
    {
      priority: "must",
      text: "The page shows the reading list, with a box to add a title.",
      from: "operator",
    },
    {
      priority: "must",
      text: "A title added through the box appears on the list.",
      from: "operator",
    },
    {
      priority: "must",
      text: "It shares the list with friends.",
      from: "assumed",
    },
  ],
  strike: {
    match: /shares the list/,
    reason: "Nobody else sees it; it is my own list.",
  },
  decisions: [
    {
      kind: "D",
      foundation: true,
      text: "A Node.js web server with no dependencies, listening on this machine only. Reason: one user, nothing to host; the security defaults keep it local. Rejected: a hosted service.",
    },
    {
      kind: "D",
      text: "The list is kept in memory while the server runs. Reason: the smallest version that runs. Rejected: a database, before anyone asked to keep the list across restarts.",
    },
  ],
  milestones: ["The page with the reading list, where titles can be added."],
  tasks: [
    {
      title: "The smallest version that runs: the page and its list, with run.md",
      serves: [/shows the reading list/],
      check: "Opening the page shows the list and the box to add a title.",
    },
    {
      title: "Adding a title",
      serves: [/appears on the list/],
      check: "A title added through the box is on the list afterwards.",
    },
  ],
  kind: "a small web app",
  howToRun:
    "Start it with `node server.mjs --port <port>` and open the page. To check it, add a title through the box and see it on the list.",
  build: () => readingListFiles(),
  fixed: () => readingListFiles(true),
  scenarios: [
    {
      match: /shows the reading list/,
      scenario: {
        name: "Open the page",
        steps: ["open: /"],
        expected: "Reading list",
      },
    },
    {
      match: /appears on the list/,
      scenario: {
        name: "Add a title and see it on the list",
        steps: ["post: /add title=Dune", "open: /"],
        expected: "<li>Dune</li>",
      },
    },
  ],
  planted: /appears on the list/,
  waitAfterMilestone: true,
};

export const DEMOS: Record<"cli" | "web", DemoSoftware> = {
  cli: COUNT_DEMO,
  web: READING_LIST_DEMO,
};
