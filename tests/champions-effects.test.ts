import { describe, expect, it } from "vitest";
import { createDamageEngine } from "../src/lib/engine/engine";
import { championsEffectDefinitions, championsTypes, championsTypeChart } from "../src/lib/engine/champions-rules";
import { type DamageResult } from "../src/lib/engine/contracts";
import { makeChampionsFixture, type NamedEffect } from "./champions-effects-fixtures";
import { rankingSchema } from "../src/lib/contracts/schemas";
import { makeTop50Fixture } from "./engine-fixtures";

function ok(result: DamageResult) { expect(result.status).toBe("ok"); if (result.status !== "ok") throw new Error(result.status); return result; }
function damage(setup: ReturnType<typeof makeChampionsFixture>) { return createDamageEngine(setup.catalog).calculateDamage(setup.request); }
const names: NamedEffect[] = ["technician", "hugePower", "lifeOrb"];

describe("18 real types, explicit unverified rules", () => {
  it("has exactly 18x18 cells, preserves immunities and asymmetric interactions", () => {
    expect(championsTypes).toHaveLength(18);
    for (const type of championsTypes) expect(Object.keys(championsTypeChart[type]!)).toHaveLength(18);
    expect(championsTypeChart.normal!.ghost).toBe(0);
    expect(championsTypeChart.ground!.flying).toBe(0);
    expect(championsTypeChart.dragon!.fairy).toBe(0);
    expect(championsTypeChart.fairy!.dragon).toBe(2);
    expect(championsTypeChart.ghost!.steel).toBe(1);
  });
  it("does not invent missing types or cells", () => {
    const f = makeChampionsFixture(); delete f.catalog.typeChart.fire!.normal;
    expect(damage(f)).toMatchObject({ status: "unsupported", code: "TYPE_CHART_INCOMPLETE" });
    f.catalog.master.forms[1]!.types = ["unknown-type"];
    expect(damage(f).status).toBe("unsupported");
  });
});

describe.each(names)("named rule %s", name => {
  it("activates at its documented phase and records evidence", () => {
    const f = makeChampionsFixture(name);
    if (name === "technician") { const m = f.catalog.moves["test-move"]!; if (m.model === "standard") m.power = 60; }
    const result = ok(damage(f));
    expect(result.trace).toContainEqual(expect.objectContaining({ effectId: `champions:${name}`, phase: name === "technician" ? "P1" : name === "hugePower" ? "A1" : "F4", reason: "named_effect_active" }));
    expect(result.sourceIds).toContain(championsEffectDefinitions[name].evidence.sources[0]!.id);
    expect(result.gameVerified).toBe(false);
    expect(result.verification).toBe("fixture_only");
  });
  it("requires an explicit effective/suppressed state", () => {
    const f = makeChampionsFixture(name); f.request.conditions.supplementary = [];
    expect(damage(f)).toMatchObject({ status: "missingContext", code: "EFFECT_ACTIVITY_REQUIRED" });
  });
  it("honors explicit suppression and never guesses its cause", () => {
    const f = makeChampionsFixture(name);
    f.request.conditions.supplementary[0] = { kind: "moveEffect", effectId: `champions:${name}`, optionId: "suppressed" };
    const result = ok(damage(f));
    expect(result.rolls).toEqual(ok(damage(makeChampionsFixture())).rolls);
    expect(result.trace).toContainEqual(expect.objectContaining({ effectId: `champions:${name}`, suppressed: true, reason: "explicit_effect_suppression" }));
  });
  it("has no outgoing damage effect when owned only by the defender", () => {
    const f = makeChampionsFixture(name);
    f.request.defender.abilityId = f.request.attacker.abilityId; f.request.defender.item = f.request.attacker.item;
    f.request.attacker.abilityId = "test-ability"; f.request.attacker.item = { kind: "none" }; f.request.conditions.supplementary = [];
    expect(ok(damage(f)).rolls).toEqual(ok(damage(makeChampionsFixture())).rolls);
  });
  it("rejects an invalid state instead of treating it as inactive", () => {
    const f = makeChampionsFixture(name);
    f.request.conditions.supplementary = [{ kind: "moveEffect", effectId: `champions:${name}`, optionId: "unknown" }];
    expect(damage(f)).toMatchObject({ status: "invalid" });
  });
  it("rejects an unrelated suppression mechanism", () => {
    const f = makeChampionsFixture(name);
    f.request.conditions.supplementary.push({ kind: "allyAbility", abilityId: "test-ability", isActive: true });
    expect(damage(f)).toMatchObject({ status: "unsupported", code: "CONTEXT_RULE_UNSUPPORTED" });
  });
  it("keeps unknown special interactions unsupported and production blocked", () => {
    const f = makeChampionsFixture(name); f.request.moveId = "fixture-fixed";
    f.catalog.moves["fixture-fixed"] = { model: "fixed", type: "normal", damage: 50 };
    expect(damage(f)).toMatchObject({ status: "unsupported", code: "NAMED_EFFECT_MODEL_UNSUPPORTED" });
    f.catalog.execution = "production";
    expect(damage(f)).toMatchObject({ status: "unsupported", code: "RULES_NOT_APPROVED" });
  });
  it("does not claim status moves are damage", () => {
    const f = makeChampionsFixture(name); f.request.moveId = "fixture-status";
    expect(damage(f)).toMatchObject({ status: "nonDamaging" });
  });
  it("rejects duplicate or irrelevant activation input", () => {
    const f = makeChampionsFixture(name); f.request.conditions.supplementary.push(f.request.conditions.supplementary[0]!);
    expect(damage(f).status).toBe("invalid");
    const plain = makeChampionsFixture(); plain.request.conditions.supplementary = f.request.conditions.supplementary.slice(0, 1);
    expect(damage(plain).status).toBe("unsupported");
  });
});

