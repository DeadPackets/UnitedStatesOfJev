// bun scripts/build.ts [baseUrl] [prompt] — posts a prompt, polls, prints seconds per step and the pack.
const base = (process.argv[2] ?? "https://unitedstatesofjev.deadpackets.pw").replace(/\/$/, "");
const prompt = process.argv[3] ?? "Rome in 44 BC";

const post = await fetch(`${base}/api/scenarios`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }),
});
// An edge error is an HTML page, not JSON: read the body only once the status says it is ours.
if (!post.ok) { console.error(post.status, await post.text()); process.exit(1); }
const started = await post.json();
const id = started.id as string;
console.log(`${prompt} -> ${id}`);

const t0 = Date.now();
let step = "", stepAt = t0;
const secs = (from: number) => ((Date.now() - from) / 1000).toFixed(1);

for (;;) {
  await new Promise((r) => setTimeout(r, 2000));
  const r = await fetch(`${base}/api/scenarios/${id}`);
  const row = r.ok ? await r.json() : null;   // a 5xx from the edge is a blip; the build runs on
  if (!row) continue;
  if (row.step && row.step !== step) {
    if (step) console.log(`  ${step.padEnd(10)} ${secs(stepAt).padStart(6)} s`);
    step = row.step; stepAt = Date.now();
  }
  if (row.status === "failed") { console.log(`  ${step} failed: ${row.error}`); process.exit(1); }
  if (row.status === "ready") {
    console.log(`  ${step.padEnd(10)} ${secs(stepAt).padStart(6)} s`);
    console.log(`total ${secs(t0)} s`);
    const p = row.pack;
    console.log(`\n${p.title} — ${p.era}, ${p.place}\n${p.description}`);
    console.log(`chamber ${p.chamber.size}, threshold ${p.chamber.threshold}, ${p.tags.length} tags`);
    console.log("factions: " + p.factions.map((f: any) => `${f.name} (${p.members.filter((m: any) => m.faction === f.id).length})`).join(", "));
    console.log("problems: " + p.problems.slice(0, 3).map((x: string) => `\n  - ${x}`).join(""));
    console.log("members: " + p.members.slice(0, 4).map((m: any) => `\n  - ${m.name}, ${m.faction}, ${m.region}, ${m.temperament}, ${m.years}`).join(""));
    console.log(`art: ${p.art.masthead}, ${p.art.crests.length} crests, portraits ${JSON.stringify(p.art.portraits)}`);
    process.exit(0);
  }
  if (Date.now() - t0 > 600_000) { console.log(`gave up at ${step}`); process.exit(1); }
}
