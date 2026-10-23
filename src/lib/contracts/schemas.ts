import { z } from "zod";

export const statIds = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"] as const;
export const nonHpStats = ["attack", "defense", "spAttack", "spDefense", "speed"] as const;
export const idSchema = z.string().min(1).regex(/\S/, "空白だけのIDは使用できません");
export const formatSchema = z.enum(["singles", "doubles"]);
export const httpUrlSchema = z.url({ protocol: /^https?$/ });
const timestamp = z.iso.datetime({ offset: true });
const point = z.int().min(0).max(32);
const stage = z.int().min(-6).max(6);
const factor = z.union([z.literal(0.9), z.literal(1), z.literal(1.1)]);
export const statPointsSchema = z.strictObject({ hp: point, attack: point, defense: point, spAttack: point, spDefense: point, speed: point })
  .refine(p => Object.values(p).reduce((a, b) => a + b, 0) <= 66, "能力ポイントの合計は66以下です");
export const natureFactorsSchema = z.strictObject({ attack: factor, defense: factor, spAttack: factor, spDefense: factor, speed: factor });
export const stagesSchema = z.strictObject({ attack: stage, defense: stage, spAttack: stage, spDefense: stage, speed: stage });
export const sourceVersionsSchema = z.strictObject({ ruleVersion: idSchema, masterDataVersion: idSchema, effectCatalogVersion: idSchema, regulationId: idSchema });
export const itemEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({ kind: z.literal("known"), itemId: idSchema }),
  z.strictObject({ kind: z.literal("customText"), text: z.string().min(1).max(100).regex(/\S/) }),
]);
/** Structural only. Use createContractValidator for master-aware validation. */
export const buildSchema = z.strictObject({
  pokemonFormId: idSchema, statPoints: statPointsSchema, natureId: idSchema, natureFactors: natureFactorsSchema,
  abilityId: idSchema.nullable(), item: itemEntrySchema, currentHp: z.int().min(1).nullable(), stages: stagesSchema,
  status: z.enum(["none", "burn", "poison", "badPoison", "paralysis", "sleep", "freeze"]),
  origin: z.enum(["measured", "estimated", "custom", "manual", "incomplete"]),
});
export const supplementaryConditionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("allyAbility"), abilityId: idSchema, isActive: z.boolean() }),
  z.strictObject({ kind: z.literal("moveEffect"), effectId: idSchema, optionId: idSchema }),
  z.strictObject({ kind: z.literal("attackerWeightKg"), kilograms: z.number().positive() }),
  z.strictObject({ kind: z.literal("defenderWeightKg"), kilograms: z.number().positive() }),
]);
export const battleContextSchema = z.strictObject({
  weather: z.enum(["none", "sun", "rain", "sand", "snow"]), terrain: z.enum(["none", "electric", "grassy", "misty", "psychic"]),
  targetsActuallyHit: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  critical: z.boolean(), helpingHand: z.boolean(), reflectOnDefenderSide: z.boolean(), lightScreenOnDefenderSide: z.boolean(), auroraVeilOnDefenderSide: z.boolean(),
  attackerGrounded: z.boolean().nullable(), defenderGrounded: z.boolean().nullable(), supplementary: z.array(supplementaryConditionSchema).max(32),
}).superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.supplementary.forEach((s, i) => {
    const key = s.kind === "allyAbility" ? `${s.kind}:${s.abilityId}` : s.kind === "moveEffect" ? `${s.kind}:${s.effectId}` : s.kind;
    if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["supplementary", i], message: "追加条件が重複しています" });
    seen.add(key);
  });
});
const commonInput = { format: formatSchema, attacker: buildSchema, moves: z.array(idSchema).min(1).max(4), conditions: battleContextSchema, sourceVersions: sourceVersionsSchema };
export const normalSavedInputSchema = z.strictObject({ ...commonInput, defender: buildSchema });
export const top50SavedInputSchema = z.strictObject({ ...commonInput, rankingSnapshotId: idSchema, defenderOverrides: z.record(idSchema, buildSchema).refine(o => Object.keys(o).length <= 50, "overrideは50件までです") });
export const savedInputSnapshotSchema = z.discriminatedUnion("mode", [
  z.strictObject({ payloadSchemaVersion: z.literal(1), mode: z.literal("normal"), input: normalSavedInputSchema }),
  z.strictObject({ payloadSchemaVersion: z.literal(1), mode: z.literal("top50"), input: top50SavedInputSchema }),
]);
export const rankingEntrySchema = z.strictObject({
  rankingEntryId: idSchema, rank: z.int().min(1).max(50), pokemonFormId: idSchema,
  usageRate: z.number().min(0).max(1).nullable(), buildOrigin: z.enum(["measured", "estimated", "incomplete"]),
  representativeBuild: buildSchema.nullable(), warnings: z.array(z.string()),
}).superRefine((e, ctx) => {
  if ((e.buildOrigin !== "incomplete" && e.representativeBuild === null) ||
      (e.representativeBuild && (e.representativeBuild.pokemonFormId !== e.pokemonFormId || e.representativeBuild.origin !== e.buildOrigin))) {
    ctx.addIssue({ code: "custom", message: "代表型のフォームと由来が行に一致しません" });
  }
});
export const rankingSchema = z.strictObject({
  snapshotId: idSchema, format: formatSchema, regulationId: idSchema, sourceId: idSchema,
  sourceGeneratedAt: timestamp.nullable(), upstreamPublishedAt: timestamp.nullable(), fetchedAt: timestamp,
  verificationStatus: z.enum(["verified_ingame", "unverified", "external_ladder"]),
  rankingProvenance: z.enum(["ingame_rank", "external_ladder_rank", "unverified_rank"]),
  attribution: z.strictObject({ label: idSchema, url: httpUrlSchema }), entries: z.array(rankingEntrySchema).length(50),
}).superRefine((ranking, ctx) => {
  for (const key of ["rank", "rankingEntryId", "pokemonFormId"] as const) {
    if (new Set(ranking.entries.map(e => e[key])).size !== ranking.entries.length) ctx.addIssue({ code: "custom", path: ["entries"], message: `${key}が重複しています` });
  }
  const expected = { verified_ingame: "ingame_rank", unverified: "unverified_rank", external_ladder: "external_ladder_rank" };
  if (expected[ranking.verificationStatus] !== ranking.rankingProvenance) ctx.addIssue({ code: "custom", path: ["rankingProvenance"], message: "検証状態と順位の出所が一致しません" });
});
export const activeRankingsSchema = z.strictObject({ publicationId: idSchema, publishedAt: timestamp, rankings: z.strictObject({ singles: rankingSchema, doubles: rankingSchema }) })
  .superRefine(({ rankings: { singles, doubles } }, ctx) => {
    if (singles.format !== "singles" || doubles.format !== "doubles" || singles.snapshotId === doubles.snapshotId || singles.regulationId !== doubles.regulationId || singles.sourceId !== doubles.sourceId) {
      ctx.addIssue({ code: "custom", path: ["rankings"], message: "形式・スナップショット・レギュレーション・出典が公開ペアとして不整合です" });
    }
  });

