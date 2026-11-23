import { FLOOR_KINDS } from "../config/settings.js";
import { INTAKE_KINDS, INTAKE_ROUTES } from "../intake/items.js";
import { ITEM_KINDS, PRIORITIES } from "../record/format.js";
import {
  type ObjectShape,
  type Shape,
  either,
  list,
  object,
  oneOf,
  text,
  whole,
  yesNo,
} from "./tool-shapes.js";

/**
 * What each premise tool takes, field by field (docs/specs/agent-tools.md 3.4). The same shape is
 * declared to agents in tools/list and checked on every call (src/agents/tool-shapes.ts), so the
 * two cannot drift. Each shape takes what the module serving the tool already read, no more and no
 * less: where a module reads a plain line in place of an object, the shape says so too.
 */

const itemId = text('A record item ID, such as "W-3".', { example: "W-1" });
const itemIds = (description: string) => list(itemId, description);
const priority = oneOf(PRIORITIES, "For a W item: must, should or could.");
const from = text(
  'Who it comes from: "assumed" for your own idea, or the role whose own words it is, such as "operator".',
  { example: "assumed" },
);
const intakeRef = either(
  [text('An intake item, such as "I-3".'), whole("An intake item's number.", 1)],
  'An intake item, such as "I-3".',
);

/** One drafted item: a line in the record's format, or an object with its words in "text". */
const draftItem = (kinds: string) =>
  either(
    [
      text("The item's words."),
      object(
        {
          text: text("The item's words, one line, without an ID or list mark."),
          kind: text(`The item's kind (${kinds}); leave out for the stage's own kind.`),
          from,
          mark: text('Another name for "from".'),
          priority,
          foundation: yesNo("For a D item: whether later work stands on it."),
          reason: text("For a D item: why it is chosen."),
          rejected: text("For a D item: what was rejected instead."),
          replaces: text(
            'For a D item in a change\'s plan: the decision it replaces, such as "D-6".',
          ),
          condition: text(
            "For a D item: the condition a must item then works only under, or what it assumes without having checked, in one line.",
          ),
          must: list(
            itemId,
            "For a D item with a condition: the must items that work only under it.",
          ),
          who: text(
            'For a D item with a condition a person must meet: the role who can meet it, such as "operator".',
          ),
          wait: yesNo("For an M item: whether the work waits for the operator after it."),
          suggestion: yesNo("Whether premise offers it as its own idea."),
          quote: text(
            'For an item "from" the operator: their exact words it rests on, three or more words.',
          ),
          refs: list(text("A record item ID or a source."), "Record items it stands for."),
          sources: either(
            [text("A source."), list(text("A source."), "Sources.")],
            "Where a finding was found.",
          ),
          source: text("For a finding: where it was found."),
          short: text("For a finding: one short line to show."),
          checked: either(
            [yesNo("Whether it was read."), text('"read", "summary" or "not-read".')],
            "For a finding: whether the source was read.",
          ),
          follows: text('The lesson it follows, such as "L-3".'),
        },
        ["text"],
      ),
    ],
    'An item: an object with its words in "text", or the words alone.',
  );

