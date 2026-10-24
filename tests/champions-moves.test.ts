import { describe, expect, it } from "vitest";
import { createDamageEngine } from "../src/lib/engine/engine";
import { championsMoveDefinitions } from "../src/lib/engine/champions-moves";
import type { DamageResult } from "../src/lib/engine/contracts";
import { rankingSchema } from "../src/lib/contracts/schemas";
import { makeTop50Fixture } from "./engine-fixtures";
import { makeNamedMoveFixture } from "./champions-moves-fixtures";

function ok(result: DamageResult) { expect(result.status).toBe("ok"); if (result.status !== "ok") throw new Error(JSON.stringify(result)); return result; }
function calculate(f: ReturnType<typeof makeNamedMoveFixture>) { return createDamageEngine(f.catalog).calculateDamage(f.request); }
const names = ["earthquake", "rockSlide", "flamethrower", "waterSpout", "protect"] as const;

describe("five reference-listed move models", () => {
  it("keeps canonical model checks immutable across engine instances", () => {
    expect(Object.isFrozen(championsMoveDefinitions)).toBe(true);
    for (const row of Object.values(championsMoveDefinitions)) { expect(Object.isFrozen(row)).toBe(true); expect(Object.isFrozen(row.model)).toBe(true); }
  });
  it.each(names)("registers %s through model + effect evidence, retaining safety gates", name => {
    const f = makeNamedMoveFixture(name); if (name === "waterSpout") f.request.attacker.currentHp = 175;
    const result = calculate(f);
    expect(result.status).toBe(name === "protect" ? "nonDamaging" : "ok");
    if (result.status === "ok" || result.status === "nonDamaging") {
      expect(result.gameVerified).toBe(false); expect(result.verification).toBe("fixture_only");
      expect(result.sourceIds).toContain(championsMoveDefinitions[name].effect.evidence.sources[0]!.id);
    }
    f.catalog.execution = "production";
    expect(calculate(f)).toMatchObject({ status: "unsupported", code: "RULES_NOT_APPROVED" });
  });
  it.each(names)("rejects inconsistent model registration for %s", name => {
    const f = makeNamedMoveFixture(name); f.catalog.moves[f.request.moveId] = { model: "fixed", type: "normal", damage: 50 };
    expect(calculate(f)).toMatchObject({ status: "unsupported", code: "MOVE_MODEL_MISMATCH" });
  });
  it.each(names)("does not approve unconfirmed source availability for %s", name => {
    const f = makeNamedMoveFixture(name); const effect = f.catalog.effects[`champions:move:${name}`]!;
    if (effect.kind !== "championsMove") throw new Error("fixture");
    effect.evidence.availability = "unconfirmed";
    expect(calculate(f)).toMatchObject({ status: "unsupported", code: "NAMED_MOVE_AVAILABILITY_UNCONFIRMED" });
  });
  it.each(["earthquake", "rockSlide", "waterSpout"] as const)("%s applies spread only for multiple actual hits", name => {
    const f = makeNamedMoveFixture(name); f.request.attacker.currentHp = 175; f.request.format = "doubles";
    const one = ok(calculate(f)); expect(one.trace.some(t => t.phase === "F1.spread")).toBe(false);
    f.request.conditions.targetsActuallyHit = 2;
    const two = ok(calculate(f)); expect(two.trace.some(t => t.phase === "F1.spread")).toBe(true);
    expect(two.range.max).toBeLessThan(one.range.max);
  });
  it.each(["earthquake", "rockSlide", "waterSpout"] as const)("%s refuses unsupported terrain and impossible singles count", name => {
    const f = makeNamedMoveFixture(name); f.request.attacker.currentHp = 175;
    f.request.conditions.terrain = "grassy";
    expect(calculate(f)).toMatchObject({ status: "unsupported", code: "CONTEXT_RULE_UNSUPPORTED" });
    f.request.conditions.terrain = "none"; f.request.conditions.targetsActuallyHit = 2;
    expect(calculate(f)).toMatchObject({ status: "invalid", code: "INVALID_BUILD_OR_CONTEXT" });
  });
  it.each(["rockSlide", "waterSpout"] as const)("%s cannot hit three adjacent foes", name => {
    const f = makeNamedMoveFixture(name); f.request.attacker.currentHp = 175; f.request.format = "doubles"; f.request.conditions.targetsActuallyHit = 3;
    expect(calculate(f)).toMatchObject({ status: "invalid", code: "MOVE_TARGET_COUNT" });
  });
  it("Earthquake accepts three actual hits, including an ally, but not unresolved grounding", () => {
    const f = makeNamedMoveFixture("earthquake"); f.request.format = "doubles"; f.request.conditions.targetsActuallyHit = 3;
    expect(calculate(f).status).toBe("ok");
    f.catalog.master.forms[1]!.types = ["flying"]; f.request.conditions.defenderGrounded = true;
    expect(calculate(f)).toMatchObject({ status: "unsupported", code: "GROUNDED_TYPE_INTERACTION_UNSUPPORTED" });
  });
  it("Flamethrower is a 90-power single-target special Fire move", () => {
    const f = makeNamedMoveFixture("flamethrower");
    expect(f.catalog.moves[f.request.moveId]).toEqual({ model: "standard", type: "fire", category: "special", power: 90, target: "single" });
    f.request.format = "doubles"; f.request.conditions.targetsActuallyHit = 2;
    expect(calculate(f)).toMatchObject({ status: "invalid", code: "SINGLE_TARGET_COUNT" });
  });
  it("Protect returns no damage distribution, range or KO data", () => {
    const f = makeNamedMoveFixture("protect", "lifeOrb"); const result = calculate(f);
    expect(result.status).toBe("nonDamaging");
    for (const field of ["rolls", "range", "ko", "distribution"]) expect(result).not.toHaveProperty(field);
    if (result.status === "nonDamaging") expect(result.assumptions).toContain("protect_defense_not_simulated");
  });
});

