/** Five L2 candidate move models. Not form/learnset/regulation approval.
 * Facts from Smogon damage-calc 0.12.0 (MIT), normalized into engine models.
 * Copyright (c) 2013-2025 Honko and other contributors. See THIRD_PARTY_NOTICES.md.
 */
import type { EffectDefinition, EngineCatalog } from "./contracts";
const revision = "d7a69cf40616057ef40faf7623df7a628e58b535";
const base = `https://github.com/smogon/damage-calc/blob/${revision}/calc/src`;
type Name = "earthquake" | "rockSlide" | "flamethrower" | "waterSpout" | "protect";
function effect(name: Name): Extract<EffectDefinition, { kind: "championsMove" }> {
  return { kind: "championsMove", name, evidence: {
    profileId: "smogon-calc-0.12.0-champions-p2b2", checkedAt: "2026-10-24",
    availability: "reference_listed", verification: "supported_unverified", gameEvidenceIds: [],
    sources: [
      { id: `smogon-0.12.0:move-${name}-list`, url: `${base}/data/moves.ts#L4938-L5501`, revision },
      { id: `smogon-0.12.0:move-${name}-mechanics`, url: `${base}/mechanics/champions.ts`, revision },
    ],
  } };
}
export const championsMoveDefinitions = {
  earthquake: { referenceName: "Earthquake", reference: { power: 100, type: "Ground", category: "Physical", target: "allAdjacent", priority: 0 },
    model: { model: "standard", power: 100, type: "ground", category: "physical", target: "spread" }, effect: effect("earthquake") },
  rockSlide: { referenceName: "Rock Slide", reference: { power: 75, type: "Rock", category: "Physical", target: "allAdjacentFoes", priority: 0 },
    model: { model: "standard", power: 75, type: "rock", category: "physical", target: "spread" }, effect: effect("rockSlide") },
  flamethrower: { referenceName: "Flamethrower", reference: { power: 90, type: "Fire", category: "Special", target: "any", priority: 0 },
    model: { model: "standard", power: 90, type: "fire", category: "special", target: "single" }, effect: effect("flamethrower") },
  waterSpout: { referenceName: "Water Spout", reference: { power: 150, type: "Water", category: "Special", target: "allAdjacentFoes", priority: 0 },
    model: { model: "hpScaled", power: 150, type: "water", category: "special", target: "spread" }, effect: effect("waterSpout") },
  // Reference target 'any' is the API's default, not evidence of Protect targeting an opponent.
  // This model only classifies non-damage; self-targeting/protection turns are not simulated.
  protect: { referenceName: "Protect", reference: { power: 0, type: "Normal", category: "Status", target: "any", priority: 4 },
    model: { model: "nonDamaging" }, effect: effect("protect") },
} satisfies Record<Name, { referenceName: string; reference: { power: number; type: string; category: string; target: string; priority: number }; model: EngineCatalog["moves"][string]; effect: Extract<EffectDefinition, { kind: "championsMove" }> }>;
// Canonical model validation must not change through mutation of an exported registry.
for (const entry of Object.values(championsMoveDefinitions)) {
  Object.freeze(entry.model);
  Object.freeze(entry);
}
Object.freeze(championsMoveDefinitions);
