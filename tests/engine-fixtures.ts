// Explicit synthetic rulebook. No Champions master, approval, or L3 evidence.
import { makeBuild, makeCatalog, makeSnapshot } from "./fixtures";

export function makeEngineCatalog() {
  const master = makeCatalog();
  master.forms = master.forms.map(f => ({ ...f, types: ["plain"], baseStats: { hp: 100, attack: 162, defense: 169, spAttack: 162, spDefense: 169, speed: 100 } }));
  master.effects[0]!.support = "supported_unverified";
  Object.assign(master.items[0]!, { effectIds: ["test-effect"] });
  for (const id of ["fixture-special", "fixture-status", "fixture-fixed", "fixture-hp", "fixture-multi"]) master.moves.push({ ...master.moves[0]!, id });
  const types = ["plain", "fire", "water", "ghost"];
  const typeChart = Object.fromEntries(types.map(a => [a, Object.fromEntries(types.map(d => [d, 1]))]));
  typeChart.fire!.water = 0.5; typeChart.water!.fire = 2; typeChart.plain!.ghost = 0;
  return {
    execution: "fixture", master,
    rules: { rulesetId: "champions", sourceVersions: { ...master.sourceVersions }, verification: "fixture_only", sourceIds: ["handoff:docs/04", "synthetic:test-only"],
      modifiers: { spread: 3072, weatherBoost: 6144, weatherWeaken: 2048, critical: 6144, stab: 6144, burn: 2048, screenSingles: 2048, screenDoubles: 2732, helpingHand: 6144 } },
    typeChart,
    formRules: Object.fromEntries(master.forms.map(f => [f.id, { statModel: "standard" }])),
    moves: {
      "test-move": { model: "standard", category: "physical", type: "fire", power: 100, target: "single" },
      "test-unlearned": { model: "standard", category: "physical", type: "fire", power: 100, target: "spread" },
      "fixture-special": { model: "standard", category: "special", type: "fire", power: 100, target: "single" },
      "fixture-status": { model: "nonDamaging" },
      "fixture-fixed": { model: "fixed", type: "plain", damage: 50 },
      "fixture-hp": { model: "hpScaled", category: "special", type: "fire", power: 150, target: "single" },
      "fixture-multi": { model: "unsupported", reason: "UNVERIFIED_MULTI_HIT" },
    },
    effects: { "test-effect": { kind: "neutral" } },
  };
}
export function makeDamageRequest() {
  const normal = makeSnapshot().input;
  const attacker = makeBuild(); const defender = makeBuild("test-form-2");
  for (const build of [attacker, defender]) build.statPoints = { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };
  return { format: "singles", attacker, defender, moveId: "test-move", conditions: normal.conditions, sourceVersions: normal.sourceVersions };
}

export function makeTop50Fixture() {
  const catalog = makeEngineCatalog(); const request = makeDamageRequest();
  const input = { format: request.format, attacker: request.attacker, moves: ["test-move", "fixture-special", "fixture-multi", "fixture-fixed"], conditions: request.conditions, sourceVersions: request.sourceVersions, rankingSnapshotId: "snapshot", defenderOverrides: {} };
  const entries = catalog.master.forms.map((f, i) => ({ rankingEntryId: `entry-${i}`, rank: i + 1, pokemonFormId: f.id, usageRate: null, buildOrigin: "estimated", representativeBuild: { ...makeBuild(f.id), statPoints: request.defender.statPoints, origin: "estimated" }, warnings: [] }));
  const ranking = { snapshotId: "snapshot", format: "singles", regulationId: request.sourceVersions.regulationId, sourceId: "fixture", sourceGeneratedAt: null, upstreamPublishedAt: null, fetchedAt: "2026-10-24T00:00:00Z", verificationStatus: "unverified", rankingProvenance: "unverified_rank", attribution: { label: "synthetic", url: "https://example.com" }, entries };
  return { catalog, input, ranking };
}
