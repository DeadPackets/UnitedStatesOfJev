import { expect, test } from "bun:test";
import { lint, rewriteWorld, setPath } from "./lint";
import { ModelStop, type Caller } from "./openrouter";
import type { World } from "./schemas";

const world = () =>
  ({
    bible: {
      house_voice: "Hansard of the Fridge",
      terms: [
        {
          term: "The Haganah",
          meaning: "The Agency's force.",
          aliases: ["Hebrew Rebellion Movement", "Haganah"],
        },
      ],
      groups: [{ id: "a", short: "Shelf", identity: "They keep the shelves." }],
      history: [],
      vocabulary: { file: "Shelf record", abroad: "beyond the door" },
    },
    groups: [{ id: "a", strike: "Stops voting with you." }],
    chamber: null,
    briefing: {
      ruler: { role: "Prime Minister", removed_by: "The hand can bin you." },
      briefing: {
        situation: "The shop is in.",
        room: "The hand decides.",
        you: "You hold the shelf.",
      },
      problems: ["The milk turns."],
      pledges: [
        {
          text: "Keep the door shut",
          tag: "door",
          for: "public",
          quote: "a pivotal moment",
          doc: 1,
        },
      ],
    },
    ledgers: {},
    instruments: {},
    systems: { test: { win: "You stay.", lose: "You go." }, escalations: [], blocs: [] },
    theme: null,
  }) as unknown as World;

test.each([
  ["briefing.briefing.situation", "The vote was pivotal.", "inflated"],
  ["briefing.problems[0]", "The army is restless \u2014 and hungry.", "dash"],
  ["groups[0].strike", "Raises the holder's price.", "holder"],
  ["bible.groups[0].short", "The Committee of Union", "at most 16"],
  ["briefing.briefing.room", "The Hebrew Rebellion Movement struck at dawn.", "The Haganah"],
  ["briefing.briefing.room", "Haganah men held the road.", null],
  ["briefing.pledges[0].quote", "a pivotal moment \u2014 as sourced", null],
  ["briefing.briefing.you", "You hold the shelf and 40 police.", null],
])("%s set to %p is flagged for %p", (path, text, issue) => {
  const changed = world();
  setPath(changed, path, text);
  const found = lint(changed).find((entry) => entry.path === path);
  if (issue === null) expect(found).toBeUndefined();
  else expect(found?.issues.join(" ")).toContain(issue);
});

test("the rewrite changes only the flagged fields and straightens quotes", async () => {
  const changed = world();
  setPath(changed, "briefing.briefing.situation", "The vote was pivotal.");
  const call = (async () => ({
    fields: [
      { path: "briefing.briefing.situation", text: "The vote was \u201cclose\u201d." },
      { path: "briefing.briefing.room", text: "Rewritten without cause." },
    ],
  })) as unknown as Caller;
  const result = await rewriteWorld(call, changed, "anthropic/claude-opus-5.5");
  expect(result.world.briefing.briefing.situation).toBe('The vote was "close".');
  expect(result.world.briefing.briefing.room).toBe("The hand decides.");
  expect(result.before).toHaveLength(1);
  expect(result.after).toEqual([]);
});

test.each([
  ["a model stop leaves the prose as written", new ModelStop("content_filter", "filtered"), false],
  ["the build's budget stops the build", new Error("This world ran past its build budget."), true],
])("a rewrite that fails: %s", async (_label, error, stops) => {
  const changed = world();
  setPath(changed, "briefing.briefing.situation", "The vote was pivotal.");
  const call = (async () => {
    throw error;
  }) as unknown as Caller;
  const result = rewriteWorld(call, changed, "anthropic/claude-opus-5.5");
  if (stops) await expect(result).rejects.toThrow("budget");
  else expect((await result).after).toHaveLength(1);
});
