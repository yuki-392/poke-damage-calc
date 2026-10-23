import { describe, expect, it } from "vitest";
import { resolveForm, mapNature, mapStatPoints, projectRanking } from "../scripts/audit/external-mapping";

describe("Phase 1 external audit mapping (synthetic edge cases, not game evidence)", () => {
  const form = { showdown_name: "Example-Variant", saved_name: "Example Variant", form_name: "Example Variant" };
  it("resolves source-provided form aliases without flattening variants", () => {
    expect(resolveForm("Example Variant", [form])).toBe("form:Example-Variant");
    expect(resolveForm("Example", [form])).toBeNull();
    expect(resolveForm("Example Variant", [form, { ...form, showdown_name: "Example-Other" }])).toBeNull();
  });
  it("maps all 5 nature factors and rejects incomplete/unknown stat names", () => {
    expect(mapNature({ name: "Example", increasedStat: "sp_attack", decreasedStat: "attack" })).toEqual({ attack: 0.9, defense: 1, spAttack: 1.1, spDefense: 1, speed: 1 });
    expect(mapNature({ name: "Neutral", increasedStat: null, decreasedStat: null })).toEqual({ attack: 1, defense: 1, spAttack: 1, spDefense: 1, speed: 1 });
    expect(() => mapNature({ name: "Bad", increasedStat: "hp", decreasedStat: "speed" })).toThrow();
    expect(() => mapNature({ name: "Bad", increasedStat: null, decreasedStat: "speed" })).toThrow();
  });
  it("maps explicit point columns, retains zero, and never coerces empty values to zero", () => {
    const row = { hp_points: 32, attack_points: 0, defense_points: 2, sp_atk_points: 0, sp_def_points: 0, speed_points: 32 };
    expect(mapStatPoints(row)).toEqual({ hp: 32, attack: 0, defense: 2, spAttack: 0, spDefense: 0, speed: 32 });
    expect(() => mapStatPoints({ ...row, hp_points: "" })).toThrow();
    expect(() => mapStatPoints({ ...row, hp_points: "32" })).toThrow();
    expect(() => mapStatPoints({ ...row, attack_points: 1 })).toThrow();
  });
  it("does not fabricate rank, missing form, rate, timestamp, or representative build", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ position: i + 1, name: `Example-${i}` }));
    const mapped = projectRanking({ format: "Singles", generatedAt: "2026-10-22T00:00:00Z", pokemon: rows }, {
      fetchedAt: "2026-10-23T00:00:00Z", snapshotId: "audit", regulationId: "unresolved", resolve: name => `form:${name}`,
    });
    expect(mapped.entries[0]).toMatchObject({ rank: 1, usageRate: null, representativeBuild: null, buildOrigin: "incomplete" });
    expect(mapped.upstreamPublishedAt).toBeNull();
    expect(mapped.verificationStatus).toBe("unverified");
    expect(() => projectRanking({ format: "Singles", generatedAt: null, pokemon: rows }, {
      fetchedAt: "2026-10-23T00:00:00Z", snapshotId: "audit", regulationId: "unresolved", resolve: () => null,
    })).toThrow(/UNRESOLVED_FORM/);
  });
});
