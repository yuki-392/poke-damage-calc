import { describe, expect, it } from "vitest";
import { createDamageEngine } from "../src/lib/engine/engine";
import { makeDamageRequest, makeEngineCatalog, makeTop50Fixture } from "./engine-fixtures";
import { makeBuild } from "./fixtures";

const calculate = (request = makeDamageRequest(), catalog = makeEngineCatalog()) => createDamageEngine(catalog).calculateDamage(request);
const ok = (result: ReturnType<typeof calculate>) => { expect(result.status).toBe("ok"); if (result.status !== "ok") throw new Error(result.code); return result; };

describe("ENG-D01/02/15: deterministic pure damage boundary", () => {
  it("returns the 44 example and all 16 rolls with fixture-only evidence", () => {
    const result = ok(calculate());
    expect(result.rolls).toEqual([37, 37, 38, 38, 39, 39, 40, 40, 40, 41, 41, 42, 42, 43, 43, 44]);
    expect(result.verification).toBe("fixture_only"); expect(result.gameVerified).toBe(false);
    expect(result.trace.some(t => t.phase === "B1" && t.after === 44)).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result.trace.filter(t => t.phase === "F5").map(t => t.after)).toEqual(result.rolls);
  });
  it("does not mutate requests or capture mutable caller catalogs", () => {
    const catalog = makeEngineCatalog(); const request = makeDamageRequest(); const copy = structuredClone(request);
    const engine = createDamageEngine(catalog); const first = engine.calculateDamage(request);
    catalog.master.forms[0]!.baseStats.attack = 1000;
    expect(engine.calculateDamage(request)).toEqual(first); expect(request).toEqual(copy);
  });
  it.each(["ruleVersion", "masterDataVersion", "effectCatalogVersion", "regulationId"] as const)("rejects a mismatched %s", key => {
    const request = makeDamageRequest(); request.sourceVersions[key] = "wrong";
    expect(calculate(request)).toMatchObject({ status: "invalid", code: "VERSION_INCOMPATIBLE" });
  });
  it("rejects malformed wire data and unknown IDs without a partial numerical result", () => {
    const engine = createDamageEngine(makeEngineCatalog());
    for (const value of [null, {}, { ...makeDamageRequest(), arbitraryMultiplier: 2 }, { ...makeDamageRequest(), moveId: "missing" }]) {
      const result = engine.calculateDamage(value); expect(result.status).toBe("invalid"); expect(result).not.toHaveProperty("rolls");
    }
    const request = makeDamageRequest(); request.attacker.statPoints.hp = 33;
    expect(calculate(request).status).toBe("invalid");
    request.attacker.statPoints.hp = 0; request.attacker.natureFactors.attack = 1.1;
    expect(calculate(request).status).toBe("invalid");
  });
  it("refuses unverified production use even with an otherwise valid fixture catalog", () => {
    const catalog = makeEngineCatalog(); catalog.execution = "production";
    expect(calculate(makeDamageRequest(), catalog)).toMatchObject({ status: "unsupported", code: "RULES_NOT_APPROVED" });
  });
  it("validates current HP against the resolved maximum", () => {
    for (const actor of ["attacker", "defender"] as const) {
      const request = makeDamageRequest(); Object.assign(request[actor], { currentHp: 176 });
      expect(calculate(request)).toMatchObject({ status: "invalid", code: "CURRENT_HP_EXCEEDS_MAX" });
    }
  });
  it("preserves hidden special stats and uses category-specific attack/defense", () => {
    const request = makeDamageRequest(); request.defender.statPoints.spDefense = 32;
    expect(ok(calculate(request)).range.max).toBe(44);
    request.moveId = "fixture-special";
    expect(ok(calculate(request)).range.max).toBeLessThan(44);
  });
});

