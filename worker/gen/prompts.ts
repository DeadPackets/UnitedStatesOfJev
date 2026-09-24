import { type Citizen, type Constitution, type Member, type Storylet } from "../pack";
import type { Sources } from "../sources";
import type { Facts } from "./facts";
import type { Frame } from "./frame";
import type { Calendar } from "./validate";

export type GenCtx = {
  prompt: string;
  lang: string;
  fiction: boolean;
  sources: Sources;
  facts: Facts;
  frame: Frame;
  calendar: Calendar | null;
  constitution: Constitution | null;
  members: Member[];
  citizens: Citizen[];
  deck: Storylet[];
};
export const chunk = <T>(a: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export const HISTORIAN = `You are a parliamentarian and historian. You write a "polity pack" for a strategy game about holding power: the player is the executive head of the polity for a term of 20 turns, a consul, a president, a king or a general secretary, never a legislator. They act through decrees, laws, appointments, spending, proclamations, favours and force, and several power holders can make them stop. The chamber, where one exists, is one power holder among several.`;

export const CONTENT_RULE = `Content rule: this is a historical simulation of power, written the way historians and serious strategy games write it. Seat the player in the real office of that year, whatever the regime. Name real rulers, parties, ideologies, symbols and events plainly, and state the period's wars, purges and atrocities as history, never euphemised and never glorified. Play covers war, invasion, coups, purges of rivals, martial law, censorship and repression. Name every faction, armed group, body and power holder exactly as historians of the period name it (the Irgun, the Lehi, the Haganah, the Army of the Holy War, the IRGC, the British Army in Palestine), never a softened or generic collective such as "the undergrounds", "the garrison" or "the street"; add a short gloss where a reader may not know the name. Every faction and power holder reacts by its real interests and ideology, including approving harsh measures against a rival people or group; never soften or moralise a reaction. The one thing never written as play: an act, card or effect in which the ruler orders the mass killing of civilians, ethnic cleansing or the expulsion of a population. Force never gets tactical detail of violence.
The factions and the offices are real: they are the groupings a contemporary would recognise, named as historians name them, and at least three of them when the chamber holds more than 30 seats. The members and the citizens are invented. Real people are named only in the faction "leader" fields, in premises and in problems. A leader must be alive on the start date. Never seat a named leader as a member.
Never mention the game, its design, the player, or that anything is fictional. No disclaimers. Write as a reference work of the period.`;

// The frame the persona and deck calls need to stay inside. Small enough to repeat in every parallel call.
export function frameBrief(ctx: GenCtx) {
  const f = ctx.frame;
  return {
    title: f.title,
    era: f.era,
    place: f.place,
    start_date: ctx.calendar?.start_date ?? f.start_date,
    chamber: f.vocabulary.chamber,
    member_word: f.vocabulary.member,
    factions: f.factions.map((x) => ({ id: x.id, name: x.name, ideology: x.ideology })),
    regions: f.regions.map((x) => ({ id: x.id, name: x.name })),
    blocs: f.blocs.map((x) => ({ id: x.id, name: x.name, description: x.description })),
    patrons: f.patrons.map((x) => ({ id: x.id, name: x.name })),
    tags: f.tags,
    problems: f.problems,
  };
}
