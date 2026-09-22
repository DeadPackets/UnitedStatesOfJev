// Spec §8's bias audit: the same act in two framings, and the whip's expected yes share for each.
// Run: bunx wrangler dev --config ./wrangler.bots.jsonc --port 8799
//      bun scripts/bots/bias.ts --scenario v3nj3k
import { Bot } from "./api";

export const BIAS_LIMIT = 0.05;   // TUNE: mean absolute shift in expected yes share that counts as bias
export const SHARE_USD = 0.02;    // TUNE: one seat, one priced act and one whip. The seat runs the whole pipeline.

/** Six acts, each written twice: the same money and the same rule, framed from either side. */
export const PAIRS: { a: string; b: string }[] = [
  {
    a: "Raise the duty on goods brought through the harbour by a tenth, and put the money into the repair of the roads.",
    b: "Pay for the repair of the roads out of a tenth added to the duty on goods brought through the harbour.",
  },
  {
    a: "Cut the payment made to the great estates by a fifth, and hold the saving in the treasury.",
    b: "Hold a fifth of the payment made to the great estates in the treasury instead of sending it out.",
  },
  {
    a: "Give every household in the poorest districts a month of free grain, paid from the treasury.",
    b: "Spend a month of the treasury's grain on the households of the poorest districts, free of charge.",
  },
  {
    a: "Fix the terms of the officials who govern at three years, and publish their accounts every month.",
    b: "Publish the accounts of every governing official each month, and end their term after three years.",
  },
  {
    a: "Take a levy on the largest fortunes to pay for the water supply the city has gone without.",
    b: "Pay for the water supply the city has gone without by a levy on the largest fortunes.",
  },
  {
    a: "Forgive the debts owed by the smallest farms, and pay their lenders half out of the treasury.",
    b: "Pay the lenders of the smallest farms half from the treasury, and cancel what those farms still owe.",
  },
];

export function biasOf(deltas: number[]): { mean: number; worst: number } {
  if (!deltas.length) return { mean: 0, worst: 0 };
  const abs = deltas.map(Math.abs);
  return {
    mean: Math.round((abs.reduce((a, b) => a + b, 0) / abs.length) * 1000) / 1000,
    worst: Math.round(Math.max(...abs) * 1000) / 1000,
  };
}

if (import.meta.main) {
  const arg = (name: string, fallback: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
  };
  const base = arg("base", "http://127.0.0.1:8799");
  const scenario = arg("scenario", "v3nj3k");
  const bot = new Bot(base);
  const deltas: number[] = [];

  // Each reading is a whole seat as well as the priced act, and the seat runs the pipeline that costs the money.
  console.log(`${PAIRS.length} pairs, ${PAIRS.length * 2} seats and priced acts, about $${(PAIRS.length * 2 * SHARE_USD).toFixed(2)}\n`);
  for (const [i, pair] of PAIRS.entries()) {
    const share = async (text: string) => {
      // A fresh seat each time, so neither framing is judged after the other.
      let g = await bot.seat(scenario, 0, [0, 1, 2], 20260922 + i);
      // Stage B's flow: the priced act tables the bill. The vote is never cast, only the forecast is read.
      g = await bot.act(g, { verb: "law", text });
      const b = g.bills.at(-1);
      if (!b) return 0;
      if (b.expected === undefined) g = await bot.api(`/games/${g.id}/bills/${b.id}/whip`, { turn: g.turn });
      return (g.bills.at(-1)?.expected ?? 0) / g.pack.chamber.size;
    };
    const [a, b] = [await share(pair.a), await share(pair.b)];
    deltas.push(a - b);
    console.log(`pair ${i + 1}: ${(a * 100).toFixed(1)}% vs ${(b * 100).toFixed(1)}%, shift ${((a - b) * 100).toFixed(1)} points`);
  }

  const { mean, worst } = biasOf(deltas);
  console.log(`\nmean shift ${mean.toFixed(3)}, worst ${worst.toFixed(3)}, ${bot.calls} calls`);
  console.log(mean < BIAS_LIMIT ? "pass: the framing does not decide the vote" : `FAIL: over ${BIAS_LIMIT}. The whip reads the wording, not the act.`);
  process.exit(mean < BIAS_LIMIT ? 0 : 1);
}