describe("conditional and compound arithmetic", () => {
  it.each([[59, true], [60, true], [61, false]])("Technician threshold %i is decided before Helping Hand", (power, active) => {
    const f = makeChampionsFixture("technician"); f.catalog.moves["test-move"] = { model: "standard", category: "special", type: "fire", power, target: "single" }; f.request.conditions.helpingHand = true;
    const result = ok(damage(f));
    expect(result.trace.some(t => t.effectId === "champions:technician" && t.reason === "named_effect_active")).toBe(active);
  });
  it("Huge Power modifies attack, not power, after negative stage truncation", () => {
    const f = makeChampionsFixture("hugePower"); f.request.attacker.stages.attack = -1;
    const result = ok(damage(f));
    expect(result.trace).toContainEqual(expect.objectContaining({ phase: "A1", before: 121, after: 242 }));
    expect(result.trace).toContainEqual(expect.objectContaining({ phase: "P2", before: 100, after: 100 }));
  });
  it("Huge Power does not modify a special move", () => {
    const f = makeChampionsFixture("hugePower"); f.request.moveId = "fixture-special";
    expect(ok(damage(f)).range.max).toBe(44);
  });
  it("Life Orb has exactly 5324/4096, not 1.3 or 5325", () => {
    const f = makeChampionsFixture("lifeOrb");
    expect(ok(damage(f)).trace).toContainEqual(expect.objectContaining({ effectId: "champions:lifeOrb", modifier4096: 5324 }));
  });
  it("uses the same named rules in normal and all 200 TOP50 cells", () => {
    const f = makeChampionsFixture("technician");
    f.request.attacker.item = { kind: "known", itemId: "fixture:lifeOrb" };
    f.request.conditions.supplementary.push({ kind: "moveEffect", effectId: "champions:lifeOrb", optionId: "active" });
    f.catalog.moves["test-move"] = { model: "standard", category: "physical", type: "fire", power: 60, target: "single" };
    const moveIds = Array.from({ length: 4 }, (_, i) => `fixture-cell-${i}`);
    for (const id of moveIds) { f.catalog.master.moves.push({ ...f.catalog.master.moves[0]!, id }); f.catalog.moves[id] = { ...f.catalog.moves["test-move"]! }; }
    const engine = createDamageEngine(f.catalog); const { moveId: originalMoveId, ...common } = f.request;
    expect(originalMoveId).toBe("test-move");
    const moveId = moveIds[0]!;
    const normal = engine.calculateNormal({ ...common, moves: [moveId] });
    const ranking = rankingSchema.parse(makeTop50Fixture().ranking);
    ranking.entries.forEach(e => { e.representativeBuild = { ...e.representativeBuild, ...f.request.defender, origin: "estimated", pokemonFormId: e.pokemonFormId }; });
    ranking.regulationId = f.request.sourceVersions.regulationId;
    const top = engine.calculateTop50({ format: f.request.format, attacker: f.request.attacker, moves: moveIds, conditions: f.request.conditions, sourceVersions: f.request.sourceVersions, rankingSnapshotId: ranking.snapshotId, defenderOverrides: {} }, ranking);
    expect(normal.status).toBe("ok"); expect(top.status).toBe("ok");
    if (normal.status !== "ok" || top.status !== "ok") throw new Error("Adapter failure");
    expect(top.cells).toHaveLength(200);
    for (const cell of top.cells) expect(cell.result).toEqual(normal.results[0]);
  });
});