describe("Water Spout resolves HP before conditional power modifiers", () => {
  it.each([[1,1],[69,59],[70,60],[71,60],[72,61],[87,74],[88,75],[175,150]])("HP %i / 175 resolves to %i power", (hp, power) => {
    const f = makeNamedMoveFixture("waterSpout"); f.request.attacker.currentHp = hp;
    expect(ok(calculate(f)).trace).toContainEqual(expect.objectContaining({ phase: "M0", after: power, rounding: "floor" }));
  });
  it("does not assume a full HP Water Spout when current HP is missing", () => {
    const f = makeNamedMoveFixture("waterSpout");
    expect(calculate(f)).toMatchObject({ status: "missingContext", code: "CURRENT_HP_REQUIRED" });
    f.request.attacker.currentHp = 1; f.catalog.master.forms[0]!.baseStats = null;
    expect(calculate(f)).toMatchObject({ status: "missingContext", code: "MAX_HP_UNAVAILABLE" });
  });
  it.each([0, -1, 176, 1.5])("rejects invalid HP %s", hp => {
    const f = makeNamedMoveFixture("waterSpout"); f.request.attacker.currentHp = hp;
    expect(calculate(f).status).toBe("invalid");
  });
  it.each([[71,true],[72,false]])("Technician checks dynamic power at HP %i before Helping Hand", (hp, active) => {
    const f = makeNamedMoveFixture("waterSpout", "technician"); f.request.attacker.currentHp = hp; f.request.conditions.helpingHand = true;
    const result = ok(calculate(f));
    expect(result.trace.some(t => t.effectId === "champions:technician" && t.reason === "named_effect_active")).toBe(active);
  });
  it("uses derived maximum HP with assigned points, not a fixed divisor", () => {
    const f = makeNamedMoveFixture("waterSpout", "lifeOrb"); f.request.attacker.statPoints.hp = 32; f.request.attacker.currentHp = 104;
    expect(ok(calculate(f)).trace).toContainEqual(expect.objectContaining({ phase: "M0", after: 75 }));
  });
  it("shares registered moves between normal and TOP50 while preserving per-move failure", () => {
    const f = makeNamedMoveFixture("waterSpout"); const engine = createDamageEngine(f.catalog);
    const { moveId, ...common } = f.request; const moves = ["move:earthquake", "move:flamethrower", moveId, "move:protect"];
    const normal = engine.calculateNormal({ ...common, moves });
    expect(normal.status).toBe("ok");
    if (normal.status !== "ok") throw new Error("normal adapter");
    expect(normal.results.map(r => r.status)).toEqual(["ok", "ok", "missingContext", "nonDamaging"]);
    const ranking = rankingSchema.parse(makeTop50Fixture().ranking);
    for (const entry of ranking.entries) entry.representativeBuild = { ...f.request.defender, pokemonFormId: entry.pokemonFormId, origin: "estimated" };
    const top = engine.calculateTop50({ format: f.request.format, attacker: f.request.attacker, moves, conditions: f.request.conditions, sourceVersions: f.request.sourceVersions, rankingSnapshotId: ranking.snapshotId, defenderOverrides: {} }, ranking);
    expect(top.status).toBe("ok"); if (top.status !== "ok") throw new Error("TOP50 adapter");
    expect(top.cells).toHaveLength(200);
    for (const cell of top.cells) expect(cell.result).toEqual(normal.results[cell.moveIndex]);
  });
});
