// Generates public/portraits/<id>.webp for all 200 senators: Workers AI Flux Schnell, then a duotone posterize via ImageMagick.
// Run once: bun scripts/portraits.ts   (needs wrangler login; reads its OAuth token)
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import roster from "../worker/roster.json";
import { STATES } from "../worker/states";

const TOKEN = readFileSync(`${process.env.HOME}/Library/Preferences/.wrangler/config/default.toml`, "utf8").match(/oauth_token\s*=\s*"([^"]+)"/)![1];
const ACCOUNT = "168f05bbf03948dffcbf06be0aa7e2d5";
const AGE: Record<string, string> = { new: "in their early forties", mid: "in their fifties", long: "in their late sixties" };
const LOOK: Record<string, string> = { loyalist: "neat, composed", "deal-maker": "easy smile, relaxed", populist: "weathered, direct gaze", ideologue: "intense, unsmiling", institutionalist: "formal, reading glasses", maverick: "wry, slightly rumpled" };

async function one(s: (typeof roster)[number]) {
  const out = `public/portraits/${s.id}.webp`;
  if (existsSync(out)) return;
  const prompt = `Flat editorial illustration, three-quarter portrait of a United States senator ${AGE[s.years_in_office]}, ${LOOK[s.temperament]}, from ${STATES[s.state].name}, ${s.bio} Plain solid background, head and shoulders, strong simple shapes, high contrast, no text.`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ prompt, steps: 4 }) });
    const d: any = await r.json().catch(() => ({}));
    if (!d?.result?.image) { console.warn(s.id, "retry", d?.errors ?? r.status); await new Promise((res) => setTimeout(res, 1500)); continue; }
    const png = `/tmp/portrait-${s.id}.png`;
    writeFileSync(png, Buffer.from(d.result.image, "base64"));
    // Duotone posterize: same ink and paper as the UI, three levels, 256 px. This is what makes 200 outputs read as one hand.
    execSync(`magick ${png} -resize 256x256^ -gravity center -extent 256x256 -colorspace Gray -normalize -level 12%,80% -posterize 3 -colorspace sRGB +level-colors '#17160f','#f5f3ee' -define webp:method=6 -quality 70 ${out} && rm ${png}`);
    return;
  }
  console.error("FAILED", s.id);
}

for (let i = 0; i < roster.length; i += 4) {
  await Promise.all(roster.slice(i, i + 4).map(one));
  console.log(`${Math.min(i + 4, roster.length)}/200`);
}
console.log("total bytes:", execSync("du -sk public/portraits").toString().trim());
