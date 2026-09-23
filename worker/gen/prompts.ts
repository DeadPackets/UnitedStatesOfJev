import { FONT_PAIRS, ESCALATION_KEYS, type Citizen, type Constitution, type Member, type Storylet } from "../pack";
import type { Sources } from "../sources";
import type { Facts } from "./facts";
import type { Frame } from "./frame";
import type { Calendar } from "./validate";

export type GenCtx = {
  prompt: string; lang: string; fiction: boolean;
  sources: Sources; facts: Facts; frame: Frame; calendar: Calendar | null;
  constitution: Constitution | null;
  members: Member[]; citizens: Citizen[]; deck: Storylet[];
};
export const chunk = <T>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export const HISTORIAN = `You are a parliamentarian and historian. You write a "polity pack" for a strategy game about holding power: the player is the executive head of the polity for a term of 20 turns, a consul, a president, a king or a general secretary, never a legislator. They act through decrees, laws, appointments, spending, proclamations, favours and force, and several power holders can make them stop. The chamber, where one exists, is one power holder among several.`;

export const CONTENT_RULE = `Content rule: this is a historical simulation of power, written the way historians and serious strategy games write it. Seat the player in the real office of that year, whatever the regime. Name real rulers, parties, ideologies, symbols and events plainly, and state the period's wars, purges and atrocities as history, never euphemised and never glorified. Play covers war, invasion, coups, purges of rivals, martial law, censorship and repression. Every faction and power holder reacts by its real interests and ideology, including approving harsh measures against a rival people or group; never soften or moralise a reaction. The one thing never written as play: an act, card or effect in which the ruler orders the mass killing of civilians, ethnic cleansing or the expulsion of a population. Force never gets tactical detail of violence.
The factions and the offices are real: they are the groupings a contemporary would recognise, named as historians name them, and at least three of them when the chamber holds more than 30 seats. The members and the citizens are invented. Real people are named only in the faction "leader" fields, in premises and in problems. A leader must be alive on the start date. Never seat a named leader as a member.
Never mention the game, its design, the player, or that anything is fictional. No disclaimers. Write as a reference work of the period.`;

export const FRAME_RULES = `Fill every field of the JSON schema. Rules per field:
- description: at most 60 words, shown on a match card.
- content_note: what you excluded or reframed under the content rule, one sentence, or null. Written for a reader of the period: it never names a source, a sheet, or this brief.
- vocabulary: the era's own words for each game term (seat, chamber, member, bill, pass, fail, capital, turn, midterm, campaign, test, feed, post, whip, lobby, promise, patron, approval).
- theme: fonts is one of ${FONT_PAIRS.join("; ")}. ink on paper must read at 4.5:1 contrast. layout: hemicycle for continental parliaments, benches for Westminster, horseshoe for Commonwealth hybrids, circle for councils and curiae, classroom for mass assemblies, court for monarchies and juntas.
- chamber: size 24 to 72. threshold is the simple majority of size, supermajority the two-thirds or the era's rule. alpha is the weight of public opinion in the end test, 0 to 1. veto is null unless one class of seat can freeze a bill.
- Chamber size: when the real body has a known seat count, use round(real_size ÷ 8) clamped to 24..72 (a 736-seat parliament becomes 72, a 300-seat senate 38, a 60-member council 24); when the body has no fixed size, choose inside 24..72 by how many named factions and regions the era carries.
- factions: 2 to 12, ids lowercase. seats: the real seat shares scaled to chamber.size by largest remainder, minimum one seat for any faction that held any; the seats must sum to chamber.size. color: the party's official hex where sources give one. fill: unique per faction. leader: the real leader's name at the time.
- regions: 6 to 60 with weights that sum to 1. lean: one entry per faction, id is the faction id, value -1 to 1.
- blocs: exactly 5 voter groups. patrons: exactly 10 lobbies or interests; wants and hates are tags from your own tags list.
- tags: 16 to 24 lowercase kebab-case policy areas that exist in this era. No anachronisms.
- problems: 8 to 12 one-line problems the polity faces. promises: exactly 8, each tag from the tags list.
- starts: exactly one per faction: seat_title, coalition (faction ids including itself), premise (2 sentences), party and capital 0..100, hostile (coalition partners that start hostile, may be empty).
- test: the end-of-term test (an election, a confidence vote, a plebiscite). endings: four short titles.
- lobby: the era's words for a pork offer, a traded favor and a threat, with costs 10, 15 and 20.
- escalations: all 20 keys in this order, each with an era name and a headline: ${ESCALATION_KEYS.join(", ")}.
- start_date: the first day of the term (YYYY-MM-DD; BC years negative, e.g. -0044-03-15). The code sets the turn length and shifts the start so the scenario's own dated event lands late in the term.
- Facts sheet: the sources block carries a facts sheet drawn from the sources. Name only people on that sheet, and only people the sheet marks alive on the start date.`;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

// One user block for the facts and frame calls: the sources, the Wikidata date table, then the sheet.
export function sourceBlock(ctx: GenCtx, facts?: Facts): string {
  const s = ctx.sources;
  const pages = (s?.wikipedia ?? []).map((p) => `## ${p.title}\n${p.lead}\n` + p.sections.map((x) => `### ${x.heading}\n${x.text}`).join("\n")).join("\n\n");
  const people = (s?.people ?? []).map((p) => `${p.label} | ${p.born ?? "?"} | ${p.died ?? "alive"}`).join("\n");
  const parties = (s?.parties ?? []).map((p) => `${p.label} | ${p.color ?? "?"} | ${p.seats ?? "?"}`).join("\n");
  return [
    `Scenario: ${ctx.prompt}`,
    pages ? `sources:\n${clip(pages, 60000)}` : "sources: none. This scenario is invented. Invent factions, leaders, regions and colors that fit it.",
    people ? `Wikidata dates (name | born | died):\n${people}` : "",
    parties ? `Wikidata parties (name | color | seats):\n${parties}` : "",
    facts ? `facts sheet:\n${JSON.stringify(facts)}` : "",
  ].filter(Boolean).join("\n\n");
}

// The frame the persona and deck calls need to stay inside. Small enough to repeat in every parallel call.
export function frameBrief(ctx: GenCtx) {
  const f = ctx.frame;
  return {
    title: f.title, era: f.era, place: f.place, start_date: ctx.calendar?.start_date ?? f.start_date,
    chamber: f.vocabulary.chamber, member_word: f.vocabulary.member,
    factions: f.factions.map((x) => ({ id: x.id, name: x.name, ideology: x.ideology })),
    regions: f.regions.map((x) => ({ id: x.id, name: x.name })),
    blocs: f.blocs.map((x) => ({ id: x.id, name: x.name, description: x.description })),
    patrons: f.patrons.map((x) => ({ id: x.id, name: x.name })),
    tags: f.tags, problems: f.problems,
  };
}