describe("ENG-D04/06: ordered provisional condition pipeline", () => {
  it("applies dual types and STAB independently and never silently defaults a chart cell", () => {
    const catalog = makeEngineCatalog(); const request = makeDamageRequest();
    catalog.master.forms[0]!.types = ["fire"]; expect(ok(calculate(request, catalog)).range.max).toBe(66);
    catalog.master.forms[1]!.types = ["water"]; expect(ok(calculate(request, catalog)).range.max).toBe(33);
    catalog.master.forms[1]!.types = ["water", "plain"]; expect(ok(calculate(request, catalog)).range.max).toBe(33);
    delete catalog.typeChart.fire!.water;
    expect(calculate(request, catalog)).toMatchObject({ status: "unsupported", code: "TYPE_CHART_INCOMPLETE" });
  });
  it("reports type immunity as 0, not the minimum-one rule", () => {
    const catalog = makeEngineCatalog(); catalog.master.forms[1]!.types = ["ghost"];
    const request = makeDamageRequest(); request.moveId = "fixture-fixed";
    const result = ok(calculate(request, catalog)); expect(result.range).toEqual({ min: 0, max: 0 }); expect(result.ko.kind).toBe("immune");
  });
  it.each([["sun", 66], ["rain", 22]] as const)("applies %s before random rolls", (weather, damage) => {
    const request = makeDamageRequest(); request.conditions.weather = weather;
    expect(ok(calculate(request)).range.max).toBe(damage);
  });
  it("applies spread only to an explicitly spread move actually hitting multiple targets", () => {
    const request = makeDamageRequest(); request.format = "doubles";
    expect(ok(calculate(request)).range.max).toBe(44);
    request.conditions.targetsActuallyHit = 2;
    expect(calculate(request)).toMatchObject({ status: "invalid", code: "SINGLE_TARGET_COUNT" });
    request.moveId = "test-unlearned";
    expect(ok(calculate(request)).range.max).toBe(33);
    request.conditions.targetsActuallyHit = 1;
    expect(ok(calculate(request)).range.max).toBe(44);
  });
  it("handles physical/special walls and doubles' explicit fixture coefficient", () => {
    const request = makeDamageRequest(); request.conditions.reflectOnDefenderSide = true;
    expect(ok(calculate(request)).range.max).toBe(22);
    request.format = "doubles"; expect(ok(calculate(request)).range.max).toBe(29);
    request.moveId = "fixture-special"; expect(ok(calculate(request)).range.max).toBe(44);
    request.conditions.lightScreenOnDefenderSide = true; expect(ok(calculate(request)).range.max).toBe(29);
  });
  it("does not stack Aurora Veil with another wall", () => {
    const request = makeDamageRequest(); request.conditions.reflectOnDefenderSide = true; request.conditions.auroraVeilOnDefenderSide = true;
    expect(ok(calculate(request)).range.max).toBe(22);
  });
  it("ignores negative attack stage, positive defense stage and walls on critical", () => {
    const request = makeDamageRequest(); request.conditions.critical = true;
    const baseline = ok(calculate(request)).rolls;
    request.attacker.stages.attack = -6; request.defender.stages.defense = 6; request.conditions.reflectOnDefenderSide = true;
    const result = ok(calculate(request)); expect(result.rolls).toEqual(baseline);
    expect(result.trace.some(t => t.suppressed && t.reason === "critical")).toBe(true);
  });
  it("burns physical attacks only; Helping Hand belongs to power, not final damage", () => {
    const request = makeDamageRequest(); request.attacker.status = "burn";
    expect(ok(calculate(request)).range.max).toBe(22);
    request.moveId = "fixture-special"; expect(ok(calculate(request)).range.max).toBe(44);
    request.attacker.status = "none"; request.conditions.helpingHand = true;
    expect(ok(calculate(request)).range.max).toBe(65);
  });
  it("computes remaining HP from current HP and damage % from max HP", () => {
    const request = makeDamageRequest(); Object.assign(request.defender, { currentHp: 40 });
    const result = ok(calculate(request)); expect(result.remainingHp).toEqual({ min: 0, max: 3 });
    expect(result.damagePercent.max).toEqual({ numerator: "176", denominator: "7" });
    expect(result.ko.earliestHits).toBe(1);
  });
});

