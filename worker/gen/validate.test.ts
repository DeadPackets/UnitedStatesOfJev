import { describe, expect, test } from "bun:test";
import { mkConstitution, mkFacts, mkFrame } from "./fixture";
import { pickCalendar } from "./calendar";
import {
  constitution as checkConstitution,
  days,
  fromDays,
  frame as check,
  members,
  turnOf,
  ymd,
} from "./validate";
import { settleConstitution } from "./constitution";

const has = (v: string[], needle: string) => v.some((x) => x.includes(needle));

describe("frame validation", () => {
  test("a clean frame has no violations", () => {
    expect(check(mkFrame(), mkFacts())).toEqual([]);
  });

  test("a patron tag outside the tags list is a violation", () => {
    const f = mkFrame();
    f.patrons[0].wants = ["not-a-tag"];
    expect(has(check(f, mkFacts()), "not-a-tag")).toBe(true);
  });

  test("a region leaning to an unknown faction is a violation", () => {
    const f = mkFrame();
    f.regions[0].lean = [{ id: "purples", value: 0.5 }];
    expect(has(check(f, mkFacts()), "unknown faction purples")).toBe(true);
  });

  test("seats that do not sum to the chamber size are a violation", () => {
    const f = mkFrame();
    f.factions[0].seats = 40;
    expect(has(check(f, mkFacts()), "faction seats sum to 90")).toBe(true);
  });

  test("a leader the sheet marks dead is a violation, by flag and by year", () => {
    const flagged = mkFacts();
    flagged.people[0].alive_on_start_date = false;
    expect(has(check(mkFrame(), flagged), "not alive on the start date")).toBe(true);

    const dated = mkFacts();
    dated.people[0].died = "1901";
    expect(has(check(mkFrame(), dated), "died 1901")).toBe(true);
  });

  test("fewer than 3 factions in a chamber over 30 seats is a violation", () => {
    const f = mkFrame();
    f.factions = f.factions.slice(0, 2);
    f.factions[0].seats = 60;
    f.factions[1].seats = 40;
    f.starts = f.starts.slice(0, 2);
    f.regions = f.regions.map((r) => ({ ...r, lean: r.lean.slice(0, 2) }));
    expect(has(check(f, mkFacts()), "only 2 factions")).toBe(true);
  });

  test("a description over 60 words is a violation", () => {
    expect(
      has(check(mkFrame({ description: "word ".repeat(61) }), mkFacts()), "over 60 words"),
    ).toBe(true);
  });

  test("a start date with no sheet event within a year is a violation", () => {
    expect(has(check(mkFrame({ start_date: "1950-01-01" }), mkFacts()), "no dated event")).toBe(
      true,
    );
  });

  test("a month calendar the code fixed is not asked for an event in its first year", () => {
    // The events cluster around the anchor, so a month turn wins and puts them all past turn 12. With the
    // anchor on turn 16 the start date is 457 days earlier, and no event falls in its first year.
    const facts = mkFacts({
      dated_events: [
        { date: "2012-10-10", title: "a" },
        { date: "2012-12-15", title: "b" },
        { date: "2013-02-20", title: "c" },
        { date: "2013-04-10", title: "d" },
      ],
      anchor: 1,
    });
    const cal = pickCalendar(facts)!;
    expect(cal.unit).toBe("month");
    expect(has(check(mkFrame({ start_date: cal.start_date }), facts), "no dated event")).toBe(true);
    expect(check(mkFrame({ start_date: cal.start_date }), facts, cal.start_date)).toEqual([]);
  });

  test("a leader seated as a member is a violation", () => {
    expect(members(mkFrame(), [{ id: "m1", name: "Bella Blue" }]).length).toBe(1);
    expect(members(mkFrame(), [{ id: "m1", name: "Ossin Venn" }])).toEqual([]);
  });
});

describe("signed dates", () => {
  test("BC dates round-trip through the day number", () => {
    for (const d of ["-0044-03-15", "0001-01-01", "1921-03-01", "2012-12-15"]) {
      expect(fromDays(days(ymd(d)!))).toBe(d);
    }
  });
});

