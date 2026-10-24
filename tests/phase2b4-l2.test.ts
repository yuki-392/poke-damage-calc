import { expect, it } from "vitest";
import { runPhase2B4L2Comparison } from "../scripts/audit/phase2b4-l2";
it("compares all 16 ordered rolls under equal reference conditions", () => {
  const r = runPhase2B4L2Comparison(); expect(r.compared).toHaveLength(45);
  for (const row of r.compared) {
    expect(row.aligned, row.id).toBe(true); expect(row.classification, row.id).toBe("一致");
    expect(row.local).toHaveLength(16); expect(row.local, row.id).toEqual(row.reference); expect(row.gameVerified).toBe(false);
  }
  expect(r.models[0]!.classification).toBe("一致"); expect(r.listed.every(row => row.listed)).toBe(true);
  expect(r.excluded).toHaveLength(7); expect(r.gameVerified).toBe(false);
});
