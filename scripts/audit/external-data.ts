/** Local, offline contract audit. Never serves or imports the upstream dataset. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { masterCatalogSchema } from "../../src/lib/contracts/master";
import { buildSchema, statPointsSchema, type PokemonBuild } from "../../src/lib/contracts/schemas";
import { createContractValidator } from "../../src/lib/contracts/validation";
import { mapNature, mapStatPoints, projectRanking, resolveForm, sourceMetaSchema } from "./external-mapping";

const cacheDir = process.argv[2];
const outputPath = process.argv[3];
if (!cacheDir || !outputPath) throw new Error("Usage: pnpm audit:external <temporary-cache-dir> <summary.json>");
const manifest = z.array(z.object({ key: z.string(), url: z.url(), fetchedAt: z.string(), sha256: z.string() })).parse(JSON.parse(readFileSync(resolve(cacheDir, "manifest.json"), "utf8")));
const read = (key: string): unknown => {
  const entry = manifest.find(m => m.key === key);
  if (!entry) throw new Error(`MISSING_SOURCE: ${key}`);
  const bytes = readFileSync(resolve(cacheDir, `${key}.json`));
  if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error(`SOURCE_HASH_MISMATCH: ${key}`);
  return JSON.parse(bytes.toString("utf8"));
};
const named = z.object({ name: z.string() });
const names = (key: string) => z.array(named).parse(read(key));
const apiIndex = z.object({ dataVersion: z.string(), generatedAt: z.iso.datetime(), pokemon: z.array(z.object({
  showdownName: z.string(), showdownId: z.string(), learnableMoveNames: z.array(z.string()),
  summary: z.object({ primary: z.object({ saved_name: z.string(), hp: z.number(), attack: z.number() }), forms: z.array(z.looseObject({ showdown_name: z.string(), saved_name: z.string(), form_name: z.string() })) }),
})) }).parse(read("api-index"));
const forms = apiIndex.pokemon.flatMap(p => p.summary.forms);
const roster = z.array(z.object({ name: z.string(), types: z.array(z.string()), abilities: z.record(z.string(), z.string()) })).parse(read("master-roster"));
const stats = z.array(z.object({ name: z.string(), hp: z.number(), atk: z.number(), def: z.number(), spa: z.number(), spd: z.number(), spe: z.number() })).parse(read("master-stats"));
const natures = z.array(z.object({ name: z.string(), increasedStat: z.string().nullable(), decreasedStat: z.string().nullable() })).parse(read("master-natures"));
const sourceMoves = z.array(z.object({ name: z.string(), inChampions: z.boolean().optional() })).parse(read("master-moves"));
const sourceAbilities = names("master-abilities");
const sourceItems = names("master-items");
const learnsets = z.record(z.string(), z.object({ moves: z.array(named) })).parse(read("master-learnsets"));
const sourceVersions = {
  ruleVersion: "audit:no-engine-no-mechanics-approval", masterDataVersion: `audit:${manifest.find(m => m.key === "master-roster")!.sha256}`,
  effectCatalogVersion: "audit:all-effects-unsupported", regulationId: "audit:upstream-regulation-not-specified",
};
const meta = (key: string, fields = ["displayName"]) => ({ inclusion: "unconfirmed" as const, fieldProvenance: Object.fromEntries(fields.map(field => [field,
  { sourceId: "otterlyclueless/pokemon-champions-data", sourceVersion: manifest.find(m => m.key === key)!.sha256, verificationStatus: "provisional" as const, evidenceIds: [] },
])) });
const formId = (name: string) => resolveForm(name, forms) ?? `unresolved-master-form:${name}`;
const bearing = (rows: { name: string }[], key: string, kind: string) => rows.map(row => ({
  ...meta(key), id: `${kind}:${row.name}`, displayName: row.name, effectIds: [`effect:${kind}:${row.name}`],
}));
// Retain provisional/unconfirmed states. Do not promote third-party claims to game evidence.
const catalog = masterCatalogSchema.parse({
  sourceVersions,
  forms: roster.map(row => {
    const stat = stats.find(s => s.name === row.name);
    return { ...meta("master-roster"),
      fieldProvenance: { ...meta("master-roster", ["displayName", "types", "legalAbilityIds"]).fieldProvenance, ...meta("master-stats", ["baseStats"]).fieldProvenance },
      id: formId(row.name), displayName: row.name, types: row.types,
      baseStats: stat ? { hp: stat.hp, attack: stat.atk, defense: stat.def, spAttack: stat.spa, spDefense: stat.spd, speed: stat.spe } : null,
      legalAbilityIds: Object.values(row.abilities).map(a => `ability:${a}`), allowsNoAbility: false };
  }),
  natures: natures.map(n => ({ ...meta("master-natures", ["displayName", "factors"]), id: `nature:${n.name}`, displayName: n.name, factors: mapNature(n) })),
  moves: bearing(sourceMoves, "master-moves", "move").map((row, i) => ({ ...row, inclusion: sourceMoves[i]!.inChampions === false ? "excluded" : "unconfirmed" })),
  abilities: bearing(sourceAbilities, "master-abilities", "ability"), items: bearing(sourceItems, "master-items", "item"),
  effects: [...sourceMoves.map(r => `effect:move:${r.name}`), ...sourceAbilities.map(r => `effect:ability:${r.name}`), ...sourceItems.map(r => `effect:item:${r.name}`)]
    .map(id => ({ id, support: "unsupported", evidenceIds: [], optionIds: [] })),
  learnsets: Object.entries(learnsets).map(([name, data]) => ({ pokemonFormId: formId(name), moveIds: data.moves.map(m => `move:${m.name}`) })),
});
const contracts = createContractValidator(catalog, []);
const auditFormats = ["singles", "doubles"] as const;
const known = {
  forms: new Set(catalog.forms.map(f => f.id)), moves: new Set(sourceMoves.map(m => m.name)),
  abilities: new Set(sourceAbilities.map(a => a.name)), items: new Set(sourceItems.map(i => i.name)), natures: new Set(natures.map(n => n.name)),
};
const projected = auditFormats.map(format => {
  const key = `meta-${format}`;
  const source = manifest.find(m => m.key === key)!;
  const raw = read(key);
  const ranking = projectRanking(raw, { fetchedAt: source.fetchedAt, snapshotId: `audit:${source.sha256}`, regulationId: sourceVersions.regulationId, resolve: name => resolveForm(name, forms) });
  const rows = sourceMetaSchema.parse(raw).pokemon.filter(p => p.position <= 50);
  const issues: Record<string, Set<string>> = { missingForms: new Set(), missingMoves: new Set(), excludedMoves: new Set(), missingAbilities: new Set(), missingItems: new Set(), missingNatures: new Set(), illegalAbilities: new Set(), invalidPoints: new Set(), incompleteSets: new Set() };
  let structuralBuilds = 0;
  for (const row of rows) {
    const id = resolveForm(row.name, forms)!;
    const form = catalog.forms.find(f => f.id === id);
    if (!known.forms.has(id)) issues.missingForms!.add(row.name);
    const set = row.set;
    if (!set || !set.ability || !set.nature || !set.item) { issues.incompleteSets!.add(row.name); continue; }
    for (const name of set.moves) {
      if (!known.moves.has(name)) issues.missingMoves!.add(name);
      if (sourceMoves.find(m => m.name === name)?.inChampions === false) issues.excludedMoves!.add(name);
    }
    if (!known.abilities.has(set.ability)) issues.missingAbilities!.add(set.ability);
    if (!known.items.has(set.item)) issues.missingItems!.add(set.item);
    if (!known.natures.has(set.nature)) issues.missingNatures!.add(set.nature);
    if (form && !form.legalAbilityIds.includes(`ability:${set.ability}`)) issues.illegalAbilities!.add(`${row.name}:${set.ability}`);
    const [hp, attack, defense, spAttack, spDefense, speed] = set.bonuses;
    if (!statPointsSchema.safeParse({ hp, attack, defense, spAttack, spDefense, speed }).success) issues.invalidPoints!.add(row.name);
    const nature = catalog.natures.find(n => n.displayName === set.nature);
    if (nature) {
      // Source's six-column order is checked against its generator; no stat calculation.
      const candidate: PokemonBuild = buildSchema.parse({ pokemonFormId: id, statPoints: { hp, attack, defense, spAttack, spDefense, speed }, natureId: nature.id, natureFactors: nature.factors,
        abilityId: `ability:${set.ability}`, item: { kind: "known", itemId: `item:${set.item}` }, currentHp: null,
        stages: { attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }, status: "none", origin: "estimated" });
      if (buildSchema.safeParse(candidate).success) structuralBuilds++;
    }
  }
  const check = contracts.ranking.safeParse(ranking);
  return { format, upstreamRowCount: sourceMetaSchema.parse(raw).pokemon.length, projectedRowCount: ranking.entries.length, structuralBuilds,
    structuralRanking: "pass", masterAwareRanking: check.success ? "pass" : "rejected",
    rejectionCodes: check.success ? [] : [...new Set(check.error.issues.map(i => i.message))],
    issues: Object.fromEntries(Object.entries(issues).map(([key, values]) => [key, [...values].sort()])),
    generatedAt: ranking.sourceGeneratedAt, upstreamPublishedAt: ranking.upstreamPublishedAt, usageRate: "not provided; null retained", representativeBuild: "null until complete approved catalog exists" };
});
const battleChecks = auditFormats.map(format => {
  const battle = z.object({ format: z.string(), season: z.string(), date: z.string().nullable(), rows: z.array(z.looseObject({ category: z.string() })) }).parse(read(`battle-${format}-garchomp`));
  const points = battle.rows.filter(r => r.category === "stat_points");
  return { format, season: battle.season, date: battle.date, categories: [...new Set(battle.rows.map(r => r.category))], statPointRows: points.length,
    validStatPointRows: points.filter(row => { try { mapStatPoints(row); return true; } catch { return false; } }).length };
});
const commit = z.object({ sha: z.string() }).parse(read("master-commit")).sha;
const garchomp = apiIndex.pokemon.find(p => p.showdownName === "Garchomp")!;
const base = stats.find(s => s.name === "Garchomp")!;
const summary = {
  auditedAt: new Date().toISOString(), auditScope: "Phase 0/1 contract verification only; not ingestion, publication, mechanics or ingame ranking audit",
  ingameVerification: { P0_04: "unverified", P0_05: "unverified", P0_06: "unverified" }, productionEligible: false,
  attribution: [
    { label: "Battle data provided by Pokémon Champions Battle Data", url: "https://championsbattledata.com/", terms: "https://championsbattledata.com/api-rules/", storage: "temporary cache only; no raw response committed or served" },
    { label: "Pokemon Champions Data Contributors", url: "https://github.com/otterlyclueless/pokemon-champions-data", license: "https://creativecommons.org/licenses/by/4.0/", changes: "field names, IDs and nature vectors projected for local validation; game verification not asserted", observedCommit: commit },
  ],
  sources: manifest,
  catalog: { structuralValidation: "pass", forms: catalog.forms.length, natures: catalog.natures.length, moves: catalog.moves.length, abilities: catalog.abilities.length, items: catalog.items.length, learnsets: catalog.learnsets.length,
    unresolvedFormAliases: roster.filter(r => !resolveForm(r.name, forms)).map(r => r.name),
    allProvenance: "provisional", allEffects: "unsupported", gameInclusion: "unconfirmed or explicitly excluded", apiIndexRowCount: apiIndex.pokemon.length },
  rankings: projected, battleChecks,
  upstreamSetCaveat: "The upstream generator clamps/defaults stat points and defaults missing nature to Serious. Valid meta sets do not prove raw source completeness; raw point rows were sampled for Garchomp in both formats only.",
  baseStatHazard: { form: "Garchomp", apiMetadataHp: garchomp.summary.primary.hp, masterBaseHp: base.hp,
    resolution: "Different semantic fields; API metadata stats are NOT copied to catalog.baseStats. No reverse stat formula inferred." },
  blockers: ["API does not specify an approved regulation ID", "Master roster and ability catalog do not cover every current TOP50 entry", "Stat Alignment correspondence remains unverified in game", "P0-05/P0-06 evidence is not part of this audit"],
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, catalog: summary.catalog, rankings: projected, battleChecks }, null, 2));
