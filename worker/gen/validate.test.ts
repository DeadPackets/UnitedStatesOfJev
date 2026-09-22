import { describe, expect, test } from "bun:test";
import { mkFacts, mkFrame } from "./fixture";
import { calendar, days, fromDays, frame as check, members, ymd } from "./validate";

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
    expect(has(check(mkFrame({ description: "word ".repeat(61) }), mkFacts()), "over 60 words")).toBe(true);
  });

  test("a start date with no sheet event within a year is a violation", () => {
    expect(has(check(mkFrame({ start_date: "1950-01-01" }), mkFacts()), "no dated event")).toBe(true);
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
  test("the Ides land on turn 16", () => {
    const cal = calendar("-0044-02-22", ["-0045-01-01", "-0044-03-15"], []);
    expect(cal.turnOf("-0044-03-15")).toBe(16);
    expect(cal.turnOf(cal.start_date)).toBe(1);
  });

  test("the Egypt anchor lands on turn 16 with a month unit", () => {
    const cal = calendar("2012-06-30", ["2012-12-15"], []);
    expect(cal.unit).toBe("month");
    expect(cal.turnOf("2012-12-15")).toBe(16);
  });

  test("no dates gives a week unit and turn 1 for the start", () => {
    const cal = calendar("2012-06-30", [], []);
    expect(cal.unit).toBe("week");
    expect(cal.start_date).toBe("2012-06-30");
    expect(cal.turnOf("2012-06-30")).toBe(1);
  });

  test("a deck date is the anchor when the sheet has none in the window", () => {
    const cal = calendar("2012-06-30", ["1999-01-01"], ["2012-09-01"]);
    expect(cal.turnOf("2012-09-01")).toBe(16);
  });
});