describe("ENG-D05/07/08/09/13: explicit support and effect classification", () => {
  it.each(["terrain", "snow", "sand", "supplementary"])("refuses unresolved %s conditions", condition => {
    const request = makeDamageRequest();
    if (condition === "terrain") request.conditions.terrain = "electric";
    else if (condition === "supplementary") Object.assign(request.conditions, { supplementary: [{ kind: "allyAbility", abilityId: "test-ability", isActive: true }] });
    else request.conditions.weather = condition;
    expect(calculate(request).status).toBe("unsupported");
  });
  it("requires explicit current HP for an implemented HP-scaled move", () => {
    const request = makeDamageRequest(); request.moveId = "fixture-hp";
    expect(calculate(request)).toMatchObject({ status: "missingContext", missingKeys: ["attacker.currentHp"] });
    Object.assign(request.attacker, { currentHp: 1 });
    expect(ok(calculate(request)).range.max).toBe(2);
  });
  it("distinguishes fixed damage, non-damaging and unsupported multi-hit", () => {
    const request = makeDamageRequest(); request.moveId = "fixture-fixed";
    expect(ok(calculate(request)).rolls).toEqual([50]);
    request.moveId = "fixture-status"; expect(calculate(request).status).toBe("nonDamaging");
    request.moveId = "fixture-multi"; expect(calculate(request)).toMatchObject({ status: "unsupported", code: "UNVERIFIED_MULTI_HIT" });
  });
  it("does not neutralize custom items, unclassified effects or missing form mechanics", () => {
    const request = makeDamageRequest(); Object.assign(request.attacker, { item: { kind: "customText", text: "unknown" } });
    expect(calculate(request)).toMatchObject({ status: "unsupported", code: "UNRESOLVED_ITEM" });
    const catalog = makeEngineCatalog(); Reflect.deleteProperty(catalog.effects, "test-effect");
    expect(calculate(makeDamageRequest(), catalog)).toMatchObject({ status: "unsupported", code: "EFFECT_UNCLASSIFIED" });
    const unclassified = makeEngineCatalog(); unclassified.master.abilities[0]!.effectIds = [];
    expect(calculate(makeDamageRequest(), unclassified)).toMatchObject({ status: "unsupported", code: "EFFECT_UNCLASSIFIED" });
    const forms = makeEngineCatalog(); delete forms.formRules["test-form-1"];
    expect(calculate(makeDamageRequest(), forms)).toMatchObject({ status: "unsupported", code: "FORM_RULE_UNSUPPORTED" });
  });
  it("stops before immunity if an effect or source inclusion is unsupported", () => {
    const catalog = makeEngineCatalog(); catalog.master.effects[0]!.support = "unsupported";
    catalog.master.forms[1]!.types = ["ghost"];
    const request = makeDamageRequest(); request.moveId = "fixture-fixed";
    expect(calculate(request, catalog).status).toBe("unsupported");
    const unconfirmed = makeEngineCatalog(); unconfirmed.master.forms[0]!.inclusion = "unconfirmed";
    expect(calculate(makeDamageRequest(), unconfirmed).status).toBe("unsupported");
  });
  it("applies an explicitly defined synthetic attack effect in A1, never in F4", () => {
    const catalog = makeEngineCatalog();
    catalog.master.effects.push({ id: "fixture-double", support: "supported_unverified", evidenceIds: [], optionIds: [] });
    catalog.master.abilities[0]!.effectIds = ["fixture-double"];
    Object.assign(catalog.effects, { "fixture-double": { kind: "multiplier", phase: "A1", scope: "attacker", category: "physical", factor4096: 8192, order: 1 } });
    const result = ok(calculate(makeDamageRequest(), catalog));
    expect(result.range.max).toBe(86);
    expect(result.trace.filter(t => t.effectId === "fixture-double" && !t.suppressed).every(t => t.phase === "A1")).toBe(true);
  });
  it("rejects ambiguous same-phase stacking order", () => {
    const catalog = makeEngineCatalog();
    for (const id of ["fixture-a", "fixture-b"]) {
      catalog.master.effects.push({ id, support: "supported_unverified", evidenceIds: [], optionIds: [] });
      Object.assign(catalog.effects, { [id]: { kind: "multiplier", phase: "F4", scope: "move", category: "any", factor4096: 6144, order: 1 } });
    }
    catalog.master.moves[0]!.effectIds = ["fixture-a", "fixture-b"];
    expect(calculate(makeDamageRequest(), catalog)).toMatchObject({ status: "unsupported", code: "AMBIGUOUS_EFFECT_ORDER" });
  });
  it.each([["P1", "move", 6144, 65], ["D1", "defender", 6144, 30], ["F4", "move", 5324, 57]] as const)("uses synthetic %s effect at its declared phase", (phase, scope, factor4096, expected) => {
    const catalog = makeEngineCatalog();
    catalog.master.effects.push({ id: "fixture-phase", support: "supported_unverified", evidenceIds: [], optionIds: [] });
    catalog.master.moves[0]!.effectIds = scope === "move" ? ["fixture-phase"] : ["test-effect"];
    if (scope === "defender") catalog.master.abilities[0]!.effectIds = ["fixture-phase"];
    Object.assign(catalog.effects, { "fixture-phase": { kind: "multiplier", phase, scope, category: "physical", factor4096, order: 1 } });
    expect(ok(calculate(makeDamageRequest(), catalog)).range.max).toBe(expected);
  });
  it("supports explicit synthetic immunity while retaining the 16-roll distribution", () => {
    const catalog = makeEngineCatalog();
    Object.assign(catalog.effects["test-effect"], { kind: "immunity", scope: "defender", type: "fire" });
    const result = ok(calculate(makeDamageRequest(), catalog));
    expect(result.rolls).toEqual(Array(16).fill(0)); expect(result.distribution).toEqual([{ damage: 0, count: 16 }]);
  });
  it("rejects duplicate types in a trusted catalog instead of applying them twice", () => {
    const catalog = makeEngineCatalog(); catalog.master.forms[1]!.types = ["water", "water"];
    expect(() => createDamageEngine(catalog)).toThrow();
  });
  it("returns no partial damage when KO work exceeds the bounded analysis", () => {
    const catalog = makeEngineCatalog(); catalog.master.forms[1]!.baseStats.hp = 10_000;
    catalog.moves["test-move"].power = 1;
    const result = calculate(makeDamageRequest(), catalog);
    expect(result).toMatchObject({ status: "unsupported", code: "KO_RESOURCE_LIMIT" });
    expect(result).not.toHaveProperty("rolls"); expect(result).not.toHaveProperty("range");
  });
});

