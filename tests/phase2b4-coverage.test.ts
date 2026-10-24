import { expect, it } from "vitest";
import { measureCandidateCoverage } from "../scripts/audit/phase2b4-coverage";
function meta() {
  return { format: "Singles", generatedAt: "2026-10-24T00:00:00Z", pokemon: Array.from({ length: 50 }, (_, i) => ({
    position: i+1, name: `synthetic-${i}`, set: { ability: i === 0 ? "Levitate" : "Multiscale", item: i === 0 ? "Air Balloon" : "Leftovers", nature: "Serious", bonuses: [0,0,0,0,0,0], moves: ["Shadow Ball","Protect","Unknown","Unknown2"] },
    moves: [["Shadow Ball",80],["Protect",20]], abilities: [["Levitate",100]], items: [["Air Balloon",100]], natures: [["Serious",100]], spreads: [[100,[0,0,0,0,0,0]]],
  })) };
}
it("recounts templates separately from marginal lists, without granting production/game status", () => {
  const r = measureCandidateCoverage(meta());
  expect(r.before.ability.numerator).toBe(0); expect(r.after.ability.numerator).toBe(50);
  expect(r.after.item.numerator).toBe(1); expect(r.after.pair.numerator).toBe(1);
  expect(r.before.templateModels.numerator).toBe(50); expect(r.after.templateModels.numerator).toBe(100);
  expect(r.after.templateModels.denominator).toBe(200); expect(r.after.marginalModels.denominator).toBe(100);
  expect(r.after.marginalDamageMass).toMatchObject({ numerator:4000, denominator:5000, percent:80 });
  expect(r.productionEligible.numerator).toBe(0); expect(r.gameVerified.numerator).toBe(0);
  expect(r.conditionResolvedRows).toBeNull(); expect(r.realDataCalculationsExecuted).toBe(0);
});
it("rejects duplicate or incomplete TOP50", () => {
  const m = meta(); m.pokemon[0]!.position = 2;
  expect(() => measureCandidateCoverage(m)).toThrow("INCOMPLETE_OR_DUPLICATE_TOP50");
});
it("rejects invalid marginal ratios", () => {
  const m = meta(); m.pokemon[0]!.moves[0]![1] = 101;
  expect(() => measureCandidateCoverage(m)).toThrow();
});
