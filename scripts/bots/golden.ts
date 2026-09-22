// The frozen prompt set of spec §8: export what a measurement run recorded, then replay it after a
// model or prompt change and print how far the distributions moved.
// Run: bun scripts/bots/golden.ts export docs/golden/2026-09-22.jsonl
//      bun scripts/bots/golden.ts replay docs/golden/2026-09-22.jsonl
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { $ } from "bun";

export const GOLDEN_N = 300;        // TUNE: prompts in the frozen set, and the cap on one replay
export const GOLDEN_SHIFT = 0.05;   // TUNE: mean absolute probability move that counts as drift

type Row = { id: string; kind: string; request: string; answer: string };

const probs = (answer: unknown): number[] => {
  const out: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "number" && v >= 0 && v <= 1) out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  // Only Jev's answers are distributions; usage.cost is a number in [0, 1] too and is not one.
  walk((answer as { answers?: unknown } | null)?.answers);
  return out;
};

const mode = process.argv[2] ?? "export";
const file = process.argv[3] ?? `docs/golden/${new Date().toISOString().slice(0, 10)}.jsonl`;

if (mode === "export") {
  // The rows are written by `wrangler dev --config ./wrangler.bots.jsonc`, which is local; production never sets GOLDEN.
  const sql = `SELECT id, kind, request, answer FROM golden ORDER BY created DESC LIMIT ${GOLDEN_N};`;
  const raw = await $`bunx wrangler d1 execute usoj --local --config ./wrangler.bots.jsonc --json --command ${sql}`.text();
  const rows: Row[] = JSON.parse(raw)[0]?.results ?? [];
  await mkdir(file.split("/").slice(0, -1).join("/"), { recursive: true });
  await writeFile(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`${rows.length} prompts written to ${file}`);
  console.log(`  jev ${rows.filter((r) => r.kind === "jev").length}, luna ${rows.filter((r) => r.kind === "luna").length}`);
  process.exit(0);
}

const key = process.env.OPENROUTER_API_KEY ?? (await readFile(".dev.vars", "utf8")).match(/OPENROUTER_API_KEY=(.*)/)?.[1]?.trim();
if (!key) { console.error("FAIL: set OPENROUTER_API_KEY or put it in .dev.vars"); process.exit(1); }

// A Luna answer is prose with no distribution to compare, so replaying it would spend money and measure nothing.
const rows: Row[] = (await readFile(file, "utf8")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r: Row) => r.kind === "jev");
if (rows.length > GOLDEN_N) {
  console.error(`FAIL: ${rows.length} prompts in ${file}, over the cap of ${GOLDEN_N}. Split the file and replay one part.`);
  process.exit(1);
}
console.log(`replaying ${rows.length} prompts from ${file}`);

const shifts: number[] = [];
let failed = 0;
for (const row of rows) {
  let body: unknown;
  try { body = JSON.parse(row.request); } catch { failed++; continue; }
  const r = await fetch("https://openrouter.ai/api/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) { failed++; continue; }
  const now = probs(await r.json()), then = probs(JSON.parse(row.answer));
  const n = Math.min(now.length, then.length);
  if (n) shifts.push(now.slice(0, n).reduce((a, v, i) => a + Math.abs(v - then[i]), 0) / n);
}

const mean = shifts.length ? shifts.reduce((a, b) => a + b, 0) / shifts.length : 0;
const worst = shifts.length ? Math.max(...shifts) : 0;
console.log(`\nmean shift ${mean.toFixed(4)}, worst ${worst.toFixed(4)}, ${failed} calls refused`);
console.log(mean < GOLDEN_SHIFT ? "pass: the models grade the frozen set as they did" : `FAIL: over ${GOLDEN_SHIFT}. Treat this as a balance change and re-measure.`);
process.exit(mean < GOLDEN_SHIFT ? 0 : 1);
