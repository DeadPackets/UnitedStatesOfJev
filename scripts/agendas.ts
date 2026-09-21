// Generates worker/agendas.json: 10 agendas x 10 pre-parsed bills, so Agenda mode never pays for a Luna parse. Run once: bun scripts/agendas.ts
import { z } from "zod";
import { writeFileSync } from "node:fs";
import { luna, BillDraftSchema } from "../worker/luna";

const env = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY! } as any;
const THEMES = ["First 100 Days", "Green Century", "Law and Order", "Small Government", "Infrastructure Decade", "Healthcare for All",
  "Secure Borders", "Education First", "Innovation Nation", "Veterans and Defense"];
const Agenda = z.object({ bills: z.array(BillDraftSchema.extend({ text: z.string() })) });

const agendas = [];
for (const theme of THEMES) {
  const d = await luna(env, Agenda, "agenda",
    "You write a President's legislative agenda for a political game. Produce exactly 10 distinct bills for the theme. Each bill: text = the President's proposal in plain words, one or two sentences, as a person would type it; title = 3 to 7 words ending in Act; summary = at most 60 words, neutral, what it does; tags = 1 to 4 from the allowed list. Mix easy bipartisan bills with hard partisan ones. Order them from easiest to hardest to pass.",
    `Theme: ${theme}`, 4000);
  if (d.bills.length !== 10) { console.error(theme, "got", d.bills.length); process.exit(1); }
  agendas.push({ theme, bills: d.bills.slice(0, 10).map((b) => ({ ...b, tags: b.tags.slice(0, 4) })) });
  console.log("agenda ok:", theme);
}
writeFileSync("worker/agendas.json", JSON.stringify(agendas, null, 1));
