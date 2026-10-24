// Synthetic forms only. This is not approval of real master data or learnsets.
import { championsDefenseDefinitions, defenseContextOptions } from "../src/lib/engine/champions-defense";
import { makeNamedMoveFixture, type NamedMove } from "./champions-moves-fixtures";
import type { NamedEffect } from "./champions-effects-fixtures";
export type DefenseName = keyof typeof championsDefenseDefinitions;
export function makeDefenseFixture(name: DefenseName, move: NamedMove = "earthquake", offense?: NamedEffect) {
  const setup = makeNamedMoveFixture(move, offense); const { catalog, request } = setup;
  for (const [key, definition] of Object.entries(championsDefenseDefinitions)) {
    const id = `champions:${key}`;
    catalog.effects[id] = structuredClone(definition);
    catalog.master.effects.push({ id, support: "supported_unverified", evidenceIds: definition.evidence.sources.map(s => s.id), optionIds: [...defenseContextOptions] });
    const entity = { ...catalog.master.abilities[0]!, id: `fixture:${key}`, effectIds: [id] };
    if (key === "airBalloon") catalog.master.items.push(entity);
    else { catalog.master.abilities.push(entity); catalog.master.forms.forEach(f => f.legalAbilityIds.push(entity.id)); }
  }
  if (name === "airBalloon") request.defender.item = { kind: "known", itemId: "fixture:airBalloon" };
  else request.defender.abilityId = `fixture:${name}`;
  request.defender.currentHp = 175;
  request.conditions.defenderGrounded = false;
  request.conditions.supplementary.push({ kind: "moveEffect", effectId: `champions:${name}`, optionId: "active-single-hit-clear-field" });
  return setup;
}
