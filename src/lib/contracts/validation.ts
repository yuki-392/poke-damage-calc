import { z } from "zod";
import { masterCatalogSchema } from "./master";
import { activeRankingsSchema, calculationWriteSchema, nonHpStats, rankingSchema, savedCalculationSchema, savedInputSnapshotSchema, type PokemonBuild, type SavedInputSnapshot } from "./schemas";

export const MAX_SNAPSHOT_BYTES = 250_000;
const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

/** Enforce transport size BEFORE JSON.parse (including whitespace and multibyte text). */
export function parseSnapshotJson<T>(json: string, schema: z.ZodType<T>): T {
  if (byteLength(json) > MAX_SNAPSHOT_BYTES) throw new Error("PAYLOAD_TOO_LARGE");
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error("INVALID_JSON"); }
  return schema.parse(value);
}

/** Pure client/server factory. Catalog and snapshots are parsed/copied at creation.
 * This validates contract consistency, NOT game correctness, rights, or ownership.
 * Server must load authorized snapshots and trusted versioned catalogs itself.
 */
export function createContractValidator(catalogInput: unknown, snapshotInputs: readonly unknown[]) {
  const catalog = masterCatalogSchema.parse(catalogInput);
  const forms = new Map(catalog.forms.map(f => [f.id, f]));
  const natures = new Map(catalog.natures.map(n => [n.id, n]));
  const abilities = new Map(catalog.abilities.map(a => [a.id, a]));
  const items = new Map(catalog.items.map(i => [i.id, i]));
  const moves = new Map(catalog.moves.map(m => [m.id, m]));
  const effects = new Map(catalog.effects.map(e => [e.id, e]));
  type Report = (path: (string | number)[], message: string) => void;
  const checkBuild = (build: PokemonBuild, path: (string | number)[], report: Report) => {
    const form = forms.get(build.pokemonFormId);
    if (!form || form.inclusion !== "confirmed") report([...path, "pokemonFormId"], "UNKNOWN_OR_UNCONFIRMED_FORM");
    const nature = natures.get(build.natureId);
    if (!nature || nature.inclusion !== "confirmed") report([...path, "natureId"], "UNKNOWN_OR_UNCONFIRMED_NATURE");
    else if (nonHpStats.some(s => build.natureFactors[s] !== nature.factors[s])) report([...path, "natureFactors"], "NATURE_FACTOR_MISMATCH");
    if (build.abilityId === null ? !form?.allowsNoAbility : !form?.legalAbilityIds.includes(build.abilityId) || abilities.get(build.abilityId)?.inclusion !== "confirmed") report([...path, "abilityId"], "ILLEGAL_ABILITY");
    if (build.item.kind === "known" && items.get(build.item.itemId)?.inclusion !== "confirmed") report([...path, "item"], "UNKNOWN_OR_UNCONFIRMED_ITEM");
    // Maximum HP depends on the versioned arithmetic rule; Phase 2 checks it.
    // Do not silently introduce the unverified provisional HP formula here.
  };
  const ranking = rankingSchema.superRefine((r, ctx) => {
    const report: Report = (path, message) => ctx.addIssue({ code: "custom", path, message });
    if (r.regulationId !== catalog.sourceVersions.regulationId) report(["regulationId"], "VERSION_INCOMPATIBLE");
    r.entries.forEach((e, i) => {
      if (forms.get(e.pokemonFormId)?.inclusion !== "confirmed") report(["entries", i, "pokemonFormId"], "UNKNOWN_OR_UNCONFIRMED_FORM");
      if (e.representativeBuild) checkBuild(e.representativeBuild, ["entries", i, "representativeBuild"], report);
    });
  });
  const snapshots = snapshotInputs.map(s => ranking.parse(s));
  if (new Set(snapshots.map(s => s.snapshotId)).size !== snapshots.length) throw new Error("DUPLICATE_SNAPSHOT_ID");
  const snapshotMap = new Map(snapshots.map(s => [s.snapshotId, s]));
  const validateSnapshot = (saved: SavedInputSnapshot, ctx: z.RefinementCtx) => {
    const report: Report = (path, message) => ctx.addIssue({ code: "custom", path, message });
    if (byteLength(JSON.stringify(saved)) > MAX_SNAPSHOT_BYTES) report([], "PAYLOAD_TOO_LARGE");
    const input = saved.input;
    for (const key of Object.keys(catalog.sourceVersions) as (keyof typeof catalog.sourceVersions)[]) {
      if (input.sourceVersions[key] !== catalog.sourceVersions[key]) report(["input", "sourceVersions", key], "VERSION_INCOMPATIBLE");
    }
    checkBuild(input.attacker, ["input", "attacker"], report);
    input.moves.forEach((id, i) => { if (moves.get(id)?.inclusion !== "confirmed") report(["input", "moves", i], "UNKNOWN_OR_UNCONFIRMED_MOVE"); });
    if (input.format === "singles" && input.conditions.targetsActuallyHit !== 1) report(["input", "conditions", "targetsActuallyHit"], "INVALID_TARGET_COUNT");
    input.conditions.supplementary.forEach((s, i) => {
      if (s.kind === "allyAbility" && abilities.get(s.abilityId)?.inclusion !== "confirmed") report(["input", "conditions", "supplementary", i], "UNKNOWN_ALLY_ABILITY");
      if (s.kind === "moveEffect" && !effects.get(s.effectId)?.optionIds.includes(s.optionId)) report(["input", "conditions", "supplementary", i], "UNKNOWN_EFFECT_OPTION");
    });
    if (saved.mode === "normal") checkBuild(saved.input.defender, ["input", "defender"], report);
    else {
      const data = saved.input;
      const reference = snapshotMap.get(data.rankingSnapshotId);
      if (!reference) report(["input", "rankingSnapshotId"], "SNAPSHOT_UNAVAILABLE");
      else if (reference.format !== data.format || reference.regulationId !== data.sourceVersions.regulationId) report(["input", "rankingSnapshotId"], "SNAPSHOT_MISMATCH");
      const entries = new Map(reference?.entries.map(e => [e.rankingEntryId, e]));
      for (const [id, build] of Object.entries(data.defenderOverrides)) {
        const entry = entries.get(id);
        if (!entry || entry.pokemonFormId !== build.pokemonFormId) report(["input", "defenderOverrides", id], "OVERRIDE_ENTRY_MISMATCH");
        checkBuild(build, ["input", "defenderOverrides", id], report);
      }
    }
  };
  const snapshot = savedInputSnapshotSchema.superRefine(validateSnapshot);
  const attachSnapshotIssues = (value: unknown, ctx: z.RefinementCtx) => {
    const result = snapshot.safeParse(value);
    if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ ...issue, path: ["snapshot", ...issue.path] });
  };
  return {
    snapshot, ranking,
    calculationWrite: calculationWriteSchema.superRefine((c, ctx) => attachSnapshotIssues(c.snapshot, ctx)),
    savedCalculation: savedCalculationSchema.superRefine((c, ctx) => attachSnapshotIssues(c.snapshot, ctx)),
    activeRankings: activeRankingsSchema.superRefine((p, ctx) => {
      for (const format of ["singles", "doubles"] as const) {
        const result = ranking.safeParse(p.rankings[format]);
        if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ ...issue, path: ["rankings", format, ...issue.path] });
      }
    }),
  };
}
