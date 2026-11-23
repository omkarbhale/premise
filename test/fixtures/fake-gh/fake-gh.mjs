// A stand-in for the GitHub CLI, for tests only: it never touches the network or GitHub. It records
// every call in $FAKE_GH_DIR/calls.jsonl and plays back what the test asks for:
//   FAKE_GH_LOGGED_OUT=1       not logged in
//   FAKE_GH_TAKEN=a,b          these repository names already exist on the account
//   FAKE_GH_REFUSE_PUSH=1      the repository it creates refuses the first push (it has a commit of its own)
// A repository it creates is a bare git repository in $FAKE_GH_DIR/remotes, and its "url" is that path.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const dir = process.env.FAKE_GH_DIR;
if (!dir) {
  process.stderr.write("fake gh: FAKE_GH_DIR is not set\n");
  process.exit(2);
}
mkdirSync(join(dir, "remotes"), { recursive: true });
appendFileSync(join(dir, "calls.jsonl"), JSON.stringify(args) + "\n");

const login = "operator";
const taken = (process.env.FAKE_GH_TAKEN || "").split(",").filter(Boolean);
const remote = (name) => join(dir, "remotes", `${name}.git`);
const exists = (name) => taken.includes(name) || existsSync(remote(name));
const fail = (text, code = 1) => {
  process.stderr.write(text + "\n");
  process.exit(code);
};
const git = (cwd, gitArgs) =>
  execFileSync("git", gitArgs, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
  });

if (args[0] === "--version") {
  process.stdout.write("gh version 0.0.0 (fake, for tests)\n");
  process.exit(0);
}
if (process.env.FAKE_GH_LOGGED_OUT === "1" && args[0] !== "--version") {
  fail("To get started with GitHub CLI, please run:  gh auth login", 4);
}
if (args[0] === "auth" && args[1] === "status") {
  process.stdout.write(`Logged in to github.com account ${login}\n`);
  process.exit(0);
}
if (args[0] === "api" && args[1] === "user") {
  process.stdout.write(login + "\n");
  process.exit(0);
}
if (args[0] === "repo" && args[1] === "view") {
  const name = String(args[2] || "")
    .split("/")
    .pop();
  if (!exists(name)) {
    fail(`GraphQL: Could not resolve to a Repository with the name '${args[2]}'. (repository)`);
  }
  const url = existsSync(remote(name)) ? remote(name) : `https://github.com/${login}/${name}`;
  process.stdout.write(args.includes("--jq") ? url + "\n" : JSON.stringify({ name, url }) + "\n");
  process.exit(0);
}
if (args[0] === "repo" && args[1] === "create") {
  const name = args[2];
  if (exists(name)) fail("GraphQL: Name already exists on this account (createRepository)");
  const path = remote(name);
  mkdirSync(path, { recursive: true });
  git(path, ["init", "--quiet", "--bare", "--initial-branch", "main"]);
  if (process.env.FAKE_GH_REFUSE_PUSH === "1") {
    // A README made on GitHub with the repository: the first push is not a fast-forward.
    const work = mkdtempSync(join(dir, "readme-"));
    git(work, ["init", "--quiet", "--initial-branch", "main"]);
    writeFileSync(join(work, "README.md"), "Made on GitHub\n");
    git(work, ["add", "README.md"]);
    git(work, [
      "-c",
      "user.name=GitHub",
      "-c",
      "user.email=noreply@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "Initial commit",
    ]);
    git(work, ["push", "--quiet", path, "main"]);
  }
  process.stdout.write(`https://github.com/${login}/${name}\n`);
  process.exit(0);
}
fail(`fake gh: no stand-in for: gh ${args.join(" ")}`, 3);
