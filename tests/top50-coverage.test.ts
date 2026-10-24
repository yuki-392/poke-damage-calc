import { describe, expect, it } from "vitest";
import { auditFormatCoverage } from "../scripts/audit/top50-coverage";

function fixture() {
  const names = Array.from({ length: 50 }, (_, i) => `Synthetic-${i}`);
  const resources = {
    forms: names.map(name => ({ showdown_name: name })),
    roster: names.map(name => ({ name, types: ["Normal"], abilities: { "0": "Technician" } })),
    stats: names.map(name => ({ name, hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 })),
    natures: [{ name: "Serious", increasedStat: null, decreasedStat: null }],
    abilities: [{ name: "Technician" }], items: [{ name: "Life Orb" }],
    moves: ["Earthquake", "Rock Slide", "Flamethrower", "Protect"].map(name => ({ name, inChampions: true })),
  };
  const meta = { format: "Singles", generatedAt: "2026-10-24T00:00:00Z", pokemon: names.map((name, i) => ({ name, position: i+1,
    set: { moves: ["Earthquake", "Rock Slide", "Flamethrower", "Protect"], item: "Life Orb", ability: "Technician", nature: "Serious", bonuses: [0,0,0,0,0,0] },
    moves: [["Earthquake",80],["Protect",20],["Unknown Move",100]], items: [["Life Orb",100]], abilities: [["Technician",100]], natures: [["Serious",100]], spreads: [[100,[0,0,0,0,0,0]]] })) };
  return { resources, meta };
}

describe("TOP50 audit denominators and safety (synthetic data)", () => {
  it("separates lookup, rule availability, binding, execution and game evidence", () => {
    const f = fixture(); const r = auditFormatCoverage(f.meta, f.resources);
    expect(r.data.allRepresentativeFields.numerator).toBe(50);
    expect(r.rules.defenderAbilityAndItem.numerator).toBe(50);
    expect(r.rules.formBindings.numerator).toBe(0);
    expect(r.production.eligibleRows.numerator).toBe(0);
    expect(r.gameEvidence.damageRows.numerator).toBe(0);
    expect(r.production.measuredCalculationSuccess).toBeNull();
    expect(r.gameEvidence.measuredGameAccuracy).toBeNull();
  });
  it("does not call unregistered defensive traits or held items neutral", () => {
    const f = fixture(); f.meta.pokemon[0]!.set.ability = "Pressure"; f.meta.pokemon[0]!.set.item = "Leftovers";
    f.resources.abilities.push({ name: "Pressure" }); f.resources.items.push({ name: "Leftovers" }); f.resources.roster[0]!.abilities["0"] = "Pressure";
    const r = auditFormatCoverage(f.meta, f.resources);
    expect(r.data.allRepresentativeFields.numerator).toBe(50);
    expect(r.rules.defenderAbilityAndItem.numerator).toBe(49);
    expect(r.blockers.unsupportedDefenderAbility).toBe(1);
    expect(r.blockers.unsupportedDefenderItem).toBe(1);
  });
  it("counts missing forms separately from missing ability names and never fills metadata stats", () => {
    const f = fixture(); f.resources.roster.shift(); f.resources.abilities = [];
    const r = auditFormatCoverage(f.meta, f.resources);
    expect(r.data.masterForm.numerator).toBe(49);
    expect(r.data.baseStats.numerator).toBe(49);
    expect(r.data.abilityName.numerator).toBe(0);
    expect(r.blockers.missingMasterForm).toBe(1);
    expect(r.blockers.missingAbilityCatalog).toBe(50);
  });
  it("does not merge ambiguous forms or hide bad points/defaulted nature", () => {
    const f = fixture(); f.resources.forms.push({ showdown_name: "Other", saved_name: "Synthetic-0" } as typeof f.resources.forms[number]);
    f.meta.pokemon[1]!.set.bonuses = [32,32,32,0,0,0]; f.meta.pokemon[2]!.set.nature = "Unknown";
    const r = auditFormatCoverage(f.meta, f.resources);
    expect(r.data.formId.numerator).toBe(49);
    expect(r.data.points.numerator).toBe(49);
    expect(r.data.nature.numerator).toBe(49);
  });
  it("keeps marginal mass separate from template slots and excludes status from damage coverage", () => {
    const f = fixture(); const r = auditFormatCoverage(f.meta, f.resources);
    expect(r.attack.templateSlots).toMatchObject({ numerator: 200, denominator: 200 });
    expect(r.attack.marginalModelMentions).toMatchObject({ numerator: 100, denominator: 150 });
    expect(r.attack.marginalModelMass.percent).toBe(50);
    expect(r.attack.marginalDamageMass.percent).toBe(40);
    expect(r.attack.jointMoveAbilityItemUsage).toBeNull();
  });
  it("retains inclusion contradictions without promoting an available rule", () => {
    const f = fixture(); f.resources.moves[0]!.inChampions = false;
    const r = auditFormatCoverage(f.meta, f.resources);
    expect(r.attack.templateSlots.numerator).toBe(200);
    expect(r.attack.templateExcludedSlots).toBe(50);
    expect(r.missing.marginalExcludedMoves).toContain("Earthquake");
    expect(r.production.eligibleRows.numerator).toBe(0);
  });
  it("excludes status from the damaging-only denominator, leaving unknown categories unmeasured", () => {
    const f = fixture();
    expect(auditFormatCoverage(f.meta,f.resources).attack.damagingOnlyMass).toBeNull();
    for (const move of f.resources.moves) Object.assign(move,{ category:move.name==="Protect" ? "Status" : "Physical" });
    f.resources.moves.push(Object.assign({ name:"Unknown Move",inChampions:true },{ category:"Special" }));
    const r=auditFormatCoverage(f.meta,f.resources);
    expect(r.attack.damagingOnlyMass).toMatchObject({ numerator:4000,denominator:9000,percent:44.4444 });
  });
  it("rejects malformed, incomplete or duplicate TOP50 rather than inventing rows", () => {
    const f = fixture(); f.meta.pokemon.pop(); expect(() => auditFormatCoverage(f.meta, f.resources)).toThrow();
    const g = fixture(); g.meta.pokemon[1]!.position = 1; expect(() => auditFormatCoverage(g.meta, g.resources)).toThrow();
    const h = fixture(); h.meta.pokemon[0]!.moves = [["Earthquake",101]]; expect(() => auditFormatCoverage(h.meta, h.resources)).toThrow();
  });
  it("keeps absent distributions unmeasured, with a zero observed denominator", () => {
    const f = fixture(); for (const row of f.meta.pokemon) row.moves = [];
    const r = auditFormatCoverage(f.meta, f.resources);
    expect(r.attack.marginalModelMass).toMatchObject({ numerator: 0, denominator: 0, percent: null });
    expect(r.attack.templateSlots.denominator).toBe(200);
  });
});
