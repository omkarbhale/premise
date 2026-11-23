import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PageReader, pageText, privateAddress } from "../src/agents/page-reader.js";
import { checkProgram, hostName } from "../src/agents/tool-check.js";
import {
  answerOutcome,
  existsChoices,
  isOverrule,
  outcomeFromWords,
  overruleLine,
} from "../src/line/exists-outcomes.js";
import { nativeDependencyProblems } from "../src/line/plan-checks.js";
import { isHedged, keepsHedge, unsureSentences } from "../src/shared/hedges.js";
import { tempFolder } from "./helpers.js";

/**
 * The small parts behind the judgement fixes from the first real runs (decision 0300): the choices
 * at What exists, overrules, hedges, native dependencies, checking a program agents need, and
 * reading a page in parts.
 */

describe("the choices at What exists say what they mean", () => {
  it("shows only the choices that apply when something already does the job", () => {
    const look = existsChoices({
      recommended: "not-build",
      alternative: "ccusage",
      base: "ccusage",
    });
    expect(look.choices).toEqual([
      "Do not build: use ccusage",
      "Build it on top of ccusage",
      "Build it anyway",
    ]);
    expect(look.recommended).toBe("Do not build: use ccusage");
    expect(look.notes["Do not build: use ccusage"]).toMatch(/builds nothing.*how to use ccusage/);
    expect(look.notes["Build it on top of ccusage"]).toMatch(/builds only what that lacks/);
    expect(look.notes["Build it anyway"]).toMatch(/from scratch although ccusage/);
    expect(look.choices).not.toContain("Build something different");
  });

  it("names the gap when nothing out there does it, offers no 'anyway', and can always stop", () => {
    const look = existsChoices({ recommended: "build", gap: "nothing reminds anyone to read" });
    expect(look.choices).toEqual([
      "Build it: nothing out there does this (nothing reminds anyone to read)",
      "Do not build it",
    ]);
    expect(look.notes[look.recommended]).toMatch(/builds it from scratch/);
    // Without a gap the researcher checked, premise never claims nothing out there does it.
    expect(existsChoices({ recommended: "build" }).choices).toEqual([
      "Build it",
      "Do not build it",
    ]);
  });

  it("puts premise's recommendation first", () => {
    const look = existsChoices({
      recommended: "build-on",
      alternative: "a hosted list",
      base: "a library",
    });
    expect(look.choices[0]).toBe("Build it on top of a library");
    expect(look.choices).toContain("Do not build: use a hosted list");
  });

  it("reads the researcher's outcome in its own words", () => {
    expect(outcomeFromWords("Do not build")).toBe("not-build");
    expect(outcomeFromWords("Build on something that exists")).toBe("build-on");
    expect(outcomeFromWords("Build it on top of ccusage")).toBe("build-on");
    expect(outcomeFromWords("Build it anyway")).toBe("anyway");
    expect(outcomeFromWords("Build something different")).toBe("build");
    expect(outcomeFromWords("Build it")).toBe("build");
  });

  it("counts an answer as an overrule only when it does different work", () => {
    expect(isOverrule("Build it: nothing out there does this (a gap)", "Build it")).toBe(false);
    expect(isOverrule("Do not build: use ccusage", "Build it anyway")).toBe(true);
    expect(isOverrule("Do not build: use ccusage", "Build it on top of ccusage")).toBe(true);
    expect(isOverrule("Do not build: use ccusage", "Do not build: use ccusage")).toBe(false);
    expect(isOverrule("Build it", "I want my own, on my machine")).toBe(true);
    expect(isOverrule(undefined, "Build it")).toBe(false);
    expect(answerOutcome("Build it anyway")).toBe("anyway");
    expect(answerOutcome("something of my own")).toBe("own");
  });

  it("keeps an overrule as a record line without the marks' parentheses", () => {
    const line = overruleLine(
      "Do not build: use ccusage",
      "Build it anyway",
      "it has no weekly share per session (and no budgets)",
    );
    expect(line).toMatch(/^Overruled: it has no weekly share per session and no budgets\./);
    expect(line).not.toMatch(/[()]/);
    expect(line).toContain('premise recommended "Do not build: use ccusage"');
  });
});

describe("hedges", () => {
  it("knows hedged words and a line that keeps the hedge", () => {
    expect(isHedged("per project, or perhaps per session")).toBe(true);
    expect(isHedged("I don't know if it should care about that")).toBe(true);
    expect(isHedged("where I keep my reading list")).toBe(false);
    expect(keepsHedge("Show the share per project; the operator is not sure about sessions")).toBe(
      true,
    );
    expect(keepsHedge("Session views are out of scope")).toBe(false);
    expect(
      unsureSentences("I sum per project. Perhaps per session too. It runs at night."),
    ).toEqual(["Perhaps per session too."]);
  });
});