const apiMetaSchema = z.strictObject({ requestId: idSchema });
const envelope = <T extends z.ZodType>(data: T) => z.strictObject({ data, meta: apiMetaSchema });
const titleSchema = z.string().min(1).max(100).regex(/\S/);
export const calculationWriteSchema = z.strictObject({ title: titleSchema, snapshot: savedInputSnapshotSchema });
export const calculationMetadataSchema = z.strictObject({ id: z.uuid(), title: titleSchema, mode: z.enum(["normal", "top50"]), format: formatSchema, revision: z.int().min(1), createdAt: timestamp, updatedAt: timestamp });
export const savedCalculationSchema = calculationMetadataSchema.extend({ snapshot: savedInputSnapshotSchema }).superRefine((c, ctx) => {
  if (c.mode !== c.snapshot.mode || c.format !== c.snapshot.input.format) ctx.addIssue({ code: "custom", path: ["snapshot"], message: "保存メタデータとpayloadが一致しません" });
});
const catalogKind = z.enum(["forms", "moves", "abilities", "items", "learnsets", "natures"]);
const catalogEntry = z.strictObject({ id: idSchema, displayName: idSchema, verificationStatus: z.enum(["verified", "provisional", "conflicting"]), type: z.string().nullable().optional(), description: z.string().nullable().optional(), attributes: z.record(z.string(), z.json()).optional(), attribution: z.string().nullable().optional() });
const bootstrap = z.strictObject({ apiVersion: z.literal("v1"), payloadSchemaVersion: z.literal(1), sourceVersions: sourceVersionsSchema, masterManifestUrl: idSchema, activePublicationId: idSchema.nullable().optional(), rankingAvailability: z.enum(["available", "unverified", "unavailable"]) });
export const apiSchemas = {
  ApiMeta: apiMetaSchema,
  ApiError: z.strictObject({ error: z.strictObject({ code: idSchema, message: z.string(), requestId: idSchema, details: z.record(z.string(), z.json()).optional() }) }),
  SourceVersions: sourceVersionsSchema, Bootstrap: bootstrap, BootstrapResponse: envelope(bootstrap),
  Build: buildSchema, StatPoints: statPointsSchema, NatureFactors: natureFactorsSchema, Stages: stagesSchema,
  ItemEntry: itemEntrySchema, SupplementaryCondition: supplementaryConditionSchema, BattleContext: battleContextSchema,
  NormalSavedInput: normalSavedInputSchema, Top50SavedInput: top50SavedInputSchema, SavedInputSnapshot: savedInputSnapshotSchema,
  RankingEntry: rankingEntrySchema, Ranking: rankingSchema, ActiveRankings: activeRankingsSchema,
  ActiveRankingsResponse: envelope(activeRankingsSchema), RankingResponse: envelope(rankingSchema),
  CalculationWriteRequest: calculationWriteSchema, CalculationMetadata: calculationMetadataSchema,
  SavedCalculation: savedCalculationSchema, SavedCalculationResponse: envelope(savedCalculationSchema),
  CalculationPageResponse: envelope(z.strictObject({ items: z.array(calculationMetadataSchema).max(50), nextCursor: idSchema.nullable() })),
  CatalogEntry: catalogEntry, CatalogResponse: z.strictObject({ version: idSchema, kind: catalogKind, entries: z.array(catalogEntry).max(2000) }),
  CatalogQuery: z.strictObject({ kind: catalogKind, version: idSchema, formId: idSchema.optional() }).refine(q => q.kind !== "learnsets" || !!q.formId, "習得技の取得にはformIdが必要です"),
  IfMatch: z.string().regex(/^"rev:[1-9][0-9]*"$/),
};

export type SavedInputSnapshot = z.infer<typeof savedInputSnapshotSchema>;
export type PokemonBuild = z.infer<typeof buildSchema>;
export type SourceVersions = z.infer<typeof sourceVersionsSchema>;
export type BattleContext = z.infer<typeof battleContextSchema>;
export type BattleFormat = z.infer<typeof formatSchema>;
export type RankingDTO = z.infer<typeof rankingSchema>;
export type ActiveRankingsDTO = z.infer<typeof activeRankingsSchema>;
export type StatId = typeof statIds[number];
export type NonHpStat = typeof nonHpStats[number];
