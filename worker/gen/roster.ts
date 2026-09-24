// The roster stage of generation v2: the research plan (held to the seat the prompt names), the roster of groups with
// evidence, and one repair round that reads each failing row's own page (lesson 10), then the desk's count fitted.
import { checkPlanSeat, checkRoster, fitHolderCount, fold, type RosterContext } from "./checks";
import { docBlock, type Gathered } from "./gather";
import type { Caller } from "./openrouter";
import {
  PlanSchema,
  RosterPatchSchema,
  RosterSchema,
  type Fail,
  type Plan,
  type Roster,
  type RosterPatch,
} from "./schemas";
import { qidsOf, wikidataFacts } from "./wikidata";
import { fetchPage } from "./wikipedia";
import { PLAN_SYSTEM, ROSTER_SYSTEM } from "./writing";

const REPAIR_DOC_CHARACTERS = 90000;

export async function writePlan(call: Caller, prompt: string, today: string): Promise<Plan> {
  const user = `Prompt: ${prompt}\nToday is ${today}.`;
  const plan = await call({
    name: "plan",
    schema: PlanSchema,
    system: PLAN_SYSTEM,
    user,
    maxTokens: 8000,
    strict: true,
  });
  const fails = checkPlanSeat(prompt, plan);
  if (!fails.length) return plan;
  // A new prompt with the broken rule in it, not a resend of the same one.
  return call({
    name: "plan-seat",
    schema: PlanSchema,
    system: PLAN_SYSTEM,
    user: `${user}\n\nAn earlier plan broke this rule: ${fails.map((fail) => fail.message).join(" ")}. Return the whole plan again with the seat fixed.`,
    maxTokens: 8000,
    strict: true,
  });
}

// QIDs and facts for the wiki titles the roster names that the gather step did not already look up.
export async function resolveRoster(roster: Roster, gathered: Gathered): Promise<Gathered> {
  const titles = [...roster.groups.map((group) => group.wiki), roster.ruler.wiki].filter(
    (title): title is string => !!title && !(title in gathered.qids),
  );
  if (!titles.length) return gathered;
  const qids = { ...gathered.qids };
  for (const [title, found] of await qidsOf(titles)) qids[title] = found.qid;
  const needed = titles
    .map((title) => qids[title])
    .filter((qid): qid is string => !!qid && !(qid in gathered.facts));
  const facts = { ...gathered.facts };
  for (const [qid, fact] of await wikidataFacts(needed)) facts[qid] = fact;
  return { ...gathered, qids, facts };
}

export async function writeRoster(
  call: Caller,
  prompt: string,
  plan: Plan,
  gathered: Gathered,
): Promise<{ roster: Roster; gathered: Gathered }> {
  const above = plan.above.map((row) => `${row.name} (${row.power})`).join("; ") || "nobody";
  const task = `<task>
Prompt: ${prompt}
Kind: ${plan.kind}. Seat: ${plan.seat.office}${plan.seat.holder ? `, held by ${plan.seat.holder}` : ""}. Start date: ${plan.start_date}. Term: 20 turns of ${plan.turn_length}, to ${plan.term_end}.${plan.divergence ? ` Divergence: ${plan.divergence}.` : ""}
Above the seat: ${above}.
Grounding: ${plan.grounding_line}
Checklist (each must be a group row or in excluded with a reason): ${gathered.checklist.join(" | ") || "none"}
Write the roster.
</task>`;
  const roster = await call({
    name: "roster",
    schema: RosterSchema,
    system: ROSTER_SYSTEM,
    user: `${docBlock(gathered.docs)}\n\n<wikidata>\n${gathered.wikidataTable}\n</wikidata>\n\n${task}`,
    maxTokens: 32000,
    strict: true,
  });
  return { roster, gathered: await resolveRoster(roster, gathered) };
}

export function applyRosterPatch(roster: Roster, patch: RosterPatch): Roster {
  const byId = new Map(roster.groups.map((group) => [group.id, group]));
  for (const group of patch.groups) byId.set(group.id, group);
  for (const id of patch.remove) byId.delete(id);
  return {
    ...roster,
    groups: [...byId.values()],
    excluded: [...roster.excluded, ...patch.excluded],
    ruler: patch.ruler ?? roster.ruler,
    fall: patch.fall_clear ? null : (patch.fall ?? roster.fall),
    chamber: patch.chamber_clear ? null : (patch.chamber ?? roster.chamber),
  };
}