describe("native dependencies", () => {
  const natives = ["better-sqlite3", "sqlite3", "bcrypt"];
  it("asks how a native package installs without a compiler", () => {
    const problems = nativeDependencyProblems(
      [
        {
          text: "Store usage in SQLite through better-sqlite3. Reason: fast. Rejected: JSON files.",
        },
        { text: "Use better-sqlite3 with its prebuilt binaries for this platform." },
        {
          text: "Use node:sqlite. Reason: built in. Rejected: better-sqlite3, it needs a compiler.",
        },
        { text: "Hash with a native addon for speed." },
      ],
      natives,
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^Decision 1 uses better-sqlite3/);
    expect(problems[0]).toContain("node:sqlite");
    expect(problems[1]).toMatch(/^Decision 4 uses a native module/);
  });
});

describe("checking a program the agents need", () => {
  const options = (path: string, data: string, home: string) => ({
    path,
    dataFolder: data,
    home,
    claudeConfigFolder: null,
    extraDeniedPaths: [],
  });

  it("finds a runnable program on the PATH agents get", () => {
    const bin = tempFolder();
    writeFileSync(join(bin, "godot"), "#!/bin/sh\necho 4.3\n");
    chmodSync(join(bin, "godot"), 0o755);
    const found = checkProgram("godot", options(bin, tempFolder(), tempFolder()));
    expect(found).toEqual({ found: true, path: join(bin, "godot") });
  });

  it("says plainly when it is not on the PATH", () => {
    const missing = checkProgram("godot", options(tempFolder(), tempFolder(), tempFolder()));
    expect(missing.found).toBe(false);
    expect(!missing.found && missing.problem).toMatch(
      /did not find it\. Install it so that typing godot/,
    );
  });

  it("says plainly when it sits in a folder the agents' sandbox denies", () => {
    const home = tempFolder();
    const hidden = join(home, ".ssh");
    mkdirSync(hidden);
    writeFileSync(join(hidden, "godot"), "#!/bin/sh\n");
    chmodSync(join(hidden, "godot"), 0o755);
    const denied = checkProgram("godot", options(hidden, tempFolder(), home));
    expect(!denied.found && denied.problem).toMatch(/agents may not read that folder/);
  });

  it("takes only a plain public host name to allow", () => {
    expect(hostName("https://downloads.example.org/godot/4.3/")).toBe("downloads.example.org");
    expect(hostName("localhost")).toBeNull();
    expect(hostName("192.168.1.4")).toBeNull();
    expect(hostName("printer.local")).toBeNull();
    expect(hostName("not a host")).toBeNull();
  });
});

describe("reading a page in parts", () => {
  it("never reads this machine or a private network", () => {
    expect(privateAddress("127.0.0.1")).toBe(true);
    expect(privateAddress("10.2.3.4")).toBe(true);
    expect(privateAddress("::1")).toBe(true);
    expect(privateAddress("::ffff:192.168.0.1")).toBe(true);
    expect(privateAddress("203.0.113.7")).toBe(false);
    expect(PageReader.refusal("http://localhost:4610/api")).toMatch(/only public pages/);
    expect(PageReader.refusal("file:///etc/passwd")).toMatch(/only http and https/);
    expect(PageReader.refusal("https://example.org/docs")).toBeNull();
  });

  it("refuses a public name that resolves to a private address, and a redirect to one", async () => {
    const inside = new PageReader({
      partChars: 1000,
      resolve: async () => ["10.0.0.5"],
      fetch: async () => ({ status: 200, contentType: "text/plain", body: "secret" }),
    });
    await inside.load("https://intranet.example.org/");
    expect(inside.read("https://intranet.example.org/")).toMatchObject({ state: "failed" });

    const redirecting = new PageReader({
      partChars: 1000,
      resolve: async (host) => (host === "example.org" ? ["203.0.113.7"] : ["127.0.0.1"]),
      fetch: async () => ({
        status: 302,
        contentType: "text/html",
        location: "https://evil.example.net/",
        body: "",
      }),
    });
    await redirecting.load("https://example.org/");
    expect(redirecting.read("https://example.org/")).toMatchObject({
      state: "failed",
      problem: expect.stringMatching(/only public pages/),
    });
  });

  it("turns a long page into plain text and hands it out in parts", async () => {
    const body = `<html><head><style>p{}</style><script>alert(1)</script></head><body><h1>Status line</h1>${"<p>The status line runs only in an interactive terminal &amp; never headless.</p>".repeat(60)}</body></html>`;
    const reader = new PageReader({
      partChars: 1000,
      resolve: async () => ["203.0.113.7"],
      fetch: async () => ({ status: 200, contentType: "text/html", body }),
    });
    await reader.load("https://example.org/statusline");
    const first = reader.read("https://example.org/statusline", 1);
    expect(first).toMatchObject({ state: "ready", part: 1 });
    if (first?.state !== "ready") throw new Error("not read");
    expect(first.parts).toBeGreaterThan(3);
    expect(first.text).toContain("Status line");
    expect(first.text).toContain("& never headless");
    expect(first.text).not.toMatch(/alert|<p>/);
    const last = reader.read("https://example.org/statusline", 999);
    expect(last).toMatchObject({ state: "ready", part: first.parts });
    expect(pageText("plain words", "text/plain")).toBe("plain words");
  });
});
