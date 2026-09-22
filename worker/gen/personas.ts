import { z } from "zod";
import { luna } from "../luna";
import type { Env } from "../jev";
import type { Citizen, Member } from "../pack";
import { CONTENT_RULE, HISTORIAN, frameBrief, type GenCtx } from "./prompts";
import { NeedsRepair, matchName, members as checkMembers, realNames } from "./validate";

const NamesSchema = z.object({ members: z.array(z.string()), citizens: z.array(z.string()) });
const MemberProse = z.object({ rows: z.array(z.object({
  id: z.string(), bio: z.string(), core_issues: z.array(z.string()).min(1).max(3), tell: z.string(), patrons: z.array(z.string()).max(2),
})) });
// A row rewritten because it read as someone else also needs a new name; the first pass keeps the name from names().
const MemberRewrite = z.object({ rows: z.array(z.object({
  id: z.string(), name: z.string(), bio: z.string(), core_issues: z.array(z.string()).min(1).max(3), tell: z.string(), patrons: z.array(z.string()).max(2),
})) });
const CitizenProse = z.object({ rows: z.array(z.object({
  id: z.string(), job: z.string(), town: z.string(), worldview: z.string(), issues: z.array(z.string()).length(2),
})) });

type Prose = { id: string; name?: string; bio: string; core_issues: string[]; tell: string; patrons: string[] };

const chunk = <T>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ---- names: one call, so uniqueness is a set check and not model memory ----

const NAMES_SYSTEM = `${HISTORIAN}
You invent names for people of one period and place. Every name is plausible for that period, place and language, written the way the period writes names. No name of a real person, living or dead. No repeats, and no two names that differ only in the given name.
${CONTENT_RULE}`;

export async function names(env: Env, ctx: GenCtx): Promise<Partial<GenCtx>> {
  const needM = ctx.members.length, needC = ctx.citizens.length;
  const seen = new Set<string>();
  const pool: string[] = [];
  const add = (list: string[]) => { for (const raw of list) { const n = raw.trim(); const k = n.toLowerCase(); if (n && !seen.has(k)) { seen.add(k); pool.push(n); } } };
  const ask = (m: number, c: number, avoid: string[]) => luna(env, NamesSchema, "names", NAMES_SYSTEM,
    JSON.stringify({ ...frameBrief(ctx), lang: ctx.lang, need: { members: m, citizens: c },
      members_are: "members of the chamber, the notable names of the period's politics",
      citizens_are: "ordinary people of the place",
      ...(avoid.length ? { already_used: avoid } : {}) }),
    Math.min(16000, 1200 + (m + c) * 12));

  add(await ask(needM, needC, []).then((r) => [...r.members, ...r.citizens]));
  if (pool.length < needM + needC) {
    const short = needM + needC - pool.length;
    add(await ask(Math.min(short, needM), Math.max(0, short - needM), pool).then((r) => [...r.members, ...r.citizens]));
  }
  return {
    members: ctx.members.map((m, i) => ({ ...m, name: pool[i] ?? m.id })),
    citizens: ctx.citizens.map((c, i) => ({ ...c, name: pool[needM + i] ?? c.id })),
  };
}

// ---- personas: the identity fields are already fixed, the model only writes prose ----

const MEMBER_SYSTEM = `${HISTORIAN}
You write the people of the chamber. Each row already has its name, faction, region, temperament and years in the seat: never change them. Write only bio, core_issues, tell and patrons.
- bio: at most 40 words. What they did before the seat, where they are from, what they want. Concrete work and places of the period.
- core_issues: 1 to 3 ids from the tags list.
- tell: one visible habit a whip would read, at most 18 words.
- patrons: 0 to 2 ids from the patrons list.
Every row is a different person: different work, different route into politics, different habit. Two rows must never read as the same person.
${CONTENT_RULE}`;

const CITIZEN_SYSTEM = `${HISTORIAN}
You write ordinary people of the place. Each row already has its name, region, bloc and age: never change them. Write only job, town, worldview and issues.
- job: the work of the period, two or three words.
- town: a place inside that region.
- worldview: one sentence, at most 25 words, in their own terms, what they want from the government.
- issues: exactly 2 ids from the tags list.
Every row is a different person.
${CONTENT_RULE}`;

