import { jev, type Env, type Question } from "../jev";
import type { Citizen, Member } from "../pack";
import * as personas from "./personas";
import { chunk, type GenCtx } from "./prompts";

const BATCH = 50;
const key = (a: string, b: string) => [a, b].sort().join("+");
const rank = (s: string) => s.replace(/(\d+)/, (d) => d.padStart(6, "0"));

const stripMember = (m: Member) => ({ faction: m.faction, region: m.region, bio: m.bio, tell: m.tell, core_issues: m.core_issues, temperament: m.temperament, patrons: m.patrons });
const stripCitizen = (c: Citizen) => ({ region: c.region, bloc: c.bloc, age: c.age, job: c.job, town: c.town, worldview: c.worldview, issues: c.issues });

// Step 1 one Choice per row over the other ids, step 2 an inline Noul on the flagged pairs. Measured 2026-09-22:
// by-id Nouls calibrate low, the same question with both rows inlined puts twins at 0.83+ and the worst other at 0.24.
async function twins<T extends { id: string }>(env: Env, noun: string, batch: T[], strip: (r: T) => unknown): Promise<[string, string][]> {
  if (batch.length < 2) return [];
  const state = { [noun]: batch.map((r) => ({ id: r.id, ...(strip(r) as object) })) };
  const q1: Record<string, Question> = {};
  batch.forEach((r, i) => {
    q1[r.id] = {
      type: "choice",
      instructions: `Which other entry of \`${noun}\` is most like \`${noun}[${i}]\` (id ${r.id}) in background, manner and interests, ignoring the name?`,
      options: batch.filter((o) => o.id !== r.id).map((o) => o.id),
    };
  });
  const { answers } = await jev(env, state, q1);

  const flagged = new Map<string, [string, string]>();
  for (const r of batch) {
    const top = Object.entries(answers[r.id]?.probabilities ?? {}).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 0.5) flagged.set(key(r.id, top[0]), [r.id, top[0]]);
  }
  if (!flagged.size) return [];

  const byId = new Map(batch.map((r) => [r.id, r]));
  const q2: Record<string, Question> = {};
  for (const [k, [a, b]] of flagged) {
    if (!byId.has(a) || !byId.has(b)) continue;
    q2[k] = {
      type: "noul",
      instructions: { question: "Are `first` and `second` the same person described twice under different names?", first: strip(byId.get(a)!), second: strip(byId.get(b)!) },
      criteria: { true: "same life story, same manner, same interests, only the name differs", false: "different people who merely share a region, a faction or an issue" },
    };
  }
  const { answers: verdict } = await jev(env, state, q2);
  return [...flagged.entries()].filter(([k]) => (verdict[k]?.noul ?? 0) >= 0.5).map(([, pair]) => pair);
}

// The lower seat of a confirmed pair is the one rewritten, so the senior member keeps the persona the player met.
async function rewrite<T extends { id: string }>(
  rows: T[], pairs: [string, string][], rank: (r: T) => string, regen: (row: T, other: T) => Promise<T>,
): Promise<T[]> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  // 12 rewrites at once: a 100-seat chamber can flag dozens of pairs, and each is a paid persona call.
  const jobs = pairs.slice(0, 12).flatMap(([a, b]) => {
    const x = byId.get(a), y = byId.get(b);
    if (!x || !y) return [];
    const loser = rank(x) > rank(y) ? x : y, keeper = loser === x ? y : x;
    return [regen(loser, keeper).then((r) => byId.set(loser.id, r))];
  });
  await Promise.all(jobs);
  return rows.map((r) => byId.get(r.id) ?? r);
}

export async function dedupeMembers(env: Env, ctx: GenCtx): Promise<Member[]> {
  const found = (await Promise.all(chunk(ctx.members, BATCH).map((b) => twins(env, "members", b, stripMember)))).flat();
  if (!found.length) return ctx.members;
  return rewrite(ctx.members, found, (m) => rank(m.seat), async (row, other) => {
    const [fresh] = await personas.members(env, ctx, [row], { must_differ_from: [`${other.name}: ${other.bio} ${other.tell}`] });
    return fresh ?? row;
  });
}

export async function dedupeCitizens(env: Env, ctx: GenCtx): Promise<Citizen[]> {
  const found = (await Promise.all(chunk(ctx.citizens, BATCH).map((b) => twins(env, "citizens", b, stripCitizen)))).flat();
  if (!found.length) return ctx.citizens;
  return rewrite(ctx.citizens, found, (c) => rank(c.id), async (row, other) => {
    const [fresh] = await personas.citizens(env, ctx, [row], { must_differ_from: [`${other.name}: ${other.job} in ${other.town}. ${other.worldview}`] });
    return fresh ?? row;
  });
}

export async function dedupe(env: Env, ctx: GenCtx): Promise<Partial<GenCtx>> {
  const [members, citizens] = await Promise.all([dedupeMembers(env, ctx), dedupeCitizens(env, ctx)]);
  return { members, citizens };
}
