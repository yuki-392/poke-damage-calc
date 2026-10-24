import { describe, expect, it } from "vitest";
import { runPhase2BL2Comparison } from "../scripts/audit/l2-comparison";

describe("Phase 2-B L2: reference-listed candidates, never L3", () => {
  it("compares all 324 type cells with the independent Champions table", () => {
    const report = runPhase2BL2Comparison();
    expect(report.types).toHaveLength(324);
    for (const cell of report.types) expect(cell.local, cell.id).toBe(cell.reference);
  });
  it("compares active, inactive, suppressed, boundary and compound effect cases", () => {
    const report = runPhase2BL2Comparison();
    expect(report.effects.length).toBeGreaterThanOrEqual(24);
    for (const row of report.effects) {
      expect(row.aligned, row.id).toBe(true);
      expect(row.classification, row.id).toBe("一致");
      expect(row.local, row.id).toEqual(row.reference);
      expect(row.local).toHaveLength(16);
      expect(row.gameVerified).toBe(false);
    }
  });
});
