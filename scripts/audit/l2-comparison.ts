/** Test-only independent comparison. Never imported by application/runtime code. */
import { calculate, Field, Generations, Move, Pokemon, toID, type StatsTable } from "@smogon/calc";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createDamageEngine } from "../../src/lib/engine/engine";
import { damageRequestSchema, engineCatalogSchema, type DamageRequest, type EngineCatalog } from "../../src/lib/engine/contracts";
import { resolveStats, type Stats } from "../../src/lib/engine/math";
import { championsTypeChart, championsTypes } from "../../src/lib/engine/champions-rules";
import { championsMoveDefinitions } from "../../src/lib/engine/champions-moves";
import { makeNamedMoveFixture, type NamedMove } from "../../tests/champions-moves-fixtures";
import { makeChampionsFixture, type NamedEffect } from "../../tests/champions-effects-fixtures";
import { makeDamageRequest, makeEngineCatalog } from "../../tests/engine-fixtures";

const gen = Generations.get(0);
const names = { plain: "Normal", normal: "Normal", fire: "Fire", water: "Water", electric: "Electric", grass: "Grass", ice: "Ice", fighting: "Fighting", poison: "Poison", ground: "Ground", flying: "Flying", psychic: "Psychic", bug: "Bug", rock: "Rock", ghost: "Ghost", dragon: "Dragon", dark: "Dark", steel: "Steel", fairy: "Fairy" } as const;
const effectNames = { technician: "Technician", hugePower: "Huge Power", lifeOrb: "Life Orb" } as const;
function effectiveReferenceEffect(catalog: EngineCatalog, request: DamageRequest, owner: "attacker" | "defender", effectIds: string[]) {
  for (const id of effectIds) {
    const def = catalog.effects[id];
    if (def?.kind === "championsDefense") {
      const state = request.conditions.supplementary.find(s => s.kind === "moveEffect" && s.effectId === id);
      if (state?.kind === "moveEffect" && state.optionId !== "active-single-hit-clear-field") throw new Error("No equal-condition defense reference mapping");
      // Keep the actual named effect even when its trigger is false. Never substitute
      // No Ability/empty item to manufacture a suppression comparison.
      return { levitate: "Levitate", airBalloon: "Air Balloon", multiscale: "Multiscale" }[def.name];
    }
    if (def?.kind !== "champions") continue;
    // Suppression itself is not simulated: compare explicitly resolved effective states.
    const state = request.conditions.supplementary.find(s => s.kind === "moveEffect" && s.effectId === id);
    if (owner === "defender" || (state?.kind === "moveEffect" && state.optionId === "active")) return effectNames[def.name];
  }
  return undefined;
}
const statMap = { hp: "hp", attack: "atk", defense: "def", spAttack: "spa", spDefense: "spd", speed: "spe" } as const;
function mapped(stats: Stats): StatsTable {
  return Object.fromEntries(Object.entries(statMap).map(([ours, theirs]) => [theirs, stats[ours as keyof Stats]])) as StatsTable;
}
function referencePokemon(catalog: EngineCatalog, request: DamageRequest, owner: "attacker" | "defender", nature?: string) {
  const build = request[owner];
  const form = catalog.master.forms.find(f => f.id === build.pokemonFormId)!;
  const types = form.types.map(t => names[t as keyof typeof names]);
  if (types.some(t => !t) || types.length > 2) throw new Error("Unmapped type");
  return new Pokemon(gen, "Mew", {
    ability: effectiveReferenceEffect(catalog, request, owner, catalog.master.abilities.find(a => a.id === build.abilityId)?.effectIds ?? []) ?? "No Ability",
    item: effectiveReferenceEffect(catalog, request, owner, build.item.kind === "known" ? catalog.master.items.find(i => i.id === (build.item.kind === "known" ? build.item.itemId : ""))?.effectIds ?? [] : []) ?? "", nature: nature ?? (build.natureId === "test-up" ? "Adamant" : "Serious"),
    evs: mapped(build.statPoints), boosts: mapped({ hp: 0, ...build.stages }),
    status: build.status === "burn" ? "brn" : "", curHP: build.currentHp ?? undefined,
    overrides: { baseStats: mapped(form.baseStats!), types: types as Pokemon["types"] },
  });
}
function referenceSnapshot(pokemon: Pokemon) {
  return { name: pokemon.name, baseStats: pokemon.species.baseStats, types: pokemon.types,
    level: pokemon.level, ability: pokemon.ability, item: pokemon.item, nature: pokemon.nature,
    statPointsInEvs: pokemon.evs, boosts: pokemon.boosts, rawStats: pokemon.rawStats,
    currentHp: pokemon.curHP(), status: pokemon.status };
}
function localStats(catalog: EngineCatalog, request: DamageRequest, owner: "attacker" | "defender") {
  const form = catalog.master.forms.find(f => f.id === request[owner].pokemonFormId)!;
  const model = catalog.formRules[form.id]!.statModel;
  if (model === "unsupported") throw new Error("Unmapped stat model");
  return mapped(resolveStats(form.baseStats!, request[owner], model));
}
function fixture() {
  const catalog = engineCatalogSchema.parse(makeEngineCatalog());
  // Explicit, limited real type interactions; not copied from the reference at runtime.
  catalog.typeChart.fire = { plain: 1, fire: 0.5, water: 0.5, ghost: 1, grass: 2, steel: 2 };
  catalog.typeChart.plain = { plain: 1, fire: 1, water: 1, ghost: 0, grass: 1, steel: 0.5 };
  return { catalog, request: damageRequestSchema.parse(makeDamageRequest()) };
}
type Setup = ReturnType<typeof fixture>;
type Case = { id: string; edit?: (setup: Setup) => void };
const cases: Case[] = [
  { id: "base-44" },
  { id: "special", edit: ({ request: r }) => { r.moveId = "fixture-special"; } },
  { id: "stab", edit: ({ catalog: c }) => { c.master.forms[0]!.types = ["fire"]; } },
  { id: "resist-half", edit: ({ catalog: c }) => { c.master.forms[1]!.types = ["water"]; } },
  { id: "weak-double", edit: ({ catalog: c }) => { c.master.forms[1]!.types = ["grass"]; } },
  { id: "weak-quad", edit: ({ catalog: c }) => { c.master.forms[1]!.types = ["grass", "steel"]; } },
  { id: "resist-quarter", edit: ({ catalog: c }) => { c.master.forms[1]!.types = ["fire", "water"]; } },
  { id: "immune", edit: ({ catalog: c }) => { c.moves["test-move"] = { model: "standard", category: "physical", type: "plain", power: 100, target: "single" }; c.master.forms[1]!.types = ["ghost"]; } },
  { id: "sun", edit: ({ request: r }) => { r.conditions.weather = "sun"; } },
  { id: "rain", edit: ({ request: r }) => { r.conditions.weather = "rain"; } },
  { id: "critical", edit: ({ request: r }) => { r.conditions.critical = true; } },
  { id: "stages", edit: ({ request: r }) => { r.attacker.stages.attack = 2; r.defender.stages.defense = -1; } },
  { id: "critical-ignores-stages", edit: ({ request: r }) => { r.conditions.critical = true; r.attacker.stages.attack = -2; r.defender.stages.defense = 3; } },
  { id: "critical-keeps-stages", edit: ({ request: r }) => { r.conditions.critical = true; r.attacker.stages.attack = 1; r.defender.stages.defense = -1; } },
  { id: "reflect-singles", edit: ({ request: r }) => { r.conditions.reflectOnDefenderSide = true; } },
  { id: "reflect-doubles", edit: ({ request: r }) => { r.format = "doubles"; r.conditions.reflectOnDefenderSide = true; } },
  { id: "light-screen", edit: ({ request: r }) => { r.moveId = "fixture-special"; r.conditions.lightScreenOnDefenderSide = true; } },
  { id: "veil-no-stack", edit: ({ request: r }) => { r.conditions.reflectOnDefenderSide = true; r.conditions.auroraVeilOnDefenderSide = true; } },
  { id: "critical-ignores-wall", edit: ({ request: r }) => { r.conditions.critical = true; r.conditions.reflectOnDefenderSide = true; } },
  { id: "burn", edit: ({ request: r }) => { r.attacker.status = "burn"; } },
  { id: "special-burn", edit: ({ request: r }) => { r.attacker.status = "burn"; r.moveId = "fixture-special"; } },
  { id: "spread-two", edit: ({ request: r }) => { r.format = "doubles"; r.moveId = "test-unlearned"; r.conditions.targetsActuallyHit = 2; } },
  { id: "helping-hand", edit: ({ request: r }) => { r.conditions.helpingHand = true; } },
  { id: "combined-rounding", edit: ({ catalog: c, request: r }) => { c.master.forms[0]!.types = ["fire"]; c.master.forms[1]!.types = ["water"]; r.format = "doubles"; r.moveId = "test-unlearned"; r.conditions.targetsActuallyHit = 2; r.conditions.weather = "sun"; r.conditions.reflectOnDefenderSide = true; r.attacker.status = "burn"; r.conditions.helpingHand = true; } },
];
export function compareL2Setup(id: string, setup: Setup, referenceName?: string) {
    const { catalog, request: r } = setup;
    const model = catalog.moves[r.moveId]!;
    if (model.model !== "standard" && !(referenceName && ["hpScaled", "nonDamaging"].includes(model.model))) throw new Error("Unmapped comparison model");
    const attacker = referencePokemon(catalog, r, "attacker");
    const defender = referencePokemon(catalog, r, "defender");
    const aligned = JSON.stringify(attacker.rawStats) === JSON.stringify(localStats(catalog, r, "attacker")) && JSON.stringify(defender.rawStats) === JSON.stringify(localStats(catalog, r, "defender"));
    const move = referenceName ? new Move(gen, referenceName, { isCrit: r.conditions.critical }) : new Move(gen, "L2 Synthetic Move", { isCrit: r.conditions.critical, overrides: {
      flags: {}, basePower: model.model === "standard" ? model.power : 0, type: model.model === "standard" ? names[model.type as keyof typeof names] : "Normal", category: model.model === "standard" && model.category === "physical" ? "Physical" : "Special",
      target: model.model === "standard" && model.target === "spread" ? "allAdjacentFoes" : "normal",
    } });
    const field = new Field({ gameType: r.format === "doubles" ? "Doubles" : "Singles",
      weather: r.conditions.weather === "sun" ? "Sun" : r.conditions.weather === "rain" ? "Rain" : undefined,
      attackerSide: { isHelpingHand: r.conditions.helpingHand },
      defenderSide: { isReflect: r.conditions.reflectOnDefenderSide, isLightScreen: r.conditions.lightScreenOnDefenderSide, isAuroraVeil: r.conditions.auroraVeilOnDefenderSide },
    });
    const independent = calculate(gen, attacker, defender, move, field);
    // Reference represents immunity as scalar zero; normalize only that degenerate distribution.
    const reference = independent.damage === 0 ? Array<number>(16).fill(0) : independent.damage;
    const own = createDamageEngine(catalog).calculateDamage(r);
    if (model.model === "nonDamaging") {
      if (own.status !== "nonDamaging") throw new Error(`${id}: ${own.status}`);
      return { id, kind: "nonDamaging" as const, aligned, classification: aligned && move.category === "Status" && independent.damage === 0 ? "一致" : "不一致", local: "nonDamaging", reference: move.category === "Status" && independent.damage === 0 ? "nonDamaging" : "unexpected", input: r, referenceInput: { name: move.name, category: move.category, damage: independent.damage }, localTrace: own.trace, gameVerified: own.gameVerified };
    }
    if (own.status !== "ok") throw new Error(`${id}: ${own.status}`);
    return { id, kind: "damage" as const, aligned, classification: aligned && JSON.stringify(reference) === JSON.stringify(own.rolls) ? "一致" : "不一致",
      local: own.rolls, reference, input: r, referenceInput: {
        attacker: referenceSnapshot(attacker), defender: referenceSnapshot(defender),
        move: { name: move.name, bp: move.bp, type: move.type, category: move.category, target: move.target, isCrit: move.isCrit, flags: move.flags }, field,
      }, localTrace: own.trace, gameVerified: own.gameVerified };
}
export function runL2Comparison() {
  const compared = cases.map(test => {
    const setup = fixture(); test.edit?.(setup);
    return compareL2Setup(test.id, setup);
  });
  const stats = ["neutral-zero", "adamant-points", "fixed-hp-one"].map(id => {
    const { catalog, request } = fixture();
    if (id === "adamant-points") { request.attacker.natureId = "test-up"; request.attacker.natureFactors = { ...request.attacker.natureFactors, attack: 1.1, spAttack: 0.9 }; request.attacker.statPoints = { hp: 32, attack: 32, defense: 2, spAttack: 0, spDefense: 0, speed: 0 }; }
    if (id === "fixed-hp-one") { catalog.master.forms[0]!.baseStats!.hp = 1; catalog.formRules["test-form-1"]!.statModel = "fixedHp1"; }
    const local = Object.values(localStats(catalog, request, "attacker"));
    const independent = referencePokemon(catalog, request, "attacker");
    const reference = Object.keys(statMap).map(k => independent.rawStats[statMap[k as keyof Stats]]);
    return { id, kind: "stats", aligned: true, classification: JSON.stringify(local) === JSON.stringify(reference) ? "一致" : "不一致", local, reference, input: request.attacker, base: catalog.master.forms[0]!.baseStats };
  });
  const { catalog, request } = fixture(); catalog.execution = "production";
  return {
    reference: { package: "@smogon/calc", version: "0.12.0", generation: gen.num, gitHead: "d7a69cf40616057ef40faf7623df7a628e58b535", license: "MIT" },
    gameVerified: false, compared: [...stats, ...compared],
    excluded: [
      { id: "spread-one-survivor", classification: "参照実装未対応", reason: "0.12.0 Field has no targetsActuallyHit; doubles spread is unconditional on allAdjacent/allAdjacentFoes. Do not substitute singles, which changes screens." },
      { id: "historical-fifteen-rolls", classification: "仕様未確認", reason: "No pinned game-version L3 evidence; current reference has sixteen rolls and cannot establish historical game behavior." },
      { id: "named-effects-catalog", classification: "仕様未確認", reason: "Real move/ability/item inclusion and per-effect Champions rules have not been integrated; no mass registration in Phase 2-A." },
    ],
    production: createDamageEngine(catalog).calculateDamage(request),
  };
}
export function runPhase2BL2Comparison() {
  const types = championsTypes.flatMap(attack => championsTypes.map(defense => {
    const reference = gen.types.get(toID(attack))?.effectiveness[names[defense]];
    const local = championsTypeChart[attack]![defense]!;
    return { id: `${attack}->${defense}`, local, reference, classification: local === reference ? "一致" : "不一致" };
  }));
  type EffectCase = Case & { effect: NamedEffect };
  const changePower = (f: Setup, power: number, category: "physical" | "special" = "physical") => { f.catalog.moves["test-move"] = { model: "standard", category, type: "fire", power, target: "single" }; };
  const suppress = (name: NamedEffect) => (f: Setup) => { f.request.conditions.supplementary = [{ kind: "moveEffect", effectId: `champions:${name}`, optionId: "suppressed" }]; };
  const orb = (f: Setup) => { f.request.attacker.item = { kind: "known", itemId: "fixture:lifeOrb" }; f.request.conditions.supplementary.push({ kind: "moveEffect", effectId: "champions:lifeOrb", optionId: "active" }); };
  const combinations = (f: Setup) => { f.catalog.master.forms[0]!.types = ["fire"]; f.catalog.master.forms[1]!.types = ["water"]; f.request.conditions.weather = "sun"; f.request.conditions.reflectOnDefenderSide = true; f.request.attacker.status = "burn"; };
  const effectCases: EffectCase[] = [
    ...[1, 59, 60, 61, 95].map(power => ({ id: `technician-power-${power}`, effect: "technician" as const, edit: (f: Setup) => changePower(f, power) })),
    { id: "technician-special-60", effect: "technician", edit: f => changePower(f, 60, "special") },
    { id: "technician-helping-hand-before-threshold", effect: "technician", edit: f => { changePower(f, 60); f.request.conditions.helpingHand = true; } },
    { id: "technician-orb-compound", effect: "technician", edit: f => { changePower(f, 60); orb(f); combinations(f); } },
    { id: "technician-suppressed", effect: "technician", edit: f => { changePower(f, 60); suppress("technician")(f); } },
    { id: "huge-power-physical", effect: "hugePower" },
    { id: "huge-power-special-inactive", effect: "hugePower", edit: f => changePower(f, 100, "special") },
    { id: "huge-power-negative-stage-truncation", effect: "hugePower", edit: f => { f.request.attacker.stages.attack = -1; } },
    { id: "huge-power-critical", effect: "hugePower", edit: f => { f.request.conditions.critical = true; f.request.attacker.stages.attack = -1; } },
    { id: "huge-power-burn", effect: "hugePower", edit: f => { f.request.attacker.status = "burn"; } },
    { id: "huge-power-orb-compound", effect: "hugePower", edit: f => { orb(f); combinations(f); } },
    { id: "huge-power-suppressed", effect: "hugePower", edit: suppress("hugePower") },
    { id: "life-orb-physical", effect: "lifeOrb" },
    { id: "life-orb-special", effect: "lifeOrb", edit: f => changePower(f, 100, "special") },
    { id: "life-orb-suppressed", effect: "lifeOrb", edit: suppress("lifeOrb") },
    { id: "life-orb-compound", effect: "lifeOrb", edit: combinations },
    { id: "life-orb-doubles-wall", effect: "lifeOrb", edit: f => { f.request.format = "doubles"; f.request.conditions.reflectOnDefenderSide = true; } },
    { id: "life-orb-spread-two", effect: "lifeOrb", edit: f => { f.request.format = "doubles"; f.request.moveId = "test-unlearned"; f.request.conditions.targetsActuallyHit = 2; } },
    { id: "life-orb-type-immune", effect: "lifeOrb", edit: f => { f.catalog.moves["test-move"] = { model: "standard", category: "physical", type: "normal", power: 100, target: "single" }; f.catalog.master.forms[1]!.types = ["ghost"]; } },
    { id: "life-orb-odd-power", effect: "lifeOrb", edit: f => changePower(f, 103) },
  ];
  const effects = effectCases.map(test => { const setup = makeChampionsFixture(test.effect); test.edit?.(setup); return compareL2Setup(test.id, setup); });
  return { reference: { package: "@smogon/calc", version: "0.12.0", generation: gen.num, gitHead: "d7a69cf40616057ef40faf7623df7a628e58b535" }, gameVerified: false, types, effects };
}
export function runPhase2B2L2Comparison() {
  const models = (["earthquake", "rockSlide", "flamethrower", "waterSpout", "protect"] as NamedMove[]).map(id => {
    const declared = championsMoveDefinitions[id]; const move = new Move(gen, declared.referenceName);
    const reference = { power: move.bp, type: move.type, category: move.category, target: move.target, priority: move.priority };
    return { id, listed: !!gen.moves.get(toID(declared.referenceName)), local: declared.reference, reference, classification: JSON.stringify(declared.reference) === JSON.stringify(reference) ? "一致" : "不一致" };
  });
  type MoveCase = Case & { move: NamedMove; effect?: NamedEffect };
  const doubles = (f: Setup) => { f.request.format = "doubles"; f.request.conditions.targetsActuallyHit = 2; };
  const stabWeak = (f: Setup, attack: string, defense: string) => { f.catalog.master.forms[0]!.types = [attack]; f.catalog.master.forms[1]!.types = [defense]; };
  const rows: MoveCase[] = [
    { id: "eq-singles", move: "earthquake" },
    { id: "eq-doubles-two", move: "earthquake", edit: doubles },
    { id: "eq-doubles-three", move: "earthquake", edit: f => { doubles(f); f.request.conditions.targetsActuallyHit = 3; } },
    { id: "eq-huge-power", move: "earthquake", effect: "hugePower" },
    { id: "eq-life-orb", move: "earthquake", effect: "lifeOrb" },
    { id: "eq-technician-inactive", move: "earthquake", effect: "technician" },
    { id: "eq-rain-neutral", move: "earthquake", edit: f => { f.request.conditions.weather = "rain"; } },
    { id: "eq-critical-burn-stab-weak", move: "earthquake", edit: f => { stabWeak(f,"ground","electric"); f.request.conditions.critical = true; f.request.attacker.status = "burn"; } },
    { id: "rock-singles", move: "rockSlide" },
    { id: "rock-doubles-two", move: "rockSlide", edit: doubles },
    { id: "rock-huge-power", move: "rockSlide", effect: "hugePower" },
    { id: "rock-life-orb", move: "rockSlide", effect: "lifeOrb" },
    { id: "rock-technician-inactive", move: "rockSlide", effect: "technician" },
    { id: "rock-stab-weak-sun", move: "rockSlide", edit: f => { stabWeak(f,"rock","fire"); f.request.conditions.weather = "sun"; } },
    { id: "flame-neutral", move: "flamethrower" },
    { id: "flame-sun", move: "flamethrower", edit: f => { f.request.conditions.weather = "sun"; } },
    { id: "flame-rain", move: "flamethrower", edit: f => { f.request.conditions.weather = "rain"; } },
    { id: "flame-stab-quad", move: "flamethrower", edit: f => { stabWeak(f,"fire","grass"); f.catalog.master.forms[1]!.types.push("steel"); } },
    { id: "flame-technician-inactive", move: "flamethrower", effect: "technician" },
    { id: "flame-huge-power-inactive", move: "flamethrower", effect: "hugePower" },
    { id: "flame-orb-sun-stab-resist", move: "flamethrower", effect: "lifeOrb", edit: f => { stabWeak(f,"fire","water"); f.request.conditions.weather = "sun"; } },
    { id: "spout-full", move: "waterSpout" },
    { id: "spout-hp87", move: "waterSpout", edit: f => { f.request.attacker.currentHp = 87; } },
    { id: "spout-hp1", move: "waterSpout", edit: f => { f.request.attacker.currentHp = 1; } },
    { id: "spout-technician-hp69", move: "waterSpout", effect: "technician", edit: f => { f.request.attacker.currentHp = 69; } },
    { id: "spout-technician-hp71-helping", move: "waterSpout", effect: "technician", edit: f => { f.request.attacker.currentHp = 71; f.request.conditions.helpingHand = true; } },
    { id: "spout-technician-hp72", move: "waterSpout", effect: "technician", edit: f => { f.request.attacker.currentHp = 72; } },
    { id: "spout-hp104-max207-orb", move: "waterSpout", effect: "lifeOrb", edit: f => { f.request.attacker.statPoints.hp = 32; f.request.attacker.currentHp = 104; } },
    { id: "spout-rain-orb-stab-resist", move: "waterSpout", effect: "lifeOrb", edit: f => { stabWeak(f,"water","grass"); f.request.conditions.weather = "rain"; } },
    { id: "spout-sun-half", move: "waterSpout", edit: f => { f.request.attacker.currentHp = 88; f.request.conditions.weather = "sun"; } },
    { id: "spout-huge-power-inactive", move: "waterSpout", effect: "hugePower" },
    { id: "spout-doubles-two", move: "waterSpout", edit: doubles },
    { id: "protect-neutral", move: "protect" },
    { id: "protect-technician", move: "protect", effect: "technician" },
    { id: "protect-orb", move: "protect", effect: "lifeOrb" },
  ];
  const compared = rows.map(row => {
    const f = makeNamedMoveFixture(row.move, row.effect);
    if (row.move === "waterSpout") f.request.attacker.currentHp = 175;
    row.edit?.(f);
    return compareL2Setup(row.id, f, championsMoveDefinitions[row.move].referenceName);
  });
  return { reference: { package: "@smogon/calc", version: "0.12.0", generation: gen.num, gitHead: "d7a69cf40616057ef40faf7623df7a628e58b535" }, gameVerified: false, models, compared,
    excluded: [
      ...["earthquake","rockSlide","waterSpout"].map(move => ({ id: `${move}-doubles-one-actual-hit`, classification: "参照実装未対応", reason: "Field has no actual-hit-count API. Compare singles and doubles >=2 only; one-hit doubles is covered locally, without mutating the reference target." })),
      { id: "earthquake-grassy-grounding", classification: "仕様未確認", reason: "Reference has Grassy Terrain logic, but application terrain/grounding interactions are not implemented/validated; engine returns unsupported. No numeric comparison performed." },
      { id: "protect-opponent-attack-resolution", classification: "仕様未確認", reason: "Only Status/nonDamaging classification tested. Protection turns, failure chance, bypass and incoming hits are not implemented." },
    ] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--phase2b2")) {
    const report = runPhase2B2L2Comparison();
    writeFileSync("docs/validation/phase-2b2-l2-results.json", `${JSON.stringify(report, null, 2)}\n`);
    const mismatches = [...report.models, ...report.compared].filter(r => r.classification !== "一致");
    console.log(JSON.stringify({ models: report.models.length, compared: report.compared.length, damage: report.compared.filter(r => r.kind === "damage").length, nonDamaging: report.compared.filter(r => r.kind === "nonDamaging").length, mismatches: mismatches.map(r => r.id), excluded: report.excluded }));
    if (mismatches.length) process.exitCode = 1;
  } else if (process.argv.includes("--phase2b")) {
    const report = runPhase2BL2Comparison();
    writeFileSync("docs/validation/phase-2b1-l2-results.json", `${JSON.stringify(report, null, 2)}\n`);
    const mismatches = [...report.types, ...report.effects].filter(r => r.classification !== "一致");
    console.log(JSON.stringify({ types: report.types.length, effects: report.effects.length, mismatches: mismatches.map(r => r.id) }));
    if (mismatches.length) process.exitCode = 1;
  } else {
    const report = runL2Comparison();
    writeFileSync("docs/validation/phase-2a-l2-results.json", `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ compared: report.compared.length, matches: report.compared.filter(r => r.classification === "一致").length, mismatches: report.compared.filter(r => r.classification === "不一致").map(r => r.id), excluded: report.excluded }));
  }
}
