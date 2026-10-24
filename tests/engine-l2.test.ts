import { describe, expect, it } from "vitest";
import { runL2Comparison } from "../scripts/audit/l2-comparison";

describe("Champions L2 comparison (not game verification)", () => {
  it("compares aligned stat tables and all sixteen ordered rolls", () => {
    const report = runL2Comparison();
    expect(report.reference.version).toBe("0.12.0");
    expect(report.reference.generation).toBe(0);
    expect(report.compared.length).toBe(27);
    for (const row of report.compared) {
      expect(row.aligned, row.id).toBe(true);
      expect(row.reference, row.id).toEqual(row.local);
      expect(row.classification, row.id).toBe("一致");
      if (row.kind === "damage") {
        expect(row.local).toHaveLength(16);
        expect("gameVerified" in row && row.gameVerified).toBe(false);
      }
    }
  });
  it("keeps exclusions explicit and production blocked", () => {
    const report = runL2Comparison();
    expect(report.excluded.map(row => row.classification)).toContain("参照実装未対応");
    expect(report.excluded.map(row => row.classification)).toContain("仕様未確認");
    expect(report.gameVerified).toBe(false);
    expect(report.production).toMatchObject({ status: "unsupported", code: "RULES_NOT_APPROVED" });
  });
});
