// The golden run: three prompts through the local worker, each to a ready pack, then one data sheet and one packed
// world per prompt and one CSV row per build under docs/generation/golden/<day>/. Repeat it with the same command.
//   bun run dev            (another shell; the local D1 migrated first)
//   bun scripts/golden-builds.ts [baseUrl]
//   bun scripts/golden-builds.ts --sheets [day]   (writes the sheets and README again from that day's runs.csv; no build)
// Stops with exit 2 when the OpenRouter key's own meter passes the money cap; stop `bun run dev` then, since the
// Workflows run inside it.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PackSchema, type Pack } from "../worker/pack";

const SHEETS_ONLY = process.argv[2] === "--sheets";
const BASE = (SHEETS_ONLY ? "" : (process.argv[2] ?? "http://localhost:5173")).replace(/\/$/, "");
const MONEY_CAP = 6; // dollars for the whole run
const TARGETS = { seconds: 220, dollars: 0.9, firstReadable: 90 };
const PROMPTS: Record<string, string> = {
  "ottoman-1908": "The Ottoman Empire after the Young Turk Revolution, 1908",
  "westeros-298": "Westeros, 298 AC",
  "fridge-parliament": "The Parliament of the Fridge",
};
const DAY = (SHEETS_ONLY && process.argv[3]) || new Date().toISOString().slice(0, 10);
const OUT = `docs/generation/golden/${DAY}`;

// The key is read only to ask OpenRouter for its meter; it is never printed or written.
const key = readFileSync(".dev.vars", "utf8").match(
  /^OPENROUTER_API_KEY\s*=\s*"?([^"\n]+)"?/m,
)?.[1];
if (!key) throw new Error("OPENROUTER_API_KEY is missing from .dev.vars");
async function meter(): Promise<number> {
  const response = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`the key meter answered ${response.status}`);
  return Number((await response.json()).data.usage);
}

function d1<T = Record<string, any>>(sql: string): T[] {
  const run = Bun.spawnSync([
    "bunx",
    "wrangler",
    "d1",
    "execute",
    "usoj",
    "--local",
    "--json",
    "--command",
    sql,
  ]);
  if (run.exitCode !== 0) throw new Error(`wrangler d1: ${run.stderr.toString().slice(0, 400)}`);
  return JSON.parse(run.stdout.toString())[0].results as T[];
}
const quote = (id: string) => {
  if (!/^[\w-]+$/.test(id)) throw new Error(`odd scenario id ${id}`);
  return `'${id}'`;
};

type Fragment = { kind: string; at: number } & Record<string, unknown>;
type Run = {
  slug: string;
  prompt: string;
  id: string;
  status: string;
  error: string;
  seconds: number;
  fragments: Fragment[];
};

async function start(prompt: string, ip: string): Promise<string> {
  // Each prompt claims its own address; the worker allows one build per address every 10 minutes.
  for (let tries = 0; tries < 25; tries++) {
    const response = await fetch(`${BASE}/api/scenarios`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify({ prompt }),
    });
    if (response.status === 202) return ((await response.json()) as { id: string }).id;
    const body = await response.text();
    if (response.status !== 429)
      throw new Error(`${prompt}: ${response.status} ${body.slice(0, 200)}`);
    console.log(`${prompt}: ${body.slice(0, 120)}; waiting a minute`);
    await Bun.sleep(60_000);
  }
  throw new Error(`${prompt}: no build slot in 25 minutes`);
}

