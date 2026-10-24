// Synthetic builds only: this does not approve any real form, learnset or regulation.
import { championsEffectDefinitions, championsTypeChart, championsTypeChartEvidence } from "../src/lib/engine/champions-rules";
import { damageRequestSchema, engineCatalogSchema } from "../src/lib/engine/contracts";
import { makeDamageRequest, makeEngineCatalog } from "./engine-fixtures";

export type NamedEffect = keyof typeof championsEffectDefinitions;
export function makeChampionsFixture(effect?: NamedEffect) {
  const catalog = engineCatalogSchema.parse(makeEngineCatalog());
  catalog.typeChart = structuredClone(championsTypeChart);
  catalog.typeChartEvidence = structuredClone(championsTypeChartEvidence);
  catalog.master.forms.forEach(f => { f.types = ["normal"]; });
  for (const name of Object.keys(championsEffectDefinitions) as NamedEffect[]) {
    const id = `champions:${name}`;
    catalog.effects[id] = structuredClone(championsEffectDefinitions[name]);
    catalog.master.effects.push({ id, support: "supported_unverified", evidenceIds: championsEffectDefinitions[name].evidence.sources.map(s => s.id), optionIds: ["active", "suppressed"] });
    const entry = { ...catalog.master.abilities[0]!, id: `fixture:${name}`, effectIds: [id] };
    if (name === "lifeOrb") catalog.master.items.push(entry);
    else { catalog.master.abilities.push(entry); catalog.master.forms.forEach(f => f.legalAbilityIds.push(entry.id)); }
  }
  for (const key of ["ruleVersion", "masterDataVersion", "effectCatalogVersion"] as const) {
    catalog.master.sourceVersions[key] += "-p2b1";
    catalog.rules.sourceVersions[key] = catalog.master.sourceVersions[key];
  }
  const request = damageRequestSchema.parse(makeDamageRequest());
  request.sourceVersions = { ...catalog.rules.sourceVersions };
  if (effect) {
    if (effect === "lifeOrb") request.attacker.item = { kind: "known", itemId: `fixture:${effect}` };
    else request.attacker.abilityId = `fixture:${effect}`;
    request.conditions.supplementary = [{ kind: "moveEffect", effectId: `champions:${effect}`, optionId: "active" }];
  }
  return { catalog, request };
}
