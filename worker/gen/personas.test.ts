import { describe, expect, mock, test } from "bun:test";
import { mkFacts, mkFrame } from "./fixture";
import type { GenCtx } from "./prompts";

let rename: string | null = "Ossin Venn";
const seen: { must_differ_from?: string[]; rows: { id: string; name: string }[] }[] = [];

mock.module("../luna", () => ({
  luna: async (_env: unknown, _schema: unknown, _name: string, _system: string, user: string) => {
    const req = JSON.parse(user);
    seen.push(req);
    return { rows: req.rows.map((r: { id: string; name: string }) => ({
      id: r.id, ...(req.must_differ_from ? { name: rename ?? r.name } : {}),
      bio: "A dock clerk before the seat.", core_issues: [req.tags[0]], tell: "Taps the bench twice.", patrons: [],
    })) };
  },
}));
const { membersStep } = await import("./personas");

const ctx = (names: string[]): GenCtx => ({
  prompt: "Harbor 1921", lang: "en", fiction: false, sources: { wikipedia: [], people: [], parties: [] },
  facts: mkFacts(), frame: mkFrame(), calendar: null, citizens: [], deck: [],
  members: names.map((name, i) => ({
    id: `m${i + 1}`, seat: `seat-0${i + 1}`, region: "r01", faction: "reds", name, bio: "", core_issues: [],
    temperament: "loyalist", tell: "", patrons: [], years: "new", flags: [], portrait: "",
  })),
});

describe("membersStep", () => {
  test("a member carrying a real name is rewritten once", async () => {
    rename = "Ossin Venn";
    seen.length = 0;
    const { members } = await membersStep({} as never, ctx(["Bella Blue", "Tiberius Grey", "Kira Vance"]));
    expect(members!.map((m) => m.name)).toEqual(["Ossin Venn", "Ossin Venn", "Kira Vance"]);
    expect(seen.length).toBe(3);
    expect(seen.slice(1).map((r) => r.must_differ_from)).toEqual([["Bella Blue"], ["Cato Grey"]]);
  });

  test("a clean roster makes one call and no rewrite", async () => {
    seen.length = 0;
    const { members } = await membersStep({} as never, ctx(["Kira Vance", "Ossin Venn"]));
    expect(seen.length).toBe(1);
    expect(members!.every((m) => m.bio.length > 0)).toBe(true);
  });

  test("a rewrite that still carries the real name needs repair", async () => {
    rename = null;
    await expect(membersStep({} as never, ctx(["Bella Blue"]))).rejects.toThrow(/carries the real name/);
  });
});