const operation = either(
  [
    object(
      {
        op: oneOf(["add"], "Add a new item."),
        kind: oneOf(ITEM_KINDS, "The new item's kind; D is a decision."),
        text: text("The item's words only: no ID, list mark or marks.", {
          example: "People can export their list as a CSV file.",
        }),
        from,
        priority,
        foundation: yesNo("For a D item: whether later work stands on it."),
        wait: yesNo("For an M item: whether the work waits for the operator after it."),
      },
      ["op", "kind", "text", "from"],
    ),
    object(
      {
        op: oneOf(["replace"], "Replace a live item with new words."),
        id: itemId,
        text: text("The new words only: no ID, list mark or marks.", {
          example: "People can add a book by its title alone.",
        }),
        from,
        reason: text("One line: why it is replaced.", { example: "The operator asked for it." }),
        priority,
        foundation: yesNo("For a D item: whether later work stands on it."),
        wait: yesNo("For an M item: whether the work waits for the operator after it."),
      },
      ["op", "id", "text", "from", "reason"],
    ),
    object(
      {
        op: oneOf(["strike"], "Strike an item through."),
        id: itemId,
        reason: text("One line: why it is struck.", { example: "The operator dropped it." }),
      },
      ["op", "id", "reason"],
    ),
    object(
      {
        op: oneOf(["mark"], "Change a mark that is not the item's meaning."),
        id: itemId,
        wait: yesNo("For an M item: whether the work waits for the operator after it."),
        confirmed: yesNo("For a say-back: whether it is confirmed."),
        leftOut: yesNo("For a W item: whether the operator left it out of what is built."),
      },
      ["op", "id"],
    ),
  ],
  'One change to the record, told apart by "op": add, replace, strike or mark.',
  "op",
);

const shortLine = object(
  {
    line: text("The short sentence."),
    text: text('Another name for "line".'),
    items: list(intakeRef, "The intake items behind it, at least one.", 1),
  },
  ["items"],
);

