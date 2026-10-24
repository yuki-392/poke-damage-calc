import { natureFactorsSchema, statPointsSchema, statIds, type NonHpStat, type StatId } from "../contracts/schemas";

export type Rounding = "floor" | "halfUp" | "halfDown";
export type Stats = Record<StatId, number>;
export function integer(value: number, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError("UNSAFE_INTEGER");
  return value;
}
export function safeNumber(value: bigint): number {
  const result = Number(value);
  return integer(result);
}
export function divide(value: bigint, denominator: bigint, rounding: Rounding): bigint {
  if (value < 0n || denominator <= 0n) throw new RangeError("INVALID_RATIO");
  const quotient = value / denominator;
  const twiceRemainder = (value % denominator) * 2n;
  return quotient + ((rounding === "halfUp" && twiceRemainder >= denominator) || (rounding === "halfDown" && twiceRemainder > denominator) ? 1n : 0n);
}
export function applyRatio(value: number, numerator: number, denominator: number, rounding: Rounding): number {
  return safeNumber(divide(BigInt(integer(value)) * BigInt(integer(numerator)), BigInt(integer(denominator, 1)), rounding));
}
export function combine4096(modifiers: readonly number[]): number {
  return modifiers.reduce((acc, modifier) => applyRatio(acc, integer(modifier, 1), 4096, "halfUp"), 4096);
}
export function baseDamage(power: number, attack: number, defense: number): number {
  return safeNumber((22n * BigInt(integer(power, 1)) * BigInt(integer(attack, 1)) / BigInt(integer(defense, 1))) / 50n + 2n);
}
export function applyStage(value: number, stage: number): number {
  if (!Number.isInteger(stage) || stage < -6 || stage > 6) throw new RangeError("INVALID_STAGE");
  return Math.max(1, stage >= 0 ? applyRatio(value, 2 + stage, 2, "floor") : applyRatio(value, 2, 2 - stage, "floor"));
}
export function resolveStats(base: Stats, build: { statPoints: Record<StatId, number>; natureFactors: Record<NonHpStat, number> }, model: "standard" | "fixedHp1"): Stats {
  const points = statPointsSchema.parse(build.statPoints);
  const factors = natureFactorsSchema.parse(build.natureFactors);
  return Object.fromEntries(statIds.map(stat => {
    integer(base[stat], 1);
    if (stat === "hp") return [stat, model === "fixedHp1" ? 1 : safeNumber(BigInt(base.hp) + 75n + BigInt(points.hp))];
    const value = safeNumber(BigInt(base[stat]) + 20n + BigInt(points[stat]));
    const numerator = factors[stat] === 0.9 ? 9 : factors[stat] === 1.1 ? 11 : 10;
    return [stat, applyRatio(value, numerator, 10, "floor")];
  })) as Stats;
}
export function inverseStatPoints(input: { base: number; stat: StatId; value: number; natureFactor: 0.9 | 1 | 1.1; otherPoints: number; previous: number }): number | null {
  integer(input.base, 1); integer(input.otherPoints); integer(input.previous);
  if (!Number.isSafeInteger(input.value) || input.value < 1) return null;
  const candidates: number[] = [];
  for (let p = 0; p <= 32 && p + input.otherPoints <= 66; p++) {
    const calculated = input.stat === "hp" ? input.base + 75 + p : applyRatio(input.base + 20 + p, input.natureFactor === 0.9 ? 9 : input.natureFactor === 1.1 ? 11 : 10, 10, "floor");
    if (calculated === input.value) candidates.push(p);
  }
  return candidates.sort((a, b) => Math.abs(a - input.previous) - Math.abs(b - input.previous) || a - b)[0] ?? null;
}
