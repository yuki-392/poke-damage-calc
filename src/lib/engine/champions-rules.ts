/** Versioned L2 candidate rules. No real-master registration or production approval.
 * Type interaction facts transcribed from Smogon damage-calc 0.12.0 (MIT).
 * Copyright (c) 2013-2025 Honko and other contributors; see THIRD_PARTY_NOTICES.md.
 */
import type { EffectDefinition, EngineCatalog } from "./contracts";

export const championsTypes = ["normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"] as const;
type TypeId = typeof championsTypes[number];
// Attacking type -> [super-effective, resisted, immune]. Every remaining cell is explicitly neutral.
const interactions: Record<TypeId, readonly [readonly TypeId[], readonly TypeId[], readonly TypeId[]]> = {
  normal: [[], ["rock", "steel"], ["ghost"]],
  fire: [["grass", "ice", "bug", "steel"], ["fire", "water", "rock", "dragon"], []],
  water: [["fire", "ground", "rock"], ["water", "grass", "dragon"], []],
  electric: [["water", "flying"], ["electric", "grass", "dragon"], ["ground"]],
  grass: [["water", "ground", "rock"], ["fire", "grass", "poison", "flying", "bug", "dragon", "steel"], []],
  ice: [["grass", "ground", "flying", "dragon"], ["fire", "water", "ice", "steel"], []],
  fighting: [["normal", "ice", "rock", "dark", "steel"], ["poison", "flying", "psychic", "bug", "fairy"], ["ghost"]],
  poison: [["grass", "fairy"], ["poison", "ground", "rock", "ghost"], ["steel"]],
  ground: [["fire", "electric", "poison", "rock", "steel"], ["grass", "bug"], ["flying"]],
  flying: [["grass", "fighting", "bug"], ["electric", "rock", "steel"], []],
  psychic: [["fighting", "poison"], ["psychic", "steel"], ["dark"]],
  bug: [["grass", "psychic", "dark"], ["fire", "fighting", "poison", "flying", "ghost", "steel", "fairy"], []],
  rock: [["fire", "ice", "flying", "bug"], ["fighting", "ground", "steel"], []],
  ghost: [["psychic", "ghost"], ["dark"], ["normal"]],
  dragon: [["dragon"], ["steel"], ["fairy"]],
  dark: [["psychic", "ghost"], ["fighting", "dark", "fairy"], []],
  steel: [["ice", "rock", "fairy"], ["fire", "water", "electric", "steel"], []],
  fairy: [["fighting", "dragon", "dark"], ["fire", "poison", "steel"], []],
};
export const championsTypeChart: EngineCatalog["typeChart"] = Object.fromEntries(championsTypes.map(attack => {
  const [weak, resist, immune] = interactions[attack];
  return [attack, Object.fromEntries(championsTypes.map(defense => [defense, immune.includes(defense) ? 0 : weak.includes(defense) ? 2 : resist.includes(defense) ? 0.5 : 1]))];
}));
const revision = "d7a69cf40616057ef40faf7623df7a628e58b535";
const base = `https://github.com/smogon/damage-calc/blob/${revision}/calc/src`;
const evidence = (sources: { id: string; path: string }[]) => ({
  profileId: "smogon-calc-0.12.0-champions-p2b1", checkedAt: "2026-10-24",
  availability: "reference_listed" as const, verification: "supported_unverified" as const,
  sources: sources.map(s => ({ id: s.id, url: `${base}/${s.path}`, revision })), gameEvidenceIds: [],
});
export const championsTypeChartEvidence = evidence([{ id: "smogon-0.12.0:champions-types", path: "data/types.ts" }]);
export const championsEffectDefinitions = {
  technician: { kind: "champions", name: "technician", evidence: evidence([
    { id: "smogon-0.12.0:technician-list", path: "data/abilities.ts" },
    { id: "smogon-0.12.0:technician-mechanics", path: "mechanics/champions.ts#L742-L751" },
  ]) },
  hugePower: { kind: "champions", name: "hugePower", evidence: evidence([
    { id: "smogon-0.12.0:huge-power-list", path: "data/abilities.ts" },
    { id: "smogon-0.12.0:huge-power-mechanics", path: "mechanics/champions.ts#L927-L932" },
  ]) },
  lifeOrb: { kind: "champions", name: "lifeOrb", evidence: evidence([
    { id: "smogon-0.12.0:life-orb-list", path: "data/items.ts" },
    { id: "smogon-0.12.0:life-orb-mechanics", path: "mechanics/champions.ts#L1164-L1166" },
  ]) },
} satisfies Record<string, EffectDefinition>;