async function build(slug: string, prompt: string, index: number): Promise<Run> {
  const id = await start(prompt, `10.9.0.${index + 1}`);
  console.log(`${slug} -> ${id}`);
  const began = Date.now();
  for (;;) {
    await Bun.sleep(3000);
    const row = await fetch(`${BASE}/api/scenarios/${id}`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    const seconds = (Date.now() - began) / 1000;
    if (row?.status === "ready" || row?.status === "failed" || seconds > 40 * 60)
      return {
        slug,
        prompt,
        id,
        status: row?.status ?? "timeout",
        error: row?.error ?? "",
        seconds,
        fragments: row?.fragments ?? [],
      };
  }
}

const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;
const first = (fragments: Fragment[], kind: string) => {
  const at = fragments.filter((fragment) => fragment.kind === kind).map((fragment) => fragment.at);
  return at.length ? round(Math.min(...at) / 1000) : null;
};
const table = (head: string[], rows: unknown[][]) =>
  [
    `| ${head.join(" | ")} |`,
    `|${head.map(() => "---").join("|")}|`,
    ...rows.map(
      (row) =>
        `| ${row
          .map((cell) =>
            String(cell ?? "")
              .replace(/\|/g, "/")
              .replace(/\n/g, " "),
          )
          .join(" | ")} |`,
    ),
  ].join("\n");

function sheet(run: Run) {
  const calls = d1(
    `SELECT name, model, at, seconds, cost, input, output, reasoning, cached, cache_write, finish FROM build_calls WHERE scenario = ${quote(run.id)} ORDER BY at`,
  );
  const parts = Object.fromEntries(
    d1<{ part: string; body: string }>(
      `SELECT part, body FROM build_parts WHERE scenario = ${quote(run.id)}`,
    ).map((row) => [row.part, JSON.parse(row.body)]),
  );
  const packText =
    d1<{ pack: string | null }>(`SELECT pack FROM scenarios WHERE id = ${quote(run.id)}`)[0]
      ?.pack ?? null;
  let pack: Pack | null = null;
  let parseError = "";
  if (packText) {
    const parsed = PackSchema.safeParse(JSON.parse(packText));
    if (parsed.success) pack = parsed.data;
    else
      parseError = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ");
    writeFileSync(`${OUT}/${run.slug}.pack.json`, JSON.stringify(JSON.parse(packText), null, 1));
  }
  const dollars = calls.reduce((total, call) => total + call.cost, 0);
  const startOf = (name: string) => {
    const call = calls.find((row) => row.name === name);
    return call ? call.at - call.seconds * 1000 : null;
  };
  const buildStart = startOf("plan");
  const worldStart = startOf("bible");
  const fromWorld = (kind: string) => {
    const at = first(run.fragments, kind);
    return at !== null && buildStart !== null && worldStart !== null
      ? round(at - (worldStart - buildStart) / 1000)
      : null;
  };
  const row = {
    slug: run.slug,
    id: run.id,
    status: parseError ? "unparsed" : run.status,
    seconds: round(run.seconds),
    roster_s: first(run.fragments, "roster"),
    bible_s: first(run.fragments, "bible"),
    briefing_s: first(run.fragments, "briefing"),
    bible_from_world_s: fromWorld("bible"),
    briefing_from_world_s: fromWorld("briefing"),
    dollars: round(dollars, 3),
    calls: calls.length,
    grok_calls: calls.filter((call) => call.model.startsWith("x-ai/")).length,
    input: calls.reduce((total, call) => total + call.input, 0),
    cached: calls.reduce((total, call) => total + call.cached, 0),
    holders: pack?.constitution?.holders.length ?? "",
    factions: pack?.factions.length ?? "",
    chamber: pack ? `${pack.chamber.size}/${pack.chamber.threshold}` : "",
    emblems_kept: parts.emblems ? `${parts.emblems.kept}/${parts.emblems.asked}` : "",
    lint_left: parts.lint?.after?.length ?? "",
    checks_before: "",
    checks_after: "",
    error: (run.error || parseError).replace(/,/g, ";"),
  };
  const world = parts.world;
  const holders = pack?.constitution?.holders ?? [];
  const weights = new Map(
    (pack?.constitution?.retention.weights ?? []).map((weight) => [weight.id, weight.value]),
  );
  const card = (glance?: {
    wants: string[];
    hates: { tag: string; redLine: boolean }[];
    strike: string;
  }) =>
    glance
      ? `wants ${glance.wants.join(", ")}; hates ${glance.hates.map((hate) => (hate.redLine ? `**${hate.tag}**` : hate.tag)).join(", ")}; ${glance.strike}`
      : "none";
  const checks = Object.entries(parts)
    .filter(([name]) => name.endsWith("checks") || name.startsWith("checks-"))
    .map(([name, body]: [string, any]) => [
      name,
      body.before.length,
      body.after.length,
      body.after.map((fail: any) => `${fail.check} ${fail.row}: ${fail.message}`).join("; "),
    ]);
  row.checks_before = checks.reduce((total, check) => total + Number(check[1]), 0) as never;
  row.checks_after = checks.reduce((total, check) => total + Number(check[2]), 0) as never;
  const text = `# ${pack?.title ?? run.slug}

Prompt: "${run.prompt}". Scenario \`${run.id}\`. Status: ${row.status}${row.error ? ` (${row.error})` : ""}.
Run on ${DAY} with \`bun scripts/golden-builds.ts\` against the local worker.

## Time and money

${table(
  ["measure", "value", "target"],
  [
    ["total seconds", row.seconds, TARGETS.seconds],
    ["roster fragment (s from build start)", row.roster_s, ""],
    [
      "bible fragment (s from build start / from world start)",
      `${row.bible_s} / ${row.bible_from_world_s}`,
      TARGETS.firstReadable,
    ],
    [
      "briefing fragment (s from build start / from world start)",
      `${row.briefing_s} / ${row.briefing_from_world_s}`,
      "",
    ],
    ["Opus and Grok dollars (ledger)", row.dollars, TARGETS.dollars],
    ["calls (Grok)", `${row.calls} (${row.grok_calls})`, ""],
    ["input tokens (cached)", `${row.input} (${row.cached})`, ""],
  ],
)}

${table(
  ["call", "model", "s", "$", "in", "out", "reasoning", "cached", "cache write", "finish"],
  calls.map((call) => [
    call.name,
    call.model,
    round(call.seconds),
    round(call.cost, 4),
    call.input,
    call.output,
    call.reasoning,
    call.cached,
    call.cache_write,
    call.finish,
  ]),
)}

## The world

${
  pack
    ? `${pack.era}; ${pack.place}. ${pack.grounding ?? ""}
Ruler: ${pack.constitution?.ruler.role} (faction ${pack.constitution?.ruler.faction}; own group ${pack.constitution?.ownGroup}; public ${pack.constitution?.publicGroup}). Removed by: ${pack.constitution?.ruler.removedBy}
Chamber: ${pack.vocabulary.chamber}, ${pack.chamber.size} seats, ${pack.chamber.threshold} to pass.

### Holders

${table(
  [
    "id",
    "name",
    "where",
    "members",
    "support",
    "line",
    "weight",
    "gives",
    "icon",
    "emblem",
    "card",
  ],
  holders.map((holder) => [
    holder.id,
    holder.name,
    holder.where,
    holder.members,
    holder.support,
    holder.line,
    weights.get(holder.id) ?? "",
    holder.gives ? `${holder.gives.amount} ${holder.gives.ledger}/${holder.gives.per}` : "",
    holder.icon ?? "",
    holder.emblem ? "yes" : "",
    card(holder.glance),
  ]),
)}

### Factions

${table(
  ["id", "name", "seats", "tint", "emblem", "card"],
  pack.factions.map((faction) => [
    faction.id,
    faction.name,
    pack.members.filter((member) => member.faction === faction.id).length,
    faction.tint ? `${faction.tint.light} / ${faction.tint.dark}` : "",
    faction.emblem ? "yes" : "",
    card(faction.glance),
  ]),
)}

### Acts

${table(
  ["verb", "name", "consent", "vetoes", "available"],
  Object.entries(pack.constitution?.instruments ?? {}).map(([verb, act]) => [
    verb,
    act.name,
    act.consent,
    act.vetoes.join(", "),
    act.available,
  ]),
)}

### Pledges

${table(
  ["pledge", "tag", "for", "quote", "doc"],
  (world?.briefing?.pledges ?? []).map((pledge: any) => [
    pledge.text,
    pledge.tag,
    pledge.for,
    pledge.quote ?? "",
    pledge.doc ?? "",
  ]),
)}

Members ${pack.members.length} (with a card: ${pack.members.filter((member) => member.glance).length}); citizens ${pack.citizens.length}; deck ${pack.deck.length}; tags ${pack.tags.length}; sources ${pack.sources.length}. Theme: ${pack.themeTokens ? `${pack.themeTokens.display} on ${pack.themeTokens.material}` : "default"}.`
    : "No pack."
}

## Checks

${table(["checks", "before", "after", "left"], checks)}

Emblems: ${JSON.stringify(parts.emblems ?? null)}
`;
  writeFileSync(`${OUT}/${run.slug}.md`, text);
  return row;
}

mkdirSync(OUT, { recursive: true });
const csv = `${OUT}/runs.csv`;
let runs: Run[];
let spent: number;
if (SHEETS_ONLY) {
  const [head, ...lines] = readFileSync(csv, "utf8").trim().split("\n");
  const names = head.split(",");
  const recorded = lines.map((line) =>
    Object.fromEntries(line.split(",").map((cell, i) => [names[i], cell])),
  );
  spent = Number(recorded[recorded.length - 1].meter_dollars_for_run);
  runs = recorded.map((row) => ({
    slug: row.slug,
    prompt: PROMPTS[row.slug],
    id: row.id,
    status: row.status,
    error: row.error,
    seconds: Number(row.seconds),
    fragments: JSON.parse(
      d1<{ fragments: string | null }>(
        `SELECT fragments FROM scenarios WHERE id = ${quote(row.id)}`,
      )[0]?.fragments ?? "[]",
    ),
  }));
} else {
  const spentBefore = await meter();
  const guard = setInterval(async () => {
    const spent = (await meter().catch(() => spentBefore)) - spentBefore;
    if (spent >= MONEY_CAP) {
      console.error(`money cap: $${round(spent, 2)} spent; stop bun run dev now`);
      process.exit(2);
    }
  }, 30_000);
  runs = await Promise.all(
    Object.entries(PROMPTS).map(([slug, prompt], index) => build(slug, prompt, index)),
  );
  clearInterval(guard);
  spent = round((await meter()) - spentBefore, 3);
}
const rows = runs.map(sheet);
const columns = Object.keys(rows[0]);
if (!SHEETS_ONLY) {
  if (!existsSync(csv)) writeFileSync(csv, `${columns.join(",")},meter_dollars_for_run\n`);
  for (const row of rows)
    appendFileSync(csv, `${columns.map((column) => (row as any)[column]).join(",")},${spent}\n`);
}
writeFileSync(
  `${OUT}/README.md`,
  `# Golden run ${DAY}

Three prompts built end to end by generation v2 through the local worker (\`bun scripts/golden-builds.ts <baseUrl>\`), all three at once.
Targets: total ${TARGETS.seconds} s (the plan estimates 250 to 290 s), first readable about ${TARGETS.firstReadable} s from the world step's start, about $${TARGETS.dollars} a world.
"First readable" is the roster fragment, counted from the build's start; "bible" is also counted from the world step's start, as SPEED.md did.
Dollars per build are the ledger (Opus and Grok only). The key meter for the whole run (Opus, Grok and Luna, three builds) was **$${spent}**.

${table(
  [
    "world",
    "status",
    "total s",
    "first readable s (roster)",
    "bible s (build / world start)",
    "briefing s",
    "ledger $",
    "calls (Grok)",
    "checks before / after repair",
    "holders / factions",
    "emblems kept",
    "lint left",
  ],
  rows.map((row) => [
    `[${row.slug}](${row.slug}.md)`,
    row.status,
    row.seconds,
    row.roster_s,
    `${row.bible_s} / ${row.bible_from_world_s}`,
    row.briefing_s,
    row.dollars,
    `${row.calls} (${row.grok_calls})`,
    `${row.checks_before} / ${row.checks_after}`,
    `${row.holders} / ${row.factions}`,
    row.emblems_kept,
    row.lint_left,
  ]),
)}

Each world's sheet has its calls, holders, factions, acts, pledges and every check; \`<world>.pack.json\` is the pack as stored.
`,
);
console.table(
  rows.map(({ slug, status, seconds, bible_from_world_s, dollars }) => ({
    slug,
    status,
    seconds,
    bible_from_world_s,
    dollars,
  })),
);
console.log(`key meter for the whole run: $${spent} (Opus, Grok and Luna); cap $${MONEY_CAP}`);
process.exit(rows.every((row) => row.status === "ready") ? 0 : 1);
