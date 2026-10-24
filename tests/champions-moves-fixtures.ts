// Only synthetic form/build integration: no real inclusion or learnset is approved.
import { championsMoveDefinitions } from "../src/lib/engine/champions-moves";
import { makeChampionsFixture, type NamedEffect } from "./champions-effects-fixtures";
export type NamedMove = keyof typeof championsMoveDefinitions;
export function makeNamedMoveFixture(name: NamedMove, effect?: NamedEffect) {
  const setup = makeChampionsFixture(effect); const { catalog, request } = setup;
  for (const [key, value] of Object.entries(championsMoveDefinitions)) {
    const id = `move:${key}`; const effectId = `champions:move:${key}`;
    catalog.moves[id] = structuredClone(value.model);
    catalog.effects[effectId] = structuredClone(value.effect);
    catalog.master.effects.push({ id: effectId, support: "supported_unverified", evidenceIds: value.effect.evidence.sources.map(s => s.id), optionIds: [] });
    catalog.master.moves.push({ ...catalog.master.moves[0]!, id, displayName: value.referenceName, effectIds: [effectId] });
    catalog.master.learnsets[0]!.moveIds.push(id);
  }
  for (const key of ["ruleVersion", "masterDataVersion", "effectCatalogVersion"] as const) {
    catalog.master.sourceVersions[key] += "-p2b2-p2b4";
    catalog.rules.sourceVersions[key] = catalog.master.sourceVersions[key];
  }
  request.sourceVersions = { ...catalog.rules.sourceVersions }; request.moveId = `move:${name}`;
  return setup;
}
