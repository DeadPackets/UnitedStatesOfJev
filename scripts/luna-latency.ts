// Controlled experiment: Luna latency by reasoning effort and provider routing. bun scripts/luna-latency.ts
import { z } from "zod";
import { post } from "../worker/jev";
const env = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY! } as any;
const schema = z.toJSONSchema(z.object({ title: z.string(), summary: z.string(), tags: z.array(z.string()) }));
const text = "Give every public school teacher a $10,000 raise, paid for by closing the carried-interest loophole.";
const variants: Record<string, object> = {
  "low": { reasoning: { effort: "low" } },
  "none": { reasoning: { effort: "none" } },
  "minimal": { reasoning: { effort: "minimal" } },
  "none+latency": { reasoning: { effort: "none" }, provider: { sort: "latency" } },
  "none+nitro": { reasoning: { effort: "none" }, provider: { sort: "throughput" } },
};
for (const [name, extra] of Object.entries(variants)) {
  const times: number[] = []; let provider = "", err = "";
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    try {
      const r = await post(env, "chat/completions", { model: "openai/gpt-5.6-luna", max_tokens: 400, ...extra,
        messages: [{ role: "system", content: "Turn the proposal into a bill: title (3-7 words ending in Act), summary (<=60 words), tags (1-4)." }, { role: "user", content: text }],
        response_format: { type: "json_schema", json_schema: { name: "bill", strict: true, schema } } });
      provider = r.provider ?? ""; if (!r.choices?.[0]?.message?.content) err = JSON.stringify(r).slice(0, 120);
    } catch (e) { err = String(e).slice(0, 120); }
    times.push(Math.round(performance.now() - t));
  }
  console.log(name.padEnd(14), times.join(" "), "ms", provider, err);
}
