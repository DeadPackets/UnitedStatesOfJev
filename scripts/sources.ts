// Live check against the real Wikipedia/Wikidata APIs: bun scripts/sources.ts
import { fetchWikipedia, lookupPerson } from "../worker/sources";

const startDate = "-0044-03-15";

const page = await fetchWikipedia("en", "Julius Caesar", [
  "assassination",
  "dictatorship",
  "civil war",
  "early life",
]);
console.log(page.title, page.url);
console.log("lead:", page.lead.length, "chars");
for (const s of page.sections) console.log(`${s.heading}: ${s.text.length} chars`);

console.log("\nperson table:");
for (const name of ["Julius Caesar", "Mark Antony", "Cleopatra", "Marcus Junius Brutus"]) {
  const p = await lookupPerson(name, startDate);
  console.log(
    name,
    "->",
    p ? `${p.qid} born ${p.born} died ${p.died ?? "?"}` : "not found / rejected",
  );
}