// One repair call with only the failing rows and the documents they need, never the draft prose.
export async function repairRoster(
  call: Caller,
  roster: Roster,
  fails: Fail[],
  context: RosterContext,
): Promise<{ roster: Roster; gathered: Gathered }> {
  const rows = new Set(fails.map((fail) => fail.row));
  const failing = roster.groups.filter((group) => rows.has(group.id));
  const needed = new Set<number>(fails.flatMap((fail) => fail.docs ?? []));
  const docs = [...context.gathered.docs];
  const have = new Set(docs.map((doc) => doc.title));
  for (const group of failing.filter((group) => group.wiki && !have.has(group.wiki))) {
    const page = await fetchPage("en.wikipedia.org", group.wiki!, [], 5000).catch(() => null);
    if (page && !have.has(page.title)) {
      have.add(page.title);
      docs.push({ ...page, index: docs.length + 1 });
      needed.add(docs.length);
    }
  }
  for (const group of failing) if (group.doc) needed.add(group.doc);
  const names = [
    ...fails.filter((fail) => fail.check === "C5" || fail.check === "C1").map((fail) => fail.row),
    ...failing.map((group) => group.name),
  ].map((name) => fold(name.replace(/\s*\(.*\)$/, "")));
  for (const doc of docs) {
    const text = fold(doc.text);
    if (names.some((name) => text.includes(name))) needed.add(doc.index);
  }
  let shown = docs.filter((doc) => needed.has(doc.index));
  if (shown.reduce((total, doc) => total + doc.text.length, 0) > REPAIR_DOC_CHARACTERS)
    shown = shown.slice(0, 7);
  const plan = context.plan;
  const user = `${docBlock(shown)}

<roster_ids>${roster.groups.map((group) => `${group.id} (${group.name})`).join("; ")}</roster_ids>
<failing_rows>${JSON.stringify({
    groups: failing,
    ruler: rows.has("ruler") ? roster.ruler : undefined,
    fall: rows.has("fall") ? roster.fall : undefined,
    chamber: rows.has("chamber") ? roster.chamber : undefined,
  })}</failing_rows>
<failures>
${fails.map((fail) => `- ${fail.check} ${fail.row}: ${fail.message}`).join("\n")}
</failures>
<task>
Code checks found the failures above in a roster for: ${plan.start_date}, kind ${plan.kind}, seat ${plan.seat.office}.
Fix each one from the documents. Copy quotes exactly from the document you name. A checklist name goes in groups when it mattered on the date, or in excluded with a short reason.
Fix a failing row by correcting its fields; never drop a group to pass a check, except for C15: there, merge bodies under one command, or list the least important group in remove and add it to excluded with the reason "outside power". Return a patch: groups holds only the rows you change or add (whole rows, same ids for changed rows), remove the ids to take out, excluded the rows to add. Set ruler, fall or chamber only when you change them, else null; fall_clear or chamber_clear true to set them to null.
</task>`;
  const patch = await call({
    name: "roster-repair",
    schema: RosterPatchSchema,
    system: ROSTER_SYSTEM,
    user,
    maxTokens: 24000,
    strict: true,
  });
  return { roster: applyRosterPatch(roster, patch), gathered: { ...context.gathered, docs } };
}

// Check, one repair when anything fails, then fit the desk's count; the build stops on a blocking failure left after.
export async function settleRoster(
  call: Caller,
  roster: Roster,
  context: RosterContext,
): Promise<{ roster: Roster; gathered: Gathered; before: Fail[]; after: Fail[] }> {
  const before = checkRoster(roster, context);
  let settled = roster;
  let gathered = context.gathered;
  if (before.length) {
    ({ roster: settled, gathered } = await repairRoster(call, roster, before, context));
    gathered = await resolveRoster(settled, gathered);
  }
  settled = fitHolderCount(settled);
  return {
    roster: settled,
    gathered,
    before,
    after: checkRoster(settled, { plan: context.plan, gathered }),
  };
}
