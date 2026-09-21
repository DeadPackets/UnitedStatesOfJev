// Generates worker/roster.json: 200 senators, one D and one R for each of 100 seats. Run once: bun scripts/roster.ts
import { z } from "zod";
import { writeFileSync } from "node:fs";
import { luna } from "../worker/luna";
import { TAGS, TEMPERAMENTS, DONORS, type RosterSenator } from "../worker/engine";
import { STATES, STATE_IDS } from "../worker/states";

const env = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY! } as any;
const Sen = z.object({
  seat: z.union([z.literal(1), z.literal(2)]), party: z.enum(["D", "R"]), name: z.string(), bio: z.string(),
  core_issues: z.array(z.enum(TAGS)), temperament: z.enum(TEMPERAMENTS), tell: z.string(), donors: z.array(z.enum(DONORS)),
  years_in_office: z.enum(["new", "mid", "long"]),
});
const State = z.object({ senators: z.array(Sen) });
const SYSTEM = `Invent fictional United States senators for a political game. For the given state produce exactly 4 senators: seat 1 Democrat, seat 1 Republican, seat 2 Democrat, seat 2 Republican. Names are invented, plausible for the state, never real politicians, all distinct. bio: one sentence, at most 25 words, concrete (former job, hometown, a quirk). core_issues: exactly 2 from ${JSON.stringify(TAGS)}, fitting the state's economy and the party. temperament: one of ${JSON.stringify(TEMPERAMENTS)}, all 4 different. tell: one sentence, at most 18 words, naming what wins their vote (example: "backs anything that adds jobs in the Upper Peninsula"). donors: 1 or 2 from ${JSON.stringify(DONORS)}. years_in_office: new, mid, or long, varied. The two senators of one party must not share an issue pair or a donor.`;

async function oneState(id: string): Promise<RosterSenator[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const d = await luna(env, State, "state", SYSTEM,
      JSON.stringify({ state: STATES[id].name, lean: STATES[id].lean > 5 ? "solid Republican" : STATES[id].lean < -5 ? "solid Democrat" : "swing" }), 2500);
    const ok = d.senators.filter((s) => s.core_issues.length === 2 && s.donors.length >= 1 && s.donors.length <= 2);
    if (new Set(ok.map((s) => `${s.seat}${s.party}`)).size === 4 && new Set(ok.map((s) => s.name)).size === 4)
      return ok.map((s) => ({ id: `${id}-${s.seat}-${s.party}`, seat: `${id}-${s.seat}`, state: id, party: s.party, name: s.name, bio: s.bio,
        core_issues: s.core_issues, temperament: s.temperament, tell: s.tell, donors: s.donors, years_in_office: s.years_in_office }));
    console.log(id, "retry", attempt + 1);
  }
  throw new Error("gave up on " + id);
}

if (process.argv[2] === "dedupe") {
  const roster = (await import("../worker/roster.json")).default as RosterSenator[];
  await dedupe(roster);
  writeFileSync("worker/roster.json", JSON.stringify(roster, null, 1));
  process.exit(0);
}
const out: RosterSenator[] = [];
for (let i = 0; i < STATE_IDS.length; i += 5) {
  const chunk = await Promise.all(STATE_IDS.slice(i, i + 5).map(oneState));
  out.push(...chunk.flat());
  console.log(`${out.length}/200`);
}
await dedupe(out);
out.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync("worker/roster.json", JSON.stringify(out, null, 1));
console.log("wrote worker/roster.json");

// Names are generated per state, so cross-state duplicates happen. `bun scripts/roster.ts dedupe` renames the extras.
export async function dedupe(roster: RosterSenator[]) {
  const seen = new Set<string>(); const dups: RosterSenator[] = [];
  for (const s of roster) (seen.has(s.name) ? dups : (seen.add(s.name), [])).push(s);
  if (!dups.length) return;
  const Names = z.object({ names: z.array(z.object({ id: z.string(), name: z.string() })) });
  const d = await luna(env, Names, "names", `Give each listed senator a new invented full name, plausible for their state, not a real politician, and not in the taken list. Return one entry per id.`,
    JSON.stringify({ taken: [...seen], senators: dups.map((s) => ({ id: s.id, state: STATES[s.state].name, party: s.party, old: s.name })) }), 2000);
  for (const n of d.names) { const s = roster.find((x) => x.id === n.id); if (s && !seen.has(n.name)) { s.name = n.name; seen.add(n.name); } }
  console.log("renamed", d.names.length, "remaining dups", roster.length - new Set(roster.map((s) => s.name)).size);
}