describe("candidate provenance and unsupported conditions", () => {
  it.each(names)("refuses unconfirmed availability for %s", name => {
    const f = makeChampionsFixture(name); const def = f.catalog.effects[`champions:${name}`]!;
    if (def.kind !== "champions") throw new Error("fixture");
    def.evidence.availability = "unconfirmed";
    expect(damage(f)).toMatchObject({ status: "unsupported", code: "NAMED_EFFECT_AVAILABILITY_UNCONFIRMED" });
  });
  it.each(names)("rejects invalid power even when %s is suppressed", name => {
    const f = makeChampionsFixture(name); f.request.conditions.supplementary = [{ kind: "moveEffect", effectId: `champions:${name}`, optionId: "suppressed" }];
    f.catalog.moves["test-move"] = { model: "standard", category: "physical", type: "fire", power: 0, target: "single" };
    expect(() => createDamageEngine(f.catalog)).toThrow();
  });
  it("does not accept L3 evidence or verified claims on a candidate definition", () => {
    const f = makeChampionsFixture("technician"); const def = f.catalog.effects["champions:technician"]!;
    if (def.kind !== "champions") throw new Error("fixture");
    def.evidence.gameEvidenceIds.push("invented-proof");
    expect(() => createDamageEngine(f.catalog)).toThrow();
  });
  it("rejects an offensive item effect incorrectly assigned to an ability", () => {
    const f = makeChampionsFixture("technician");
    f.catalog.master.abilities.find(a => a.id === "fixture:technician")!.effectIds = ["champions:lifeOrb"];
    expect(damage(f)).toMatchObject({ status: "unsupported", code: "EFFECT_ENTITY_MISMATCH" });
  });
  it("does not double-stack aliases of the same named effect", () => {
    const f = makeChampionsFixture("technician");
    f.catalog.effects["alias"] = structuredClone(f.catalog.effects["champions:technician"]!);
    f.catalog.master.effects.push({ ...f.catalog.master.effects.find(e => e.id === "champions:technician")!, id: "alias" });
    f.catalog.master.abilities.find(a => a.id === "fixture:technician")!.effectIds.push("alias");
    expect(damage(f)).toMatchObject({ status: "unsupported", code: "DUPLICATE_NAMED_EFFECT" });
  });
  it("does not apply an ordinary Flying immunity to an explicitly grounded Flying target", () => {
    const f = makeChampionsFixture();
    f.catalog.moves["test-move"] = { model: "standard", category: "physical", type: "ground", power: 100, target: "single" };
    f.catalog.master.forms[1]!.types = ["flying"]; f.request.conditions.defenderGrounded = true;
    expect(damage(f)).toMatchObject({ status: "unsupported", code: "GROUNDED_TYPE_INTERACTION_UNSUPPORTED" });
    f.request.conditions.defenderGrounded = false;
    expect(ok(damage(f)).range.max).toBe(0);
  });
});
