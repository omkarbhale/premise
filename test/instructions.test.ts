import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assembleInstructions,
  catalogOrder,
  skillsOf,
  systemPromptOf,
} from "../src/agents/instructions.js";
import { AGENT_ROLES, PREMISE_TOOLS_BY_ROLE } from "../src/agents/roles.js";

const docs = join(import.meta.dirname, "..", "docs");

describe("agent instructions", () => {
  it("assembles every role's prompt and skills from premise's own documents", () => {
    for (const role of AGENT_ROLES) {
      const text = assembleInstructions(docs, role);
      expect(text.length).toBeGreaterThan(500);
      expect(text).toContain("# Skill: the-floor");
      expect(text).not.toContain("````");
    }
  });

  it("appends the skills in the catalog's order", () => {
    const text = assembleInstructions(docs, "builder");
    const at = (name: string) => text.indexOf(`# Skill: ${name}\n`);
    expect(at("writing-for-people")).toBeGreaterThan(0);
    expect(at("writing-for-people")).toBeLessThan(at("the-record"));
    expect(at("the-record")).toBeLessThan(at("return-on-effort"));
    expect(text).not.toContain("# Skill: unknown");
  });

  it("ends with an example call of each premise tool the role has", () => {
    const text = assembleInstructions(docs, "builder");
    const section = text.slice(text.indexOf("# How to call premise's tools"));
    expect(text.indexOf("# How to call premise's tools")).toBeGreaterThan(
      text.indexOf("# Skill: the-floor"),
    );
    const lines = section.split("\n").filter((l) => l.startsWith("Example call: "));
    expect(lines.map((l) => l.split(" ")[2])).toEqual([...PREMISE_TOOLS_BY_ROLE.builder]);
    // The builder may only add decisions, so its record_propose example adds one.
    expect(section).toContain('Example call: record_propose {"operations":[{"op":"add","kind":"D"');
  });

  it("reads the parts of a prompt file", () => {
    const md = [
      "| Skills | [a](../skills/a.md), [b](../skills/b.md) |",
      "## Full text: system prompt",
      "",
      "````text",
      "You are the tester.",
      "```inner```",
      "````",
    ].join("\n");
    expect(systemPromptOf(md)).toBe("You are the tester.\n```inner```");
    expect(skillsOf(md)).toEqual(["a", "b"]);
    expect(catalogOrder("## Catalog\n| [b](b.md) | x |\n| [a](a.md) | y |")).toEqual(["b", "a"]);
    expect(() => systemPromptOf("nothing")).toThrow("no");
  });
});
