import { test, expect } from "bun:test";
import { constitution } from "./constitution";
import { mkConstitution, mkFrame, mkFacts } from "./fixture";

const CONSTITUTION = mkConstitution();

const ctx = () => ({
  prompt: "a harbour city", lang: "en", fiction: false, facts: mkFacts(), frame: mkFrame(),
  calendar: { start_date: "0450-05-01", unit: "month" as const }, sources: { wikipedia: [], people: [], parties: [] },
}) as never;

function stub(body: unknown) {
  const seen: { system: string; user: string }[] = [];
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body));
    seen.push({ system: b.messages[0].content, user: b.messages[1].content });
    return Response.json({ choices: [{ message: { content: JSON.stringify(body) } }] });
  }) as unknown as typeof fetch;
  return seen;
}

test("the step writes a constitution and code fixes the weights", async () => {
  const real = globalThis.fetch;
  const seen = stub({ ...CONSTITUTION, ruler: { role: "Consul", faction: "reds" },
    retention: { ...CONSTITUTION.retention, weights: [{ id: "council", value: 0.9 }, { id: "street", value: 0.9 }] } });
  try {
    const out = await constitution({ OPENROUTER_API_KEY: "t" } as never, ctx());
    const w = out.constitution!.retention.weights.map((x) => x.value);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(out.constitution!.briefing.situation.length).toBeGreaterThan(0);
    expect(seen[0].system).toContain("executive head");
    expect(seen[0].system).not.toContain("harbour city");   // the player's prompt never reaches the instructions
    expect(seen.length).toBe(1);                            // 0.9 and 0.9 renormalise to 0.5 and 0.5: no repair round
  } finally { globalThis.fetch = real; }
});

test("a ruler faction that is not a start id goes back for one repair round", async () => {
  const real = globalThis.fetch;
  const seen = stub({ ...CONSTITUTION, ruler: { role: "Consul", faction: "Harbour Party" } });
  try {
    await expect(constitution({ OPENROUTER_API_KEY: "t" } as never, ctx())).rejects.toThrow(/ruler\.faction/);
    expect(seen.length).toBe(2);
    expect(seen[1].user).toContain("ruler.faction must be one of:");
  } finally { globalThis.fetch = real; }
});
