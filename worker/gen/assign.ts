import { TEMPERAMENTS, hash } from "../engine";
import type { Env } from "../jev";
import { scaleSeats, type Citizen, type Member } from "../pack";
import type { Frame } from "./frame";
import type { GenCtx } from "./prompts";

type SeatFlag = Member["flags"][number];

// A faction whose name or ideology reads as one of these classes seats members of that class.
const FLAG_HINTS: [SeatFlag, RegExp][] = [
  ["army", /\barmy|militar|legion|general|junta|soldier|officer|guard|warlord|martial/i],
  ["clergy", /clerg|church|priest|ulama|ulema|bishop|imam|rabbi|monast|temple|pontif|religious/i],
  ["court", /\bcourt\b|judic|magistrat|tribunal|justice|censor/i],
  ["crown", /crown|royal|king|queen|monarch|imperial|emperor|palace|dynast|noble|aristocra/i],
];
const AGE_BANDS: [number, number][] = [
  [18, 29],
  [30, 44],
  [45, 59],
  [60, 74],
  [75, 88],
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}
function shuffle<T>(a: readonly T[], rnd: () => number): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// One pass per round, one item per key, so small regions are spread through the roster instead of bunched at the end.
function roundRobin(counts: Record<string, number>): string[] {
  const left = { ...counts };
  const out: string[] = [];
  let any = true;
  while (any) {
    any = false;
    for (const k of Object.keys(left))
      if (left[k] > 0) {
        out.push(k);
        left[k]--;
        any = true;
      }
  }
  return out;
}

// scaleSeats needs at least one seat per key, so more regions than seats cannot be honored: the lightest drop out.
function regionSlots(frame: Frame, n: number): string[] {
  const regions = [...frame.regions].sort((a, b) => b.weight - a.weight).slice(0, n);
  return roundRobin(scaleSeats(Object.fromEntries(regions.map((r) => [r.id, r.weight])), n));
}

export function assignMembers(frame: Frame): Member[] {
  const size = frame.chamber.size;
  const rnd = rng(hash(frame.title + frame.era));
  const seats = scaleSeats(Object.fromEntries(frame.factions.map((f) => [f.id, f.seats])), size);
  const factionSlots = roundRobin(seats);
  const regions = regionSlots(frame, size);
  const temperaments = shuffle(
    Array.from({ length: size }, (_, i) => TEMPERAMENTS[i % TEMPERAMENTS.length]),
    rnd,
  );
  const byId = new Map(frame.factions.map((f) => [f.id, f]));
  const hintOf = (id: string) => {
    const f = byId.get(id)!;
    return FLAG_HINTS.find(([, re]) => re.test(`${f.name} ${f.short} ${f.ideology}`))?.[0];
  };
  const veto = frame.chamber.veto?.flag ?? null;
  // A veto class holds 1 seat in 10, spread over the factions by shuffling the positions before taking every tenth.
  const vetoSeats = new Set(
    veto
      ? shuffle(
          Array.from({ length: size }, (_, i) => i),
          rnd,
        ).filter((_, k) => k % 10 === 0)
      : [],
  );

  return factionSlots.map((faction, i) => {
    const hint = hintOf(faction);
    const flags: SeatFlag[] = hint ? [hint] : [];
    if (veto && vetoSeats.has(i) && !flags.includes(veto)) flags.push(veto);
    return {
      id: `m${i + 1}`,
      seat: `seat-${String(i + 1).padStart(2, "0")}`,
      region: regions[i],
      faction,
      name: "",
      bio: "",
      core_issues: [],
      temperament: temperaments[i],
      tell: "",
      patrons: [],
      years: i % 10 < 3 ? "new" : i % 10 < 7 ? "mid" : "long",
      flags,
    } satisfies Member;
  });
}

export function assignCitizens(frame: Frame): Citizen[] {
  const regions = regionSlots(frame, 250);
  return Array.from({ length: 250 }, (_, i) => {
    const band = AGE_BANDS[i % AGE_BANDS.length];
    return {
      id: `c${i + 1}`,
      region: regions[i],
      bloc: frame.blocs[Math.floor(i / 50)].id,
      name: "",
      age: band[0] + ((i * 7) % (band[1] - band[0] + 1)),
      job: "",
      town: "",
      worldview: "",
      issues: ["", ""],
      weight: 1,
    } satisfies Citizen;
  });
}

export async function assign(_env: Env, ctx: GenCtx): Promise<Partial<GenCtx>> {
  return { members: assignMembers(ctx.frame), citizens: assignCitizens(ctx.frame) };
}
