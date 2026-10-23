// Entirely synthetic contract fixtures. Not Pokémon game data or damage goldens.
export const factors = { attack: 1, defense: 1, spAttack: 1, spDefense: 1, speed: 1 };
export const versions = { ruleVersion: "test-rule", masterDataVersion: "test-master", effectCatalogVersion: "test-effects", regulationId: "test-regulation" };
const provenance = { sourceId: "fixture", sourceVersion: "1", verificationStatus: "provisional", evidenceIds: [] };
const metadata = { displayName: "架空のテストデータ", inclusion: "confirmed", fieldProvenance: { contract: provenance } };
export function makeCatalog() {
  return {
    sourceVersions: { ...versions },
    forms: Array.from({ length: 50 }, (_, i) => ({ ...metadata, id: `test-form-${i + 1}`, baseStats: { hp: 100, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 }, types: ["test-type"], legalAbilityIds: ["test-ability"], allowsNoAbility: false })),
    natures: [{ ...metadata, id: "test-neutral", factors: { ...factors } }, { ...metadata, id: "test-up", factors: { ...factors, attack: 1.1, spAttack: 0.9 } }],
    moves: ["test-move", "test-unlearned"].map(id => ({ ...metadata, id, effectIds: ["test-effect"] })),
    abilities: [{ ...metadata, id: "test-ability", effectIds: ["test-effect"] }, { ...metadata, id: "test-illegal-ability", effectIds: [] }],
    items: [{ ...metadata, id: "test-item", effectIds: [] }],
    effects: [{ id: "test-effect", support: "unsupported", evidenceIds: [], optionIds: ["test-option"] }],
    learnsets: [{ pokemonFormId: "test-form-1", moveIds: ["test-move"] }],
  };
}
export function makeBuild(formId = "test-form-1") {
  return {
    pokemonFormId: formId,
    statPoints: { hp: 32, attack: 32, defense: 2, spAttack: 0, spDefense: 0, speed: 0 },
    natureId: "test-neutral", natureFactors: { ...factors }, abilityId: "test-ability",
    item: { kind: "none" }, currentHp: null,
    stages: { attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }, status: "none", origin: "manual",
  };
}
export function makeSnapshot(mode: "normal" | "top50" = "normal") {
  const common = {
    format: "singles", attacker: makeBuild(), moves: ["test-move"], sourceVersions: { ...versions },
    conditions: { weather: "none", terrain: "none", targetsActuallyHit: 1, critical: false, helpingHand: false, reflectOnDefenderSide: false, lightScreenOnDefenderSide: false, auroraVeilOnDefenderSide: false, attackerGrounded: null, defenderGrounded: null, supplementary: [] },
  };
  return mode === "normal"
    ? { payloadSchemaVersion: 1, mode, input: { ...common, defender: makeBuild() } }
    : { payloadSchemaVersion: 1, mode, input: { ...common, rankingSnapshotId: "test-singles", defenderOverrides: { "test-singles-entry-1": makeBuild() } } };
}
export function makeRanking(format: "singles" | "doubles" = "singles") {
  return {
    snapshotId: `test-${format}`, format, regulationId: versions.regulationId, sourceId: "fixture",
    sourceGeneratedAt: null, upstreamPublishedAt: null, fetchedAt: "2026-10-23T00:00:00Z",
    verificationStatus: "unverified", rankingProvenance: "unverified_rank",
    attribution: { label: "合成テスト用", url: "https://example.com/fixture" },
    entries: Array.from({ length: 50 }, (_, i) => ({ rankingEntryId: `test-${format}-entry-${i + 1}`, rank: i + 1, pokemonFormId: `test-form-${i + 1}`, usageRate: null, buildOrigin: "incomplete", representativeBuild: null, warnings: ["実機未検証"] })),
  };
}
