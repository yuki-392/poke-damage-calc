/**
 * DESIGN CANONICAL CONTRACT v1.2 HANDOFF (2026-10-23)
 * This is a TYPE REFERENCE, not production implementation.
 * It supersedes duplicate SaveInput types in frontend-state.reference.ts and
 * api-contract.reference.ts. OpenAPI v1.1 must match its wire shape.
 * User selected U-01: legal single nature ID and vector.
 */
export type BattleFormat = 'singles' | 'doubles';
export type StatId = 'hp' | 'attack' | 'defense' | 'spAttack' | 'spDefense' | 'speed';
export type NonHpStat = Exclude<StatId, 'hp'>;
export type NatureFactor = 0.9 | 1 | 1.1;
export type BuildOrigin = 'measured' | 'estimated' | 'custom' | 'manual' | 'incomplete';
export type StatusCondition = 'none' | 'burn' | 'poison' | 'badPoison' | 'paralysis' | 'sleep' | 'freeze';
export type Weather = 'none' | 'sun' | 'rain' | 'sand' | 'snow';
export type Terrain = 'none' | 'electric' | 'grassy' | 'misty' | 'psychic';
export type ItemEntry =
  | { kind: 'none' }
  | { kind: 'known'; itemId: string }
  | { kind: 'customText'; text: string };

/** Versions inside the input. Payload schema version is ONLY at the envelope. */
export interface SourceVersions {
  ruleVersion: string;
  masterDataVersion: string;
  effectCatalogVersion: string;
  regulationId: string;
}
/** The full six-stat shape is preserved even if UI renders fewer stat fields. */
export interface ValidatedPokemonBuild {
  pokemonFormId: string;
  statPoints: Record<StatId, number>; // 0..32 each, sum <=66 (server runtime validation)
  natureId: string; // REQUIRED: one legal nature ID; factors must exactly match
  natureFactors: Record<NonHpStat, NatureFactor>; // always derived from natureId, runtime checked
  abilityId: string | null;
  item: ItemEntry;
  // pokemonFormId is the battle form ID including mega; no isMega duplicate wire flag.
  currentHp: number | null; // null means full HP when current HP is not user-specified, per engine adapter contract
  stages: Record<NonHpStat, number>; // integers -6..+6
  status: StatusCondition;
  origin: BuildOrigin;
}
export type SupplementaryCondition =
  | { kind: 'allyAbility'; abilityId: string; isActive: boolean }
  | { kind: 'moveEffect'; effectId: string; optionId: string }
  | { kind: 'attackerWeightKg'; kilograms: number }
  | { kind: 'defenderWeightKg'; kilograms: number };
export interface BattleContext {
  weather: Weather;
  terrain: Terrain;
  targetsActuallyHit: 1 | 2 | 3;
  critical: boolean;
  helpingHand: boolean;
  reflectOnDefenderSide: boolean;
  lightScreenOnDefenderSide: boolean;
  auroraVeilOnDefenderSide: boolean;
  attackerGrounded: boolean | null;
  defenderGrounded: boolean | null;
  supplementary: SupplementaryCondition[];
}
export interface NormalSavedInput {
  format: BattleFormat;
  attacker: ValidatedPokemonBuild;
  defender: ValidatedPokemonBuild;
  moves: string[]; // canonical moveId; length 1..4; validate known move IDs
  conditions: BattleContext;
  sourceVersions: SourceVersions;
}
export interface Top50SavedInput {
  format: BattleFormat;
  rankingSnapshotId: string;
  attacker: ValidatedPokemonBuild;
  moves: string[];
  conditions: BattleContext;
  defenderOverrides: Record<string, ValidatedPokemonBuild>; // by rankingEntryId, never rank number
  sourceVersions: SourceVersions;
}
export type SavedInputSnapshot =
  | { payloadSchemaVersion: 1; mode: 'normal'; input: NormalSavedInput }
  | { payloadSchemaVersion: 1; mode: 'top50'; input: Top50SavedInput };

export interface RankingEntryDTO {
  rankingEntryId: string;
  rank: number;
  pokemonFormId: string;
  usageRate: number | null;
  buildOrigin: 'measured' | 'estimated' | 'incomplete';
  representativeBuild: ValidatedPokemonBuild | null;
  warnings: string[];
}
export interface RankingDTO {
  snapshotId: string;
  format: BattleFormat;
  regulationId: string;
  sourceId: string;
  sourceGeneratedAt: string | null;
  upstreamPublishedAt: string | null;
  fetchedAt: string;
  verificationStatus: 'verified_ingame' | 'unverified' | 'external_ladder';
  rankingProvenance: 'ingame_rank' | 'external_ladder_rank' | 'unverified_rank';
  attribution: { label: string; url: string };
  entries: RankingEntryDTO[]; // 50 and complete for published
}
export interface ActiveRankingsDTO {
  publicationId: string;
  publishedAt: string;
  rankings: Record<BattleFormat, RankingDTO>;
}

/** Frontend-only drafts MUST NOT be sent to save API. No share API exists. */
export interface EditorOnlyFields {
  validity: { kind: 'valid' } | { kind: 'invalidDraft'; fieldPaths: string[]; reason: string };
  localDetailConditions?: BattleContext;
  focusedField?: string;
}