describe("ENG-D11: same core for normal and TOP50", () => {
  it("evaluates 200 cells, preserves partial failures, and equals normal results", () => {
    const catalog = makeEngineCatalog(); const engine = createDamageEngine(catalog); const request = makeDamageRequest();
    const common = { format: request.format, attacker: request.attacker, moves: ["test-move", "fixture-special", "fixture-multi", "fixture-fixed"], conditions: request.conditions, sourceVersions: request.sourceVersions };
    const entries = catalog.master.forms.map((f, i) => ({ rankingEntryId: `entry-${i}`, rank: i + 1, pokemonFormId: f.id, usageRate: null, buildOrigin: "estimated", representativeBuild: { ...makeBuild(f.id), statPoints: request.defender.statPoints, origin: "estimated" }, warnings: [] }));
    const ranking = { snapshotId: "snapshot", format: "singles", regulationId: request.sourceVersions.regulationId, sourceId: "fixture", sourceGeneratedAt: null, upstreamPublishedAt: null, fetchedAt: "2026-10-24T00:00:00Z", verificationStatus: "unverified", rankingProvenance: "unverified_rank", attribution: { label: "synthetic", url: "https://example.com" }, entries };
    const top = engine.calculateTop50({ ...common, rankingSnapshotId: "snapshot", defenderOverrides: {} }, ranking);
    expect(top.status).toBe("ok");
    if (top.status !== "ok") throw new Error(top.code);
    expect(top.cells).toHaveLength(200); expect(top.cells.filter(c => c.result.status === "unsupported")).toHaveLength(50);
    const normal = engine.calculateNormal({ ...common, defender: entries[0]!.representativeBuild });
    expect(normal.status).toBe("ok");
    if (normal.status === "ok") expect(top.cells.slice(0, 4).map(c => c.result)).toEqual(normal.results);
    expect(engine.calculateTop50({ ...common, rankingSnapshotId: "other", defenderOverrides: {} }, ranking).status).toBe("invalid");
  });
  it("isolates missing representative builds and honors only matching entry overrides", () => {
    const { catalog, input, ranking } = makeTop50Fixture(); const engine = createDamageEngine(catalog);
    Object.assign(ranking.entries[0]!, { representativeBuild: null, buildOrigin: "incomplete" });
    const missing = engine.calculateTop50(input, ranking);
    expect(missing.status).toBe("ok");
    if (missing.status === "ok") {
      expect(missing.cells[0]!.result.status).toBe("missingContext");
      expect(missing.cells[4]!.result.status).toBe("ok");
    }
    const override = makeBuild("test-form-1"); override.statPoints = { hp: 32, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };
    const resolved = engine.calculateTop50({ ...input, defenderOverrides: { "entry-0": override } }, ranking);
    if (resolved.status !== "ok") throw new Error(resolved.code);
    const first = resolved.cells[0]!.result;
    expect(first.status).toBe("ok"); if (first.status === "ok") expect(first.maximumHp).toBe(207);
    expect(engine.calculateTop50({ ...input, defenderOverrides: { "1": override } }, ranking).status).toBe("invalid");
    expect(engine.calculateTop50({ ...input, defenderOverrides: { "entry-1": override } }, ranking).status).toBe("invalid");
    expect(engine.calculateTop50({ ...input, format: "doubles" }, ranking).status).toBe("invalid");
  });
  it("can evaluate four unsupported moves without a numeric success cell", () => {
    const { catalog, input, ranking } = makeTop50Fixture();
    input.moves = Array(4).fill("fixture-multi");
    const result = createDamageEngine(catalog).calculateTop50(input, ranking);
    if (result.status !== "ok") throw new Error(result.code);
    expect(result.cells).toHaveLength(200);
    expect(result.cells.every(cell => cell.result.status === "unsupported" && !("rolls" in cell.result))).toBe(true);
  });
});
