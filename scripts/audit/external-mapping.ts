/** Audit-only projections. Not an ingestion adapter or an approved game catalog. */
import { z } from "zod";
import { natureFactorsSchema, rankingSchema, statPointsSchema } from "../../src/lib/contracts/schemas";

const sourceFormSchema = z.object({ showdown_name: z.string().min(1), saved_name: z.string().optional(), form_name: z.string().optional() });
export function resolveForm(name: string, forms: readonly unknown[]): string | null {
  const matches = new Set(forms.flatMap(value => {
    const form = sourceFormSchema.parse(value);
    return [form.showdown_name, form.saved_name, form.form_name].includes(name) ? [`form:${form.showdown_name}`] : [];
  }));
  return matches.size === 1 ? [...matches][0]! : null;
}

const statMap = { attack: "attack", defense: "defense", sp_attack: "spAttack", sp_defense: "spDefense", speed: "speed" } as const;
const sourceStat = z.enum(["attack", "defense", "sp_attack", "sp_defense", "speed"]);
const sourceNature = z.object({ name: z.string().min(1), increasedStat: sourceStat.nullable(), decreasedStat: sourceStat.nullable() })
  .refine(n => (n.increasedStat === null && n.decreasedStat === null) || (n.increasedStat !== null && n.decreasedStat !== null && n.increasedStat !== n.decreasedStat));
export function mapNature(value: unknown) {
  const source = sourceNature.parse(value);
  const result: z.infer<typeof natureFactorsSchema> = { attack: 1, defense: 1, spAttack: 1, spDefense: 1, speed: 1 };
  if (source.increasedStat !== null) result[statMap[source.increasedStat]] = 1.1;
  if (source.decreasedStat !== null) result[statMap[source.decreasedStat]] = 0.9;
  return natureFactorsSchema.parse(result);
}

const sourcePoints = z.object({ hp_points: z.number(), attack_points: z.number(), defense_points: z.number(), sp_atk_points: z.number(), sp_def_points: z.number(), speed_points: z.number() });
export function mapStatPoints(value: unknown) {
  const s = sourcePoints.parse(value);
  return statPointsSchema.parse({ hp: s.hp_points, attack: s.attack_points, defense: s.defense_points, spAttack: s.sp_atk_points, spDefense: s.sp_def_points, speed: s.speed_points });
}

export const sourceMetaSchema = z.object({
  generatedAt: z.iso.datetime().nullable(), format: z.enum(["Singles", "Doubles"]),
  pokemon: z.array(z.object({
    name: z.string().min(1), position: z.int().positive(),
    set: z.object({ moves: z.array(z.string()).max(4), item: z.string().nullable(), ability: z.string().nullable(), nature: z.string().nullable(), bonuses: z.array(z.number()).length(6) }).optional(),
  })),
});
export function projectRanking(raw: unknown, options: { fetchedAt: string; snapshotId: string; regulationId: string; resolve: (name: string) => string | null }) {
  const source = sourceMetaSchema.parse(raw);
  const rows = source.pokemon.filter(p => p.position <= 50);
  return rankingSchema.parse({
    snapshotId: options.snapshotId, format: source.format === "Singles" ? "singles" : "doubles",
    regulationId: options.regulationId, sourceId: "championsbattledata", sourceGeneratedAt: source.generatedAt,
    upstreamPublishedAt: null, fetchedAt: options.fetchedAt,
    verificationStatus: "unverified", rankingProvenance: "unverified_rank",
    attribution: { label: "Battle data provided by Pokémon Champions Battle Data", url: "https://championsbattledata.com/" },
    entries: rows.map(row => {
      const form = options.resolve(row.name);
      if (!form) throw new Error(`UNRESOLVED_FORM: ${row.name}`);
      return { rankingEntryId: `${options.snapshotId}:${row.position}`, rank: row.position, pokemonFormId: form, usageRate: null,
        buildOrigin: "incomplete", representativeBuild: null,
        warnings: ["実機未照合", "regulationIdは監査用未解決ラベル", "育成型の合法性・収録の承認前", "元のsetは独立集計からの推定であり実測型ではない"] };
    }),
  });
}
