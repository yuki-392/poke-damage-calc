/** Exact-condition, synthetic integration comparisons. No real master approval. */
import { Generations, Move, toID } from "@smogon/calc";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { championsMoveDefinitions } from "../../src/lib/engine/champions-moves";
import { championsDefenseDefinitions } from "../../src/lib/engine/champions-defense";
import { makeDefenseFixture, type DefenseName } from "../../tests/champions-defense-fixtures";
import { makeNamedMoveFixture, type NamedMove } from "../../tests/champions-moves-fixtures";
import type { NamedEffect } from "../../tests/champions-effects-fixtures";
import { compareL2Setup } from "./l2-comparison";
type Setup = ReturnType<typeof makeNamedMoveFixture>;
type Row = { id: string; defense?: DefenseName; move: NamedMove; offense?: NamedEffect; edit?: (f: Setup) => void };
const both = (f: Setup) => { f.request.format = "doubles"; f.request.conditions.targetsActuallyHit = 2; };
const types = (f: Setup, attacker: string, defender: string) => { f.catalog.master.forms[0]!.types = [attacker]; f.catalog.master.forms[1]!.types = [defender]; };
export function runPhase2B4L2Comparison() {
  const rows: Row[] = [];
  for (const defense of ["levitate", "airBalloon"] as const) {
    rows.push(
      { id: `${defense}-ground`, defense, move: "earthquake" },
      { id: `${defense}-ground-doubles`, defense, move: "earthquake", edit: both },
      { id: `${defense}-ground-huge`, defense, move: "earthquake", offense: "hugePower" },
      { id: `${defense}-ground-orb`, defense, move: "earthquake", offense: "lifeOrb" },
      { id: `${defense}-ground-stab-weak`, defense, move: "earthquake", edit: f => types(f, "ground", "electric") },
      { id: `${defense}-ground-flying-type`, defense, move: "earthquake", edit: f => types(f, "ground", "flying") },
      { id: `${defense}-shadow-inactive`, defense, move: "shadowBall", edit: f => types(f, "ghost", "psychic") },
      { id: `${defense}-rock-inactive`, defense, move: "rockSlide", edit: both },
      { id: `${defense}-flame-rain-inactive`, defense, move: "flamethrower", edit: f => { f.request.conditions.weather = "rain"; } },
    );
  }
  const multiscale: Omit<Row, "defense">[] = [
    { id: "ms-eq", move: "earthquake" },
    { id: "ms-eq-huge", move: "earthquake", offense: "hugePower" },
    { id: "ms-eq-orb", move: "earthquake", offense: "lifeOrb" },
    { id: "ms-eq-double-screen", move: "earthquake", edit: f => { both(f); f.request.conditions.reflectOnDefenderSide = true; } },
    { id: "ms-eq-burn-crit", move: "earthquake", edit: f => { f.request.attacker.status = "burn"; f.request.conditions.critical = true; } },
    { id: "ms-rock-double", move: "rockSlide", edit: both },
    { id: "ms-flame-sun-orb", move: "flamethrower", offense: "lifeOrb", edit: f => { types(f, "fire", "grass"); f.request.conditions.weather = "sun"; } },
    { id: "ms-spout-rain-orb", move: "waterSpout", offense: "lifeOrb", edit: f => { both(f); types(f, "water", "fire"); f.request.conditions.weather = "rain"; } },
    { id: "ms-spout-technician-rain", move: "waterSpout", offense: "technician", edit: f => { both(f); types(f, "water", "fire"); f.request.attacker.currentHp = 69; f.request.conditions.weather = "rain"; f.request.conditions.helpingHand = true; } },
    { id: "ms-shadow-stab-orb-crit-screen", move: "shadowBall", offense: "lifeOrb", edit: f => { types(f, "ghost", "psychic"); f.request.conditions.critical = true; f.request.conditions.lightScreenOnDefenderSide = true; } },
    { id: "ms-damaged-174", move: "earthquake", edit: f => { f.request.defender.currentHp = 174; } },
    { id: "ms-damaged-1", move: "shadowBall", edit: f => { f.request.defender.currentHp = 1; types(f, "ghost", "psychic"); } },
    { id: "ms-shadow-type-immune", move: "shadowBall" },
  ];
  rows.push(...multiscale.map(r => ({ ...r, defense: "multiscale" as const })));
  const shadow: Omit<Row, "move">[] = [
    { id: "shadow-neutral", edit: f => types(f, "normal", "water") },
    { id: "shadow-normal-immune" },
    { id: "shadow-dark-resist", edit: f => types(f, "normal", "dark") },
    { id: "shadow-ghost-weak", edit: f => types(f, "normal", "ghost") },
    { id: "shadow-stab-psychic", edit: f => types(f, "ghost", "psychic") },
    { id: "shadow-double-single-target", edit: f => { types(f, "ghost", "psychic"); f.request.format = "doubles"; } },
    { id: "shadow-sun", edit: f => { types(f, "normal", "water"); f.request.conditions.weather = "sun"; } },
    { id: "shadow-rain", edit: f => { types(f, "normal", "water"); f.request.conditions.weather = "rain"; } },
    { id: "shadow-orb", offense: "lifeOrb", edit: f => types(f, "ghost", "psychic") },
    { id: "shadow-huge-inactive", offense: "hugePower", edit: f => types(f, "normal", "psychic") },
    { id: "shadow-technician-inactive", offense: "technician", edit: f => types(f, "normal", "psychic") },
    { id: "shadow-burn-special", edit: f => { types(f, "normal", "psychic"); f.request.attacker.status = "burn"; } },
    { id: "shadow-double-screen-orb", offense: "lifeOrb", edit: f => { types(f, "ghost", "dark"); f.request.format = "doubles"; f.request.conditions.lightScreenOnDefenderSide = true; } },
    { id: "shadow-crit-screen", edit: f => { types(f, "ghost", "psychic"); f.request.conditions.critical = true; f.request.conditions.lightScreenOnDefenderSide = true; } },
  ];
  rows.push(...shadow.map(r => ({ ...r, move: "shadowBall" as const })));
  const compared = rows.map(row => {
    const f = row.defense ? makeDefenseFixture(row.defense, row.move, row.offense) : makeNamedMoveFixture(row.move, row.offense);
    if (row.move === "waterSpout") f.request.attacker.currentHp = 175;
    row.edit?.(f);
    return compareL2Setup(row.id, f, championsMoveDefinitions[row.move].referenceName);
  });
  const gen = Generations.get(0); const move = new Move(gen, "Shadow Ball");
  const models = [{ id: "shadowBall", listed: !!gen.moves.get(toID("Shadow Ball")),
    classification: JSON.stringify(championsMoveDefinitions.shadowBall.reference) === JSON.stringify({ power: move.bp, type: move.type, category: move.category, target: move.target, priority: move.priority }) ? "一致" : "不一致" }];
  const listed = [
    { name: "Levitate", listed: !!gen.abilities.get(toID("Levitate")) },
    { name: "Air Balloon", listed: !!gen.items.get(toID("Air Balloon")) },
    { name: "Multiscale", listed: !!gen.abilities.get(toID("Multiscale")) },
  ];
  return { reference: { package: "@smogon/calc", version: "0.12.0", generation: 0, gitHead: "d7a69cf40616057ef40faf7623df7a628e58b535" },
    gameVerified: false, compared, models, listed, ruleEvidence: championsDefenseDefinitions,
    excluded: [
      { id: "spread-doubles-one-actual-hit", classification: "参照実装未対応", reason: "Field exposes gameType, not actual hit count; no singles substitution counted." },
      ...["gravity-grounding", "ability-suppression-mold-breaker", "item-suppression-magic-room-klutz", "multiscale-entry-hazards", "multiscale-multi-hit", "air-balloon-consumption"].map(id => ({ id, classification: "仕様未確認", reason: "Outside local scoped model; reference may model some interactions, but no equal-condition local comparison claimed." })),
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runPhase2B4L2Comparison();
  writeFileSync("docs/validation/phase-2b4-l2-results.json", JSON.stringify(report, null, 2) + "\n");
  const mismatches = [...report.compared, ...report.models].filter(r => r.classification !== "一致");
  console.log(JSON.stringify({ compared: report.compared.length, mismatches: mismatches.map(r => r.id), listed: report.listed, excluded: report.excluded }));
  if (mismatches.length || report.listed.some(r => !r.listed)) process.exitCode = 1;
}
