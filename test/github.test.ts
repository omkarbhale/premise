import { existsSync, readFileSync, readdirSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/doctor/doctor.js";
import { Git } from "../src/git/git.js";
import { GitHubCli } from "../src/git/github.js";
import { GitHubRepositoryHost, validRepositoryName } from "../src/git/repository-host.js";
import { isElsewhere } from "../src/line/line-engine.js";
import type { AskView, ChatMessage } from "../src/shared/api-types.js";
import { scopeAnswer, tempFolder, testApp } from "./helpers.js";

/**
 * The real GitHub step (decision 0260), against a fake GitHub CLI on the PATH
 * (test/fixtures/fake-gh): it records every call and plays back success, a name already taken, not
 * logged in, and a refused push. Nothing here reaches GitHub or the network.
 */

const FAKE = resolve(import.meta.dirname, "fixtures", "fake-gh");

function fakeGitHub(settings: Record<string, string> = {}) {
  const dir = tempFolder();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${FAKE}${delimiter}${process.env.PATH ?? ""}`,
    FAKE_GH_DIR: dir,
    ...settings,
  };
  const cli = new GitHubCli({ env, timeoutMs: 20_000 });
  const calls = (): string[][] => {
    const file = join(dir, "calls.jsonl");
    if (!existsSync(file)) return [];
    return readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as string[]);
  };
  const created = () =>
    existsSync(join(dir, "remotes")) ? readdirSync(join(dir, "remotes")).sort() : [];
  return { dir, env, cli, calls, created };
}

type App = Awaited<ReturnType<typeof testApp>>;

async function open(app: App, softwareId: string): Promise<AskView[]> {
  const { body } = await app.call("GET", `/api/asks?software=${softwareId}&status=open`);
  return body as AskView[];
}

async function lineAsk(app: App, softwareId: string): Promise<AskView> {
  const asks = (await open(app, softwareId)).filter((a) => a.kind !== "approval");
  expect(asks, JSON.stringify(asks.map((a) => a.title))).toHaveLength(1);
  return asks[0]!;
}

async function answer(app: App, ask: AskView, body: unknown) {
  const res = await app.call("POST", `/api/asks/${ask.id}/answer`, { answer: body });
  await app.settle();
  return res;
}

async function keepAll(app: App, ask: AskView) {
  const res = await answer(app, ask, {
    kind: "items",
    items: ask.items.map((i) => ({ key: i.key, decision: "keep" })),
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

async function chat(app: App, softwareId: string): Promise<string[]> {
  const { body } = await app.call("GET", `/api/softwares/${softwareId}/chat`);
  return (body as ChatMessage[]).map((m) => m.text);
}

async function approvals(app: App, id: string): Promise<AskView[]> {
  return (await open(app, id)).filter((a) => a.kind === "approval");
}

/** A new software through to the end of Plan, where premise asks to create its repository. */
async function toGate(github: ReturnType<typeof fakeGitHub>, realAgents = true) {
  const app = await testApp(
    { PREMISE_LINE__WAIT_AFTER_ASKED: "false" },
    { realAgents, github: github.cli },
  );
  const { body } = await app.call("POST", "/api/softwares", {
    idea: "A small page where I keep my reading list",
  });
  const id = body.id as string;
  await app.settle();
  await keepAll(app, await lineAsk(app, id)); // why
  await keepAll(app, await lineAsk(app, id)); // who
  await answer(app, await lineAsk(app, id), { kind: "text", text: "Build it" });
  await keepAll(app, await lineAsk(app, id)); // what
  const scope = await lineAsk(app, id);
  await answer(app, scope, scopeAnswer(scope));
  await keepAll(app, await lineAsk(app, id)); // say-back
  await keepAll(app, await lineAsk(app, id)); // milestones
  const asked = await approvals(app, id);
  expect(asked).toHaveLength(1);
  const name = /named (\S+) on your GitHub account/.exec(asked[0]!.approval!.action)![1]!;
  return { app, id, approval: asked[0]!, name };
}

const approve = (app: App, ask: AskView) =>
  answer(app, ask, { kind: "approval", decision: "approve-once" });

/** The open question premise asks after creating the repository did not work. */
async function retryAsk(app: App, id: string): Promise<AskView> {
  const asks = (await open(app, id)).filter(
    (a) => a.kind === "question" && a.choices?.includes("Keep it on this machine"),
  );
  expect(asks).toHaveLength(1);
  return asks[0]!;
}

const git = new Git({ name: "test", email: "test@localhost" }, "main");

describe("the GitHub CLI and host, against the fake", () => {
  it("creates a private repository on the logged-in account and gives its address", async () => {
    const github = fakeGitHub();
    const created = await new GitHubRepositoryHost(github.cli).createRepository({
      softwareId: "s",
      name: "reading-list",
      visibility: "private",
    });
    expect(created.fullName).toBe("operator/reading-list");
    expect(created.url).toBe(join(github.dir, "remotes", "reading-list.git"));
    const create = github.calls().find((c) => c[0] === "repo" && c[1] === "create")!;
    expect(create.slice(0, 4)).toEqual(["repo", "create", "reading-list", "--private"]);
  });

  it("creates nothing when the name is taken, and suggests a free one", async () => {
    const github = fakeGitHub({ FAKE_GH_TAKEN: "reading-list,reading-list-2" });
    const error = await new GitHubRepositoryHost(github.cli)
      .createRepository({ softwareId: "s", name: "reading-list", visibility: "private" })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: "NAME_TAKEN",
      taken: { fullName: "operator/reading-list", suggestion: "reading-list-3" },
    });
    expect(github.calls().some((c) => c[1] === "create")).toBe(false);
    expect(github.created()).toEqual([]);
  });

  it("says plainly when the GitHub CLI is not logged in, or not installed, and how to fix it", async () => {
    const loggedOut = await fakeGitHub({ FAKE_GH_LOGGED_OUT: "1" }).cli.login();
    expect(loggedOut).toMatchObject({ ready: false, fix: expect.stringMatching(/gh auth login/) });
    const missing = await new GitHubCli({ command: join(tempFolder(), "no-such-gh") }).login();
    expect(missing).toMatchObject({
      ready: false,
      problem: expect.stringMatching(/not installed/),
      fix: expect.stringMatching(/cli\.github\.com/),
    });
  });

  it("takes only names GitHub takes for a repository", () => {
    expect(validRepositoryName("reading-list.v2")).toBe("reading-list.v2");
    expect(validRepositoryName("  my_list.git ")).toBe("my_list");
    expect(validRepositoryName("my list")).toBeNull();
    expect(validRepositoryName("-flag")).toBeNull();
    expect(validRepositoryName("..")).toBeNull();
  });

  it("tells a repository on this machine from one elsewhere", () => {
    expect(isElsewhere({ sourceKind: "folder", source: "/home/me/notes" })).toBe(false);
    expect(isElsewhere({ sourceKind: "address", source: "file:///srv/notes.git" })).toBe(false);
    expect(isElsewhere({ sourceKind: "address", source: "/srv/notes.git" })).toBe(false);
    expect(isElsewhere({ sourceKind: "address", source: "https://github.com/me/notes.git" })).toBe(
      true,
    );
    expect(isElsewhere({ sourceKind: "address", source: "git@github.com:me/notes.git" })).toBe(
      true,
    );
  });
});

describe("the real GitHub step on the line", () => {
  it("with real agents, the card says this is real and exactly what; approved, it creates the private repository and pushes", async () => {
    const github = fakeGitHub();
    const { app, id, approval } = await toGate(github);
    expect(approval.approval!.real).toBe(true);
    expect(approval.approval!.reality).toMatch(
      /^Approving creates the private repository operator\/.+ on your GitHub account, with the GitHub CLI you are logged in with, and pushes/,
    );
    expect(approval.approval!.action).toMatch(/\(operator\/[a-z0-9-]+\)/);
    // Asking created nothing.
    expect(github.created()).toEqual([]);

    await approve(app, approval);
    const request = app.session.gate.list(id)[0]!;
    expect(request.status).toBe("done");
    const said = await chat(app, id);
    expect(said.at(-1)).toMatch(
      /^Approved and done: Created the private repository .+ on your GitHub account and pushed .+'s code and record to it\. premise pushes again each time a change lands\./,
    );
    // The repository holds what premise has, and is the software's remote from now on.
    const [made] = github.created();
    const remote = join(github.dir, "remotes", made!);
    const repo = app.record.repositoryPath(id);
    expect(git.run(remote, ["rev-parse", "main"]).trim()).toBe(
      git.run(repo, ["rev-parse", "main"]).trim(),
    );
    expect(git.remoteUrl(repo, "origin")).toBe(remote);
  });

  it("creates nothing when the name is taken, offers another name, and asks again before using it", async () => {
    const github = fakeGitHub();
    const { app, id, approval, name } = await toGate(github);
    github.env.FAKE_GH_TAKEN = name;
    await approve(app, approval);
    expect(app.session.gate.list(id)[0]!.status).toBe("failed");
    const said = await chat(app, id);
    expect(said.at(-1)).toContain(
      `Approved, but it did not all work: A repository named ${name} already exists on your GitHub account (operator/${name}). premise created nothing and changed nothing there.`,
    );
    expect(github.calls().some((c) => c[1] === "create")).toBe(false);
    expect(github.created()).toEqual([]);

    const retry = await retryAsk(app, id);
    expect(retry.title).toBe(`${name} is taken on your GitHub account: use another name?`);
    expect(retry.choices).toEqual([`Use the name ${name}-2`, "Keep it on this machine"]);
    // A name GitHub would not take is refused, and nothing moves.
    const bad = await answer(app, retry, { kind: "text", text: "my reading list" });
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatch(/does not take "my reading list"/);

    await answer(app, retry, { kind: "text", text: `Use the name ${name}-2` });
    const again = await approvals(app, id);
    expect(again).toHaveLength(1);
    expect(again[0]!.approval!.action).toContain(`named ${name}-2 `);
    expect(github.created()).toEqual([]);
    await approve(app, again[0]!);
    expect(github.created()).toEqual([`${name}-2.git`]);
    expect(app.session.gate.list(id).at(-1)!.status).toBe("done");
  });

  it("keeps the software on this machine when the person says so", async () => {
    const github = fakeGitHub();
    const { app, id, approval, name } = await toGate(github);
    github.env.FAKE_GH_TAKEN = name;
    await approve(app, approval);
    await answer(app, await retryAsk(app, id), { kind: "text", text: "Keep it on this machine" });
    expect((await chat(app, id)).at(-1)).toMatch(/stays on this machine; nothing was created/);
    expect(await approvals(app, id)).toEqual([]);
    expect(github.created()).toEqual([]);
  });

  it("says before the answer when the GitHub CLI is not logged in; approved anyway, nothing is created and premise offers to try again", async () => {
    const github = fakeGitHub({ FAKE_GH_LOGGED_OUT: "1" });
    const { app, id, approval } = await toGate(github);
    expect(approval.approval!.reality).toMatch(
      /premise cannot reach GitHub right now\. The GitHub CLI is installed but not logged in.*`gh auth login`/,
    );
    await approve(app, approval);
    expect(app.session.gate.list(id)[0]!.status).toBe("failed");
    expect((await chat(app, id)).at(-1)).toMatch(/Nothing was created: .*gh auth login/);
    expect(github.created()).toEqual([]);

    // Logged in now: trying again asks again, and then creates it.
    delete github.env.FAKE_GH_LOGGED_OUT;
    const retry = await retryAsk(app, id);
    expect(retry.choices).toEqual(["Try again", "Keep it on this machine"]);
    await answer(app, retry, { kind: "text", text: "Try again" });
    const again = await approvals(app, id);
    expect(again[0]!.approval!.reality).toMatch(/^Approving creates the private repository/);
    await approve(app, again[0]!);
    expect(github.created()).toHaveLength(1);
  });

  it("reports a refused push truthfully: created, nothing forced, and what to do", async () => {
    const github = fakeGitHub({ FAKE_GH_REFUSE_PUSH: "1" });
    const { app, id, approval } = await toGate(github);
    await approve(app, approval);
    const request = app.session.gate.list(id)[0]!;
    expect(request.status).toBe("failed");
    expect(request.outcome).toMatch(
      /^Created the private repository .+ on your GitHub account, but the push was refused: .+\. Nothing was forced, and nothing on GitHub was overwritten\. premise pushes again after the next change lands/,
    );
    // GitHub's own commit is still there: nothing was forced.
    const [made] = github.created();
    const log = git.run(join(github.dir, "remotes", made!), ["log", "--format=%s", "main"]);
    expect(log.trim()).toBe("Initial commit");
  });

  it("with scripted agents nothing reaches GitHub, whatever the answer", async () => {
    const github = fakeGitHub();
    const { app, id, approval } = await toGate(github, false);
    expect(approval.approval!.real).toBe(false);
    await approve(app, approval);
    expect(app.session.gate.list(id)[0]!.status).toBe("unavailable");
    expect(github.calls()).toEqual([]);
  });

  it("never acts on a card that said nothing would happen, even if agents are real by the time it is approved", async () => {
    const github = fakeGitHub();
    const { app, id, approval } = await toGate(github, false);
    // premise was restarted with real agents before the person answered the old card.
    const line = app.session.line as unknown as { options: { realAgents: () => boolean } };
    line.options.realAgents = () => true;
    await approve(app, approval);
    const request = app.session.gate.list(id)[0]!;
    expect(request.status).toBe("unavailable");
    expect(request.outcome).toMatch(/you were asked while premise ran with scripted agents/);
    expect(github.calls().some((c) => c[1] === "create")).toBe(false);
  });

  it("marks an approval cut off by a restart as failed, never repeats it, and asks what to do", async () => {
    const github = fakeGitHub();
    const { app, id, approval } = await toGate(github);
    // premise stops right after the approval, before carrying it out.
    const request = app.session.gate.forAsk(approval.id)!;
    app.db
      .prepare("UPDATE gate_requests SET status = 'approved', decided = ? WHERE id = ?")
      .run(new Date().toISOString(), request.id);
    app.db
      .prepare(
        "UPDATE asks SET status = 'answered', answer_summary = 'Approved once.' WHERE id = ?",
      )
      .run(approval.id);
    // Start-up.
    app.session.gate.recoverInterrupted();
    await app.settle();
    expect(app.session.gate.get(request.id)).toMatchObject({ status: "failed" });
    expect(github.calls().some((c) => c[1] === "create")).toBe(false);
    const retry = await retryAsk(app, id);
    expect(retry.title).toMatch(/^Copying .+ to GitHub was cut off: try again\?$/);
    expect(retry.instruction).toMatch(/Look on your GitHub account for a repository named/);
    expect((await chat(app, id)).at(-1)).toMatch(/premise does not try again by itself/);
    // Only one question about it, not the gate's general one as well.
    expect(
      (await open(app, id)).filter((a) => a.title === "An approved action was cut off"),
    ).toEqual([]);
  });
}, 60_000);

describe("the setup check and GitHub", () => {
  it("reports a GitHub CLI that is not logged in, with how to fix it", async () => {
    const report = await runDoctor({
      dataFolder: tempFolder(),
      env: { PREMISE_AGENTS__MODE: "scripted" },
      run: async (command, args) =>
        command === "gh" && args[0] === "auth"
          ? {
              ok: false,
              output: "You are not logged into any GitHub hosts. To log in, run: gh auth login",
            }
          : { ok: true, output: "1.0" },
    });
    const gh = report.checks.find((c) => c.name === "GitHub CLI")!;
    expect(gh.status).toBe("warn");
    expect(gh.detail).toMatch(/not logged in/);
    expect(gh.fix).toMatch(/gh auth login/);
    expect(report.canStart).toBe(true);
  });
});
