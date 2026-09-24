import { z } from "zod";
import type { Env } from "../jev";
import type { DailyMeta } from "../db";
import { luna } from "../luna";
import { CONTENT_RULE, HISTORIAN } from "./prompts";

const DailyPromptSchema = z.object({ prompt: z.string(), why: z.string() });

export const PROMPT_CHARS = 120; // TUNE: the prompt the model is asked for, and the clip code applies

export const DAILY_SYSTEM = `${HISTORIAN}

You pick the scenario for today's daily term. Every player gets the same place, the same year and the same seed, and runs it for 20 turns as its executive head.

Write one prompt, and follow all of these:
- One sentence, at most ${PROMPT_CHARS} characters, in English. It names a place and a year or a short period, and nothing else.
- Pick a year where a named person held executive power and could be removed inside about ten years: an election, a vote of no confidence, a coup, a succession, or the end of a term.
- It must not repeat any of the past dailies you are given, and must not name the same polity as any of them, whatever the year.
- Spread the map and the calendar. Do not put three of the last ten in one century, and do not put two of the last five on one continent.
- Half of them are places a reader has never played: a sultanate, a republic that lasted four years, a city state, a party congress, a colonial assembly.
Then write "why" in one sentence: what the player will be deciding.
${CONTENT_RULE}`;

/** The past dailies are the duplicate check the model sees; `duplicate` below is the check code repeats after. */
export async function dailyPrompt(env: Env, past: DailyMeta[]): Promise<string> {
  const d = await luna(
    env,
    DailyPromptSchema,
    "daily_prompt",
    DAILY_SYSTEM,
    JSON.stringify({
      past_dailies: past.map((p) => ({
        day: p.day,
        title: p.title,
        era: p.era,
        place: p.place,
        prompt: p.prompt,
      })),
    }),
    300,
  );
  return d.prompt.trim().slice(0, PROMPT_CHARS);
}

// Words every other prompt carries too, so a match on one of them says nothing about the polity.
const COMMON = new Set([
  "after",
  "under",
  "during",
  "before",
  "republic",
  "kingdom",
  "empire",
  "state",
  "states",
  "union",
  "early",
  "late",
  "year",
  "years",
  "revolution",
  "government",
  "council",
  "assembly",
  "province",
  "city",
]);
const words = (s: string) =>
  (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !COMMON.has(w));

export function duplicate(prompt: string, past: { place: string | null }[]): boolean {
  const mine = new Set(words(prompt));
  return past.some((p) => words(p.place ?? "").some((w) => mine.has(w)));
}
