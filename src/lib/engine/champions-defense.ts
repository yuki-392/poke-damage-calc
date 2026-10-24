/** Scoped L2 candidates, not game/learnset/regulation approval.
 * Smogon damage-calc 0.12.0, MIT; see THIRD_PARTY_NOTICES.md.
 */
import type { EffectDefinition } from "./contracts";
const revision = "d7a69cf40616057ef40faf7623df7a628e58b535";
const base = `https://github.com/smogon/damage-calc/blob/${revision}/calc/src`;
// This option is an explicit caller assertion, never a default: effective ability/item,
// no gravity/grounding overrides, one initial hit, no entry hazards or between-hit changes.
// Suppression mechanisms and consumable transitions are deliberately NOT simulated.
export const defenseContextOptions = ["active-single-hit-clear-field", "gravity", "entry-hazards", "multi-hit", "effect-suppression", "unknown-activity"] as const;
function definition(name: "levitate" | "airBalloon" | "multiscale", list: string, lines: string): Extract<EffectDefinition, { kind: "championsDefense" }> {
  return { kind: "championsDefense", name, evidence: {
    profileId: "smogon-calc-0.12.0-champions-p2b4", checkedAt: "2026-10-24",
    availability: "reference_listed", verification: "supported_unverified", gameEvidenceIds: [],
    sources: [
      { id: `smogon-0.12.0:${name}-champions-list`, url: `${base}/data/${list}.ts`, revision },
      { id: `smogon-0.12.0:${name}-mechanics`, url: `${base}/mechanics/champions.ts#${lines}`, revision },
    ],
  } };
}
export const championsDefenseDefinitions = {
  levitate: definition("levitate", "abilities", "L277-L295"),
  airBalloon: definition("airBalloon", "items", "L295-L298"),
  multiscale: definition("multiscale", "abilities", "L1127-L1135"),
};
