import { divide, integer, safeNumber } from "./math";

export type Fraction = { numerator: string; denominator: string };
export type KoAnalysis =
  | { kind: "immune"; earliestHits: null; guaranteedHits: null; probability: Fraction }
  | { kind: "guaranteed" | "random"; earliestHits: number; guaranteedHits: number | null; probability: Fraction }
  | { kind: "limitExceeded" };
const MAX_HITS = 128;
const MAX_STATES = 10_000;
const MAX_TRANSITIONS = 1_000_000;
const ceilRatio = (hp: number, damage: number) => safeNumber((BigInt(hp) + BigInt(damage) - 1n) / BigInt(damage));
export function fraction(numerator: bigint, denominator: bigint): Fraction {
  if (numerator < 0n || denominator <= 0n) throw new RangeError("INVALID_FRACTION");
  let a = numerator; let b = denominator;
  while (b !== 0n) [a, b] = [b, a % b];
  return { numerator: String(numerator / a), denominator: String(denominator / a) };
}
/** Conditional on independent identical hits, no healing/status changes/accuracy. */
export function analyzeKo(rolls: readonly number[], currentHp: number): KoAnalysis {
  integer(currentHp, 1);
  if (!rolls.length) throw new RangeError("EMPTY_DISTRIBUTION");
  rolls.forEach(d => integer(d));
  const min = Math.min(...rolls); const max = Math.max(...rolls);
  if (max === 0) return { kind: "immune", earliestHits: null, guaranteedHits: null, probability: fraction(0n, 1n) };
  const earliestHits = ceilRatio(currentHp, max);
  const guaranteedHits = min === 0 ? null : ceilRatio(currentHp, min);
  if (earliestHits === guaranteedHits) return { kind: "guaranteed", earliestHits, guaranteedHits, probability: fraction(1n, 1n) };
  if (earliestHits > MAX_HITS) return { kind: "limitExceeded" };
  const frequencies = new Map<number, bigint>();
  for (const damage of rolls) frequencies.set(damage, (frequencies.get(damage) ?? 0n) + 1n);
  let states = new Map([[0, 1n]]); let transitions = 0;
  for (let hit = 0; hit < earliestHits; hit++) {
    const next = new Map<number, bigint>();
    for (const [sum, ways] of states) for (const [damage, frequency] of frequencies) {
      if (++transitions > MAX_TRANSITIONS) return { kind: "limitExceeded" };
      const total = BigInt(sum) + BigInt(damage);
      const capped = total >= BigInt(currentHp) ? currentHp : safeNumber(total);
      next.set(capped, (next.get(capped) ?? 0n) + ways * frequency);
    }
    if (next.size > MAX_STATES) return { kind: "limitExceeded" };
    states = next;
  }
  return { kind: "random", earliestHits, guaranteedHits, probability: fraction(states.get(currentHp) ?? 0n, BigInt(rolls.length) ** BigInt(earliestHits)) };
}
/** Explicit display policy; neither mode asserts the final UI acceptance decision. */
export function formatProbability(value: Fraction, policy: "truncate" | "halfUp"): string {
  if (!/^\d+$/.test(value.numerator) || !/^\d+$/.test(value.denominator)) throw new RangeError("INVALID_FRACTION");
  const n = BigInt(value.numerator); const d = BigInt(value.denominator);
  if (n > d || d <= 0n) throw new RangeError("INVALID_PROBABILITY");
  const tenths = divide(n * 1000n, d, policy === "truncate" ? "floor" : "halfUp");
  return `${tenths / 10n}.${tenths % 10n}%`;
}
