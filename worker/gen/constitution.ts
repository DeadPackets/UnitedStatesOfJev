import { constitution as check } from "./validate";
import type { Constitution } from "../pack";

// Renormalise only. A model's weights never come back summing to 1, and asking it again costs a whole
// repair round; the 0.15 to 0.6 band is left to the validator because clamping and renormalising cannot
// satisfy both rules at once (two holders clamped to 0.6 and 0.15 renormalise to 0.8 and 0.2).
// No rounding: three equal holders rounded to 0.333 sum to 0.999, and the mandate reads this number.
export function settleConstitution(c: Constitution, chamberExists: boolean): { constitution: Constitution; violations: string[] } {
  const ids = new Set(c.holders.map((h) => h.id));
  const kept = c.retention.weights.filter((w) => ids.has(w.id) && w.value > 0);
  const total = kept.reduce((a, w) => a + w.value, 0);
  const weights = total > 0 ? kept.map((w) => ({ id: w.id, value: w.value / total })) : [];
  const bar = { ...c.retention.bar, step: Math.max(0, c.retention.bar.step), cap: Math.max(c.retention.bar.start, c.retention.bar.cap) };
  const fixed: Constitution = { ...c, retention: { ...c.retention, weights, bar } };
  return { constitution: fixed, violations: check(fixed, chamberExists) };
}