export async function members(env: Env, ctx: GenCtx, rows: Member[], opts?: { must_differ_from?: string[] }): Promise<Member[]> {
  const rewrite = !!opts?.must_differ_from?.length;
  const tags = new Set(ctx.frame.tags), pids = new Set(ctx.frame.patrons.map((p) => p.id));
  const brief = frameBrief(ctx);
  const out = new Map<string, Member>();
  await Promise.all(chunk(rows, 25).map(async (part) => {
    const r = await luna(env, rewrite ? MemberRewrite : MemberProse, "members", rewrite ? MEMBER_SYSTEM + REWRITE_RULE : MEMBER_SYSTEM,
      JSON.stringify({ ...brief, ...(rewrite ? { must_differ_from: opts!.must_differ_from } : {}),
        rows: part.map((m) => ({ id: m.id, name: m.name, faction: m.faction, region: m.region, temperament: m.temperament, years: m.years, flags: m.flags })) }),
      Math.min(9000, 600 + part.length * 160));
    const by = new Map<string, Prose>(r.rows.map((x) => [x.id, x as Prose]));
    for (const m of part) {
      const p = by.get(m.id);
      if (!p) { out.set(m.id, m); continue; }
      const core = p.core_issues.filter((t) => tags.has(t));
      out.set(m.id, { ...m, ...(p.name ? { name: p.name } : {}), bio: p.bio, tell: p.tell, core_issues: core.length ? core : [ctx.frame.tags[0]], patrons: p.patrons.filter((x) => pids.has(x)) });
    }
  }));
  return rows.map((m) => out.get(m.id) ?? m);
}

const REWRITE_RULE = `
This row read as one of the people under must_differ_from. Give it a different invented name, plausible for the period and never the name of a real person, and a life that no reader would confuse with theirs.`;

export async function citizens(env: Env, ctx: GenCtx, rows: Citizen[], opts?: { must_differ_from?: string[] }): Promise<Citizen[]> {
  const tags = ctx.frame.tags, known = new Set(tags);
  const brief = frameBrief(ctx);
  const byRegion = new Map(ctx.frame.regions.map((r) => [r.id, r.name]));
  const byBloc = new Map(ctx.frame.blocs.map((b) => [b.id, b.name]));
  const out = new Map<string, Citizen>();
  await Promise.all(chunk(rows, 50).map(async (part) => {
    const r = await luna(env, CitizenProse, "citizens", CITIZEN_SYSTEM,
      JSON.stringify({ ...brief, ...(opts?.must_differ_from?.length ? { must_differ_from: opts.must_differ_from } : {}),
        rows: part.map((c) => ({ id: c.id, name: c.name, region: byRegion.get(c.region) ?? c.region, bloc: byBloc.get(c.bloc) ?? c.bloc, age: c.age })) }),
      Math.min(9000, 600 + part.length * 120));
    const by = new Map(r.rows.map((x) => [x.id, x]));
    for (const c of part) {
      const p = by.get(c.id);
      if (!p) { out.set(c.id, c); continue; }
      const issues = p.issues.filter((t) => known.has(t));
      out.set(c.id, { ...c, job: p.job, town: p.town, worldview: p.worldview, issues: [issues[0] ?? tags[0], issues[1] ?? tags[1]] });
    }
  }));
  return rows.map((c) => out.get(c.id) ?? c);
}

// A member carrying a real name of the period gets one rewrite; a second hit is a repair case.
export async function membersStep(env: Env, ctx: GenCtx): Promise<Partial<GenCtx>> {
  let roster = await members(env, ctx, ctx.members);
  const real = realNames(ctx.frame, ctx.facts);
  const clashes = roster.filter((m) => matchName(m.name, real));
  if (clashes.length) {
    const fixed = await Promise.all(clashes.map((m) => members(env, { ...ctx, members: roster }, [m], { must_differ_from: [matchName(m.name, real)!] })));
    const by = new Map(fixed.flat().map((m) => [m.id, m]));
    roster = roster.map((m) => by.get(m.id) ?? m);
    const left = checkMembers(ctx.frame, roster, ctx.facts);
    if (left.length) throw new NeedsRepair(left, JSON.stringify(roster.filter((m) => matchName(m.name, real))));
  }
  return { members: roster };
}
export const citizensStep = async (env: Env, ctx: GenCtx): Promise<Partial<GenCtx>> => ({ citizens: await citizens(env, ctx, ctx.citizens) });
