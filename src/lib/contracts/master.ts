import { z } from "zod";
import { idSchema, natureFactorsSchema, sourceVersionsSchema } from "./schemas";

const evidence = z.array(idSchema);
const provenance = z.strictObject({ sourceId: idSchema, sourceVersion: idSchema, verificationStatus: z.enum(["verified", "provisional", "conflicting"]), evidenceIds: evidence })
  .refine(p => p.verificationStatus !== "verified" || p.evidenceIds.length > 0, "検証済み属性には証跡参照が必要です");
const metadata = {
  id: idSchema, displayName: idSchema, inclusion: z.enum(["confirmed", "unconfirmed", "excluded"]),
  fieldProvenance: z.record(idSchema, provenance).refine(p => Object.keys(p).length > 0, "出典情報が必要です"),
};
const stat = z.int().positive();
const baseStats = z.strictObject({ hp: stat, attack: stat, defense: stat, spAttack: stat, spDefense: stat, speed: stat });
export const formSchema = z.strictObject({ ...metadata, baseStats: baseStats.nullable(), types: z.array(idSchema).min(1).max(2), legalAbilityIds: z.array(idSchema), allowsNoAbility: z.boolean() });
export const natureSchema = z.strictObject({ ...metadata, factors: natureFactorsSchema }).refine(n => {
  const values = Object.values(n.factors);
  return values.every(v => v === 1) || (values.filter(v => v === 1.1).length === 1 && values.filter(v => v === 0.9).length === 1);
}, "性格は全能力等倍、または1能力上昇・1能力下降の単一ベクトルです");
const effectBearing = z.strictObject({ ...metadata, effectIds: z.array(idSchema) });
export const effectSchema = z.strictObject({ id: idSchema, support: z.enum(["verified", "supported_unverified", "audited_neutral", "unsupported"]), evidenceIds: evidence, optionIds: z.array(idSchema) })
  .refine(e => !["verified", "audited_neutral"].includes(e.support) || e.evidenceIds.length > 0, "検証済み・監査済み効果には証跡参照が必要です");
export const masterCatalogSchema = z.strictObject({
  sourceVersions: sourceVersionsSchema, forms: z.array(formSchema), natures: z.array(natureSchema),
  moves: z.array(effectBearing), abilities: z.array(effectBearing), items: z.array(effectBearing), effects: z.array(effectSchema),
  learnsets: z.array(z.strictObject({ pokemonFormId: idSchema, moveIds: z.array(idSchema) })),
}).superRefine((catalog, ctx) => {
  const report = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  for (const kind of ["forms", "natures", "moves", "abilities", "items", "effects"] as const) {
    if (new Set(catalog[kind].map(e => e.id)).size !== catalog[kind].length) report([kind], "IDが重複しています");
  }
  const abilities = new Set(catalog.abilities.map(e => e.id));
  const effects = new Set(catalog.effects.map(e => e.id));
  const forms = new Set(catalog.forms.map(e => e.id));
  const moves = new Set(catalog.moves.map(e => e.id));
  catalog.forms.forEach((f, i) => {
    if (f.legalAbilityIds.some(id => !abilities.has(id)) || new Set(f.legalAbilityIds).size !== f.legalAbilityIds.length || (!f.allowsNoAbility && f.legalAbilityIds.length === 0)) report(["forms", i, "legalAbilityIds"], "合法特性の参照が不正です");
  });
  for (const kind of ["moves", "abilities", "items"] as const) catalog[kind].forEach((e, i) => {
    if (e.effectIds.some(id => !effects.has(id))) report([kind, i, "effectIds"], "未知の効果IDです");
  });
  if (new Set(catalog.learnsets.map(l => l.pokemonFormId)).size !== catalog.learnsets.length) report(["learnsets"], "フォームが重複しています");
  catalog.learnsets.forEach((l, i) => {
    if (!forms.has(l.pokemonFormId) || l.moveIds.some(id => !moves.has(id))) report(["learnsets", i], "習得技の参照が不正です");
  });
});
export type MasterCatalog = z.infer<typeof masterCatalogSchema>;
