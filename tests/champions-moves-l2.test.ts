import { describe, expect, it } from "vitest";
import { runPhase2B2L2Comparison } from "../scripts/audit/l2-comparison";

describe("five named moves, fixed Champions reference", () => {
  it("checks actual generation-0 move data instead of synthetic overrides", () => {
    const report = runPhase2B2L2Comparison();
    expect(report.models).toHaveLength(5);
    for (const row of report.models) { expect(row.listed, row.id).toBe(true); expect(row.classification, row.id).toBe("一致"); expect(row.local, row.id).toEqual(row.reference); }
  });
  it("compares every ordered random roll or explicitly classifies no damage", () => {
    const report = runPhase2B2L2Comparison();
    expect(report.compared.length).toBeGreaterThanOrEqual(30);
    for (const row of report.compared) {
      expect(row.aligned, row.id).toBe(true); expect(row.classification, row.id).toBe("一致");
      expect(row.local, row.id).toEqual(row.reference); expect(row.gameVerified).toBe(false);
      if (row.kind === "damage") expect(row.local).toHaveLength(16);
      else expect(row.local).toBe("nonDamaging");
    }
    expect(report.excluded.filter(row => row.classification === "参照実装未対応")).toHaveLength(3);
    expect(report.excluded.some(row => row.classification === "仕様未確認")).toBe(true);
  });
});