export const TOOL_INPUTS: Record<string, ObjectShape> = {
  record_read: object({
    items: list(
      text('An item ID such as "W-1", or a file name such as "what.md".'),
      "Item IDs or file names to read; leave out for the whole record.",
    ),
    include_struck: yesNo("Whether to include struck-through items."),
  }),
  record_propose: object(
    {
      operations: list(operation, "The changes, in order; at least one.", 1),
      reason: text("One line for the whole change: why it is made."),
    },
    ["operations", "reason"],
  ),
  draft_submit: object(
    {
      stage: text("The stage drafted: why, who, exists, what, say-back or plan.", {
        example: "what",
      }),
      items: list(
        draftItem("Y, U, R, E, W, T, D or M"),
        "The drafted items. At least one, except at plan for a change, which may add no decision: then [].",
      ),
      milestones: list(
        draftItem("M"),
        "At plan: the milestones in order, the first the smallest version that runs.",
      ),
      tasks: list(
        either(
          [
            text("The task's title."),
            object({
              title: text("A few words: what the task builds."),
              items: itemIds("The record items it serves."),
              check: text("How a checker sees it works."),
              milestone: whole("The number of the milestone it belongs to: 1 for the first.", 1),
            }),
          ],
          "A task: an object with its title, or the title alone.",
        ),
        "At plan: the working plan's tasks, in order.",
      ),
      kind: text('At plan: the kind of software, in a few words; or "say-back" for a say-back.'),
      how_to_run: text("At plan: how to build, start and check it."),
      outcome: text('At What exists: the outcome, such as "Build it".'),
      alternative: text("At What exists: what already does the job, if anything, by name."),
      builds_on: text("At What exists: what it could be built on top of, by name, if anything."),
      gap: text("At What exists: what nothing out there does, in a few words, if anything."),
      deciding_question: text(
        "At What exists: the one question whose answer decides the outcome, in one line.",
      ),
      reason: text("Why, in one or two lines."),
      open_choice: text(
        "For a change: a real choice the person's words left open, in one line, which premise asks them once before building.",
      ),
    },
    ["stage", "items"],
  ),
  recovery_submit: object(
    {
      items: list(
        either(
          [
            text('The item\'s words, led by its kind such as "W: ...".'),
            object(
              {
                kind: text("Y (why), U (a user), R (a role), W (what it does) or D (a decision)."),
                text: text("The item's words, one line."),
                priority,
                assumed: yesNo("Whether it is a guess the material does not show."),
                foundation: yesNo("For a D item: whether later work stands on it."),
                files: list(text("A path inside the repository."), "Files it is guessed to serve."),
              },
              ["text"],
            ),
          ],
          "A recovered item.",
        ),
        "The recovered record, at least one item, with at least one Y item.",
        1,
      ),
      run: object(
        {
          build: text("How to build it."),
          start: text("How to start it."),
          check: text("How to check it."),
          premise_run: text("A premise-run block, if the material gives one."),
          premiseRun: text('Another name for "premise_run".'),
        },
        [],
        "How to build, start and check it.",
      ),
      could_not_check: list(text("One line."), "What premise would need to check it."),
      summary: text("One line on what the software is."),
    },
    ["items"],
  ),
  ask: object(
    {
      role: text('The role asked, such as "operator".', { example: "operator" }),
      kind: oneOf(["question", "proposal", "needed"], "question, proposal or needed."),
      items: list(
        text("One line."),
        "The question's items, or for needed the steps; at least one.",
        1,
      ),
      what: text("For needed: one line on what is needed."),
      secret: text("For needed: the key name of a secret the act ends in, such as MAIL_API_KEY."),
      tool: text(
        'For needed: a program or tool agents lack here, by the command that runs it, such as "godot".',
      ),
      host: text(
        'For needed with "tool": the one host it downloads from, such as "downloads.example.org", when allowing agents to reach it would let them get it.',
      ),
      why: text('For needed with "tool": what it is needed for, in one line.'),
      waits_on: text("What waits on the answer."),
    },
    ["role", "kind", "items"],
  ),
  gate_request: object(
    {
      kind: oneOf(FLOOR_KINDS, "The kind of action on the floor."),
      role: text("Whose call it is, when not the operator's."),
      action: text("Exactly what will happen."),
      why: text("Why it is needed."),
      items: itemIds("Record items it serves."),
    },
    ["kind", "action", "why"],
  ),
  proposal_submit: object(
    {
      options: list(
        object(
          {
            title: text("A few words."),
            description: text("What the claiming role would see, in that role's terms."),
          },
          ["title", "description"],
        ),
        "One or two options.",
        1,
      ),
      tasks: list(whole("A plan task's number.", 1), "The plan's tasks that build this area."),
      note: text("An optional note."),
    },
    ["options"],
  ),
  progress: object({ text: text("One short line.") }, ["text"]),
  task_finish: object(
    {
      status: oneOf(["done", "stuck", "waiting-for-person"], "How the task ended."),
      note: text("What you did, or what you tried."),
      ask_id: text("For waiting-for-person: the ask's id."),
    },
    ["status"],
  ),
  scenario_write: object(
    {
      name: text("A few words."),
      items: itemIds("The record items it checks."),
      steps: list(text("One step a user takes."), "The steps, at least one.", 1),
      expected: text("What the user must see."),
    },
    ["name", "items", "steps", "expected"],
  ),
  verdict_submit: object(
    {
      verdicts: list(
        object(
          {
            item: itemId,
            verdict: oneOf(
              ["met", "not-met", "could-not-check"],
              "met, not-met or could-not-check.",
              {
                loose: true,
              },
            ),
            evidence: text("Output, a response, a log line, or the evidence file."),
            judged_on: oneOf(
              ["real", "made-up"],
              '"real" (the real data, service or environment) or "made-up" (stand-ins only).',
            ),
            try_it_on: text(
              'With "made-up" or could-not-check: what a person should try it on or do to check it.',
            ),
          },
          ["item", "verdict", "evidence", "judged_on"],
        ),
        "One verdict per item checked.",
      ),
      findings: list(
        either(
          [
            text("One finding."),
            object({ text: text("The finding."), blocking: yesNo("Whether it blocks.") }, ["text"]),
          ],
          "A finding: one line, or an object with its text.",
        ),
        "What else the check found.",
      ),
      run_notes: text("Notes on running it, for the next check."),
    },
    ["verdicts"],
  ),
  review_submit: object(
    {
      reviews: list(
        object(
          {
            decision: text("The decision reviewed, in its words."),
            change: text("The change reviewed."),
            verdict: oneOf(
              ["agree", "object", "consistent", "conflicting"],
              "agree or object for a decision; consistent or conflicting for a change.",
            ),
            reasons: text("Why, in a line or two."),
          },
          ["verdict"],
        ),
        "One review per decision or change.",
      ),
    },
    ["reviews"],
  ),
  triage_submit: object(
    {
      kind: oneOf(INTAKE_KINDS, "What the item is.", { loose: true }),
      touches: list(
        either(
          [
            itemId,
            object(
              {
                id: itemId,
                reason: text("Why the item touches it.", {
                  example: "It changes how a book is added.",
                }),
              },
              ["id", "reason"],
            ),
          ],
          'A record item touched: { "id": "W-3", "reason": "..." }.',
        ),
        "The record items it touches, each with its reason; an empty list when none.",
      ),
      size: oneOf(["small", "medium", "large"], "Rough size.", { loose: true }),
      touches_floor: yesNo("Whether it touches data, security, money or acting in someone's name."),
      changes_what: yesNo("Whether building it changes what the software must do."),
      route: oneOf(INTAKE_ROUTES, "Where it goes.", { loose: true }),
      reason: text("One line: why it goes where it goes."),
      joins: either(
        [text('An intake item, such as "I-3".'), whole("An intake item's number.", 1)],
        'For a duplicate: the item it repeats, such as "I-3".',
      ),
      answer: text("For a question: the answer from the record."),
    },
    ["kind", "route", "reason"],
  ),
  lesson_submit: object(
    {
      mistake: text("What kind of mistake it was."),
      destination: oneOf(["software", "taste", "premise", "none"], "Where what it teaches goes."),
      reason: text("Why it goes there."),
      line: text("The one short line to learn; leave out for none."),
      topic: text("For premise: a short topic, so the same thing recurring is grouped."),
    },
    ["mistake", "destination", "reason"],
  ),
  reading_submit: object(
    {
      wanted: list(shortLine, 'What people want: lines, each { "line", "items" }.'),
      recurring: list(shortLine, 'What keeps coming back: lines, each { "line", "items" }.'),
      purpose: text("Whether the purpose or users should change, and why."),
      back_to_why: yesNo("Whether to go back to Why with the operator."),
      not_wanted: list(intakeRef, "When going back to Why: the items that are the evidence."),
    },
    ["purpose"],
  ),
  sizing_submit: object(
    {
      size: oneOf(["small", "medium", "large"], "How big the piece is.", { loose: true }),
      size_reason: text("One sentence on why that size."),
      stages: list(text('A stage, such as "build".'), "The stages the piece needs.", 1),
      stages_reason: text("Why these stages and not the others."),
      split: list(
        either(
          [
            text("A part's title."),
            object(
              {
                title: text("A few words."),
                words: text("What the part is."),
                description: text('Another name for "words".'),
              },
              ["title"],
            ),
          ],
          "A part: an object with its title, or the title alone.",
        ),
        "The parts, or an empty list to keep the piece whole.",
      ),
      split_reason: text("Why it is split, or why it stays whole."),
    },
    ["size", "size_reason", "stages", "stages_reason", "split_reason"],
  ),
  page_read: object(
    {
      url: text("The page's address, http or https.", { example: "https://example.org/docs" }),
      part: whole("Which part to read, from 1; leave out for the first.", 1),
    },
    ["url"],
  ),
  facts_read: object({
    since: text("A time, such as 2026-11-01T00:00:00Z."),
    kinds: list(text("A kind of fact."), "The kinds of fact to read."),
  }),
  report_submit: object(
    {
      lines: list(
        object(
          {
            section: text("The report section."),
            text: text("The line."),
            evidence: text("The evidence link of the fact it rests on."),
          },
          ["text", "evidence"],
        ),
        "The report lines.",
      ),
    },
    ["lines"],
  ),
};

/** Every shape, for tests that walk them. */
export const ALL_SHAPES: readonly Shape[] = Object.values(TOOL_INPUTS);
