import { describe, expect, it } from "vitest";
import { applyRatio, combine4096, baseDamage, resolveStats, applyStage, inverseStatPoints } from "../src/lib/engine/math";
import { analyzeKo, formatProbability } from "../src/lib/engine/ko";
import { makeBuild } from "./fixtures";

describe("ENG-D02/03: independently specified integer arithmetic", () => {
  it.each([
    [5, 1, 2, "floor", 2], [5, 1, 2, "halfUp", 3], [5, 1, 2, "halfDown", 2],
    [7, 1, 2, "halfDown", 3], [11, 1, 4, "halfDown", 3], [9, 1, 4, "halfUp", 2],
  ] as const)("round %i × %i/%i with %s", (v, n, d, mode, answer) => expect(applyRatio(v, n, d, mode)).toBe(answer));
  it("distinguishes 5324/5325 at a rounding boundary", () => {
    expect(applyRatio(2048, 5324, 4096, "halfDown")).toBe(2662);
    expect(applyRatio(2048, 5325, 4096, "halfDown")).toBe(2662);
    expect(applyRatio(2048, 5325, 4096, "halfUp")).toBe(2663);
  });
  it("combines 4096 modifiers with half-up at each step", () => {
    expect(combine4096([6144, 6144])).toBe(9216);
    expect(combine4096([])).toBe(4096);
    expect(applyRatio(3, 1, 2, "halfDown")).toBe(1);
    expect(applyRatio(applyRatio(3, 1, 2, "halfDown"), 3, 2, "halfDown")).toBe(1);
    expect(applyRatio(3, 3, 4, "halfDown")).toBe(2);
  });
  it("matches the handoff's arithmetic example without treating it as game evidence", () => {
    expect(baseDamage(100, 182, 189)).toBe(44);
    expect(Array.from({ length: 16 }, (_, i) => applyRatio(44, 85 + i, 100, "floor")))
      .toEqual([37, 37, 38, 38, 39, 39, 40, 40, 40, 41, 41, 42, 42, 43, 43, 44]);
  });
  it.each([[-1, 1, 1], [1.5, 1, 1], [1, 1, 0], [Number.MAX_SAFE_INTEGER + 1, 1, 1]])("rejects unsafe arithmetic %j", (v, n, d) => expect(() => applyRatio(v, n, d, "floor")).toThrow());
  it.each([[-6, 25], [-1, 66], [0, 100], [1, 150], [6, 400]])("applies stage %i to 100", (stage, answer) => expect(applyStage(100, stage)).toBe(answer));
  it("keeps all six stats and computes 0.9/1.1 using integer ratios", () => {
    const build = makeBuild();
    build.statPoints = { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };
    build.natureFactors = { attack: 1.1, defense: 1, spAttack: 0.9, spDefense: 1, speed: 1 };
    const stats = resolveStats({ hp: 100, attack: 10, defense: 100, spAttack: 10, spDefense: 100, speed: 100 }, build, "standard");
    expect(stats).toEqual({ hp: 175, attack: 33, defense: 120, spAttack: 27, spDefense: 120, speed: 120 });
  });
  it("supports only an explicitly declared fixed-HP model", () => {
    expect(resolveStats({ hp: 1, attack: 10, defense: 10, spAttack: 10, spDefense: 10, speed: 10 }, makeBuild(), "fixedHp1").hp).toBe(1);
  });
  it("inverse stat search preserves the point budget and nearest-point tie break", () => {
    expect(inverseStatPoints({ base: 100, stat: "hp", value: 207, natureFactor: 1, otherPoints: 34, previous: 0 })).toBe(32);
    expect(inverseStatPoints({ base: 10, stat: "attack", value: 27, natureFactor: 0.9, otherPoints: 0, previous: 2 })).toBe(1);
    expect(inverseStatPoints({ base: 100, stat: "hp", value: 208, natureFactor: 1, otherPoints: 0, previous: 0 })).toBeNull();
    expect(inverseStatPoints({ base: 100, stat: "hp", value: 207, natureFactor: 1, otherPoints: 35, previous: 0 })).toBeNull();
  });
});

describe("ENG-D10: exact KO probabilities conditional on repeated hits", () => {
  it("retains duplicate rolls as frequency, gives 9/16, and separates display policy", () => {
    const ko = analyzeKo([...Array(7).fill(0), ...Array(9).fill(1)], 1);
    expect(ko).toMatchObject({ kind: "random", earliestHits: 1, guaranteedHits: null, probability: { numerator: "9", denominator: "16" } });
    expect(formatProbability({ numerator: "9", denominator: "16" }, "truncate")).toBe("56.2%");
    expect(formatProbability({ numerator: "9", denominator: "16" }, "halfUp")).toBe("56.3%");
  });
  it("computes convolution for two, three and five hits", () => {
    expect(analyzeKo([1, 2], 4)).toMatchObject({ earliestHits: 2, guaranteedHits: 4, probability: { numerator: "1", denominator: "4" } });
    expect(analyzeKo([1, 2], 6)).toMatchObject({ earliestHits: 3, guaranteedHits: 6, probability: { numerator: "1", denominator: "8" } });
    expect(analyzeKo([1, 2], 10)).toMatchObject({ earliestHits: 5, guaranteedHits: 10, probability: { numerator: "1", denominator: "32" } });
  });
  it("reports exact guaranteed n and immunity without fake percentages", () => {
    expect(analyzeKo([10, 10], 31)).toMatchObject({ kind: "guaranteed", earliestHits: 4, guaranteedHits: 4, probability: { numerator: "1", denominator: "1" } });
    expect(analyzeKo([0, 0], 100)).toMatchObject({ kind: "immune", earliestHits: null, guaranteedHits: null, probability: { numerator: "0", denominator: "1" } });
    expect(analyzeKo([1], 1_000_000)).toMatchObject({ kind: "guaranteed", earliestHits: 1_000_000 });
  });
  it("agrees with exhaustive independent enumeration for a small distribution", () => {
    const rolls = [1, 2, 2, 3];
    const successes = rolls.flatMap(a => rolls.flatMap(b => rolls.map(c => a + b + c))).filter(sum => sum >= 8).length;
    const ko = analyzeKo(rolls, 8);
    expect(ko.kind).toBe("random");
    if (ko.kind === "random") expect(BigInt(ko.probability.numerator) * 64n).toBe(BigInt(successes) * BigInt(ko.probability.denominator));
  });
  it("bounds pathological work without inventing a KO rate", () => {
    expect(analyzeKo([0, 1], 10_000)).toEqual({ kind: "limitExceeded" });
    expect(() => analyzeKo([], 10)).toThrow();
    expect(() => analyzeKo([1], 0)).toThrow();
  });
  it("caps overkill using integers before converting back to safe numbers", () => {
    expect(analyzeKo([0, 3_002_399_751_580_331], Number.MAX_SAFE_INTEGER)).toMatchObject({ earliestHits: 3, probability: { numerator: "1", denominator: "8" } });
  });
});