describe("calendar", () => {
  const cal = (anchor: string, others: string[] = []) => {
    const dates = [...others, anchor];
    return pickCalendar(
      mkFacts({
        dated_events: dates.map((d, i) => ({ date: d, title: `e${i}` })),
        anchor: dates.length - 1,
      }),
    );
  };

  test("the Ides land on turn 16", () => {
    const c = cal("-0044-03-15", ["-0044-02-22", "-0044-03-01"])!;
    expect(turnOf("-0044-03-15", c.start_date, c.unit)).toBe(16);
    expect(turnOf(c.start_date, c.start_date, c.unit)).toBe(1);
  });

  test("the Egypt anchor lands on turn 16, and the unit keeps the most events in the term", () => {
    const c = cal("2012-12-15", ["2012-06-30", "2012-08-12", "2012-11-22"])!;
    expect(turnOf("2012-12-15", c.start_date, c.unit)).toBe(16);
    expect(c.unit).toBe("month");
  });

  test("no anchor gives no calendar", () => {
    expect(pickCalendar(mkFacts({ anchor: -1 }))).toBeNull();
    expect(pickCalendar(mkFacts({ dated_events: [], anchor: 0 }))).toBeNull();
    expect(pickCalendar(null)).toBeNull();
  });
});

const CONSTITUTION = mkConstitution();
const parse = (over: Record<string, unknown> = {}) => mkConstitution(over);

test.each([
  [0.9, 0.05],
  [0.4, 0.3, 0.1, 0.1, 0.1],
])("weights land in the 0.15 to 0.6 band and sum to 1: %p", (...raw: number[]) => {
  const ids = ["council", "street", "a", "b", "c"].slice(0, raw.length);
  const holders = ids.map((id) => ({ ...CONSTITUTION.holders[0], id }));
  const c = parse({
    holders: [...holders, ...CONSTITUTION.holders.filter((h) => h.where === "abroad")],
    retention: {
      ...CONSTITUTION.retention,
      weights: raw.map((value, i) => ({ id: ids[i], value })),
    },
  });
  const { constitution: fixed, violations } = settleConstitution(c, true);
  const values = fixed.retention.weights.map((w) => w.value);
  expect(values.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 9);
  for (const v of values) {
    expect(v).toBeGreaterThanOrEqual(0.15);
    expect(v).toBeLessThanOrEqual(0.6);
  }
  for (let i = 1; i < values.length; i++)
    expect(values[i]).toBeLessThanOrEqual(values[i - 1] + 1e-12); // order kept
  expect(violations.filter((v) => v.includes("weight"))).toEqual([]);
  if (raw.length === 2) {
    expect(values[0]).toBeCloseTo(0.6, 9);
    expect(values[1]).toBeCloseTo(0.4, 9);
  }
});

test("a retention nobody votes in is rejected", () => {
  const none = parse({ retention: { ...CONSTITUTION.retention, weights: [] } });
  expect(checkConstitution(settleConstitution(none, true).constitution, true).join(" ")).toContain(
    "two holders",
  );
  const zero = parse({
    retention: {
      ...CONSTITUTION.retention,
      weights: [
        { id: "council", value: 0 },
        { id: "street", value: 0 },
      ],
    },
  });
  const settled = settleConstitution(zero, true);
  expect(settled.constitution.retention.weights).toEqual([]);
  expect(settled.violations.join(" ")).toContain("two holders");
});

test("a weight naming no holder is dropped, not reported", () => {
  const c = parse({
    retention: {
      ...CONSTITUTION.retention,
      weights: [
        { id: "ghost", value: 0.5 },
        { id: "street", value: 0.5 },
      ],
    },
  });
  const { constitution: fixed } = settleConstitution(c, true);
  expect(fixed.retention.weights.map((w) => w.id)).toEqual(["street"]);
});

test("the rules code cannot fix come back as violations", () => {
  const noStop = parse({ holders: CONSTITUTION.holders.map((h) => ({ ...h, response: "riot" })) });
  expect(checkConstitution(noStop, true).join(" ")).toContain("coup");
  const noChamber = parse({
    instruments: {
      ...CONSTITUTION.instruments,
      law: { name: "law", consent: "chamber", price: { authority: 1 }, available: true },
    },
  });
  expect(checkConstitution(noChamber, false).join(" ")).toContain("chamber");
  const noLever = parse({
    holders: CONSTITUTION.holders.map((h) => (h.id === "street" ? { ...h, levers: [] } : h)),
  });
  expect(checkConstitution(noLever, true).join(" ")).toContain("street");
  const badHalf = parse({ halfTerm: { holder: "ghost", name: "x" } });
  expect(checkConstitution(badHalf, true).join(" ")).toContain("ghost");
  expect(checkConstitution(parse(), true)).toEqual([]);
});
