import { z } from "zod";
import { masterCatalogSchema } from "../contracts/master";
import { battleContextSchema, buildSchema, formatSchema, idSchema, sourceVersionsSchema, type SourceVersions } from "../contracts/schemas";
import type { Fraction, KoAnalysis } from "./ko";

export const damageRequestSchema = z.strictObject({ format: formatSchema, attacker: buildSchema, defender: buildSchema, moveId: idSchema, conditions: battleContextSchema, sourceVersions: sourceVersionsSchema });
const standard = { category: z.enum(["physical", "special"]), type: idSchema, power: z.int().min(1).max(100_000), target: z.enum(["single", "spread"]) };
const moveSchema = z.discriminatedUnion("model", [
  z.strictObject({ model: z.literal("standard"), ...standard }),
  z.strictObject({ model: z.literal("hpScaled"), ...standard }),
  z.strictObject({ model: z.literal("fixed"), type: idSchema, damage: z.int().min(1).max(1_000_000) }),
  z.strictObject({ model: z.literal("nonDamaging") }),
  z.strictObject({ model: z.literal("unsupported"), reason: idSchema }),
]);
export const ruleEvidenceSchema = z.strictObject({
  profileId: idSchema, checkedAt: z.iso.date(),
  availability: z.enum(["reference_listed", "unconfirmed", "excluded"]),
  verification: z.literal("supported_unverified"),
  sources: z.array(z.strictObject({ id: idSchema, url: z.url(), revision: idSchema })).min(1),
  gameEvidenceIds: z.array(idSchema).max(0),
});
export const effectDefinitionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("neutral") }),
  z.strictObject({ kind: z.literal("championsMove"), name: z.enum(["earthquake", "rockSlide", "flamethrower", "waterSpout", "protect", "shadowBall"]), evidence: ruleEvidenceSchema }),
  z.strictObject({ kind: z.literal("championsDefense"), name: z.enum(["levitate", "airBalloon", "multiscale"]), evidence: ruleEvidenceSchema }),
  z.strictObject({ kind: z.literal("champions"), name: z.enum(["technician", "hugePower", "lifeOrb"]), evidence: ruleEvidenceSchema }),
  z.strictObject({ kind: z.literal("unsupported"), reason: idSchema }),
  z.strictObject({ kind: z.literal("immunity"), scope: z.literal("defender"), type: idSchema }),
  z.strictObject({ kind: z.literal("multiplier"), phase: z.enum(["P1", "A1", "D1", "F4"]), scope: z.enum(["move", "attacker", "defender"]), category: z.enum(["physical", "special", "any"]), factor4096: z.int().min(1).max(65536), order: z.int().min(1).max(1000) }),
]);
const modifier = z.int().min(1).max(65536);
export const engineCatalogSchema = z.strictObject({
  execution: z.enum(["fixture", "production"]), master: masterCatalogSchema,
  rules: z.strictObject({ rulesetId: z.literal("champions"), sourceVersions: sourceVersionsSchema, verification: z.literal("fixture_only"), sourceIds: z.array(idSchema).min(1),
    modifiers: z.strictObject({ spread: modifier, weatherBoost: modifier, weatherWeaken: modifier, critical: modifier, stab: modifier, burn: modifier, screenSingles: modifier, screenDoubles: modifier, helpingHand: modifier }) }),
  typeChart: z.record(idSchema, z.record(idSchema, z.union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(2)]))),
  typeChartEvidence: ruleEvidenceSchema.optional(),
  formRules: z.record(idSchema, z.strictObject({ statModel: z.enum(["standard", "fixedHp1", "unsupported"]) })),
  moves: z.record(idSchema, moveSchema), effects: z.record(idSchema, effectDefinitionSchema),
}).refine(c => Object.entries(c.rules.sourceVersions).every(([key, value]) => c.master.sourceVersions[key as keyof SourceVersions] === value), "Rules and master versions must match")
  .refine(c => c.master.forms.every(f => new Set(f.types).size === f.types.length), "A form must not repeat the same type");
export type DamageRequest = z.infer<typeof damageRequestSchema>;
export type EffectDefinition = z.infer<typeof effectDefinitionSchema>;
export type EngineCatalog = z.infer<typeof engineCatalogSchema>;
export type TraceEntry = { phase: string; effectId?: string; owner?: string; evaluation?: "active" | "inactive"; before?: number; after?: number; modifier4096?: number; rounding?: "floor" | "halfUp" | "halfDown"; roll?: number; suppressed?: boolean; reason?: string; sourceIds?: string[] };
export type FailureStatus = "invalid" | "unsupported" | "missingContext";
export type Failure = { status: FailureStatus; code: string; messageKey: string; fieldPaths: string[]; missingKeys: string[]; sourceVersions: SourceVersions; sourceIds: string[] };
type Evidence = { verification: "fixture_only"; gameVerified: false; sourceVersions: SourceVersions; sourceIds: string[]; assumptions: string[] };
export type DamageResult = Failure
  | (Evidence & { status: "nonDamaging"; code: "NON_DAMAGING"; trace: TraceEntry[] })
  | (Evidence & { status: "ok"; rolls: number[]; distribution: { damage: number; count: number }[]; range: { min: number; max: number }; damagePercent: { min: Fraction; max: Fraction }; remainingHp: { min: number; max: number }; maximumHp: number; currentHp: number; ko: Exclude<KoAnalysis, { kind: "limitExceeded" }> | { kind: "unavailable"; reason: "STATEFUL_DEFENSE"; oneHitProbability: Fraction }; trace: TraceEntry[] });
