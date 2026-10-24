/** Aggregate-only delta audit of the exact stage-3 source snapshot. No master promotion. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { coverageMetaSchema, candidateAbilityNames, candidateItemNames } from "./top50-coverage";
import { championsMoveDefinitions } from "../../src/lib/engine/champions-moves";
const metric = (n: number, d: number) => ({ numerator: Number(n.toFixed(6)), denominator: Number(d.toFixed(6)), percent: d ? Number((100*n/d).toFixed(4)) : null });
export function measureCandidateCoverage(raw: unknown) {
  const meta = coverageMetaSchema.parse(raw); const rows = meta.pokemon.filter(r => r.position <= 50);
  if (rows.length !== 50 || new Set(rows.map(r => r.name)).size !== 50 || new Set(rows.map(r => r.position)).size !== 50) throw new Error("INCOMPLETE_OR_DUPLICATE_TOP50");
  const allMoves = new Map(Object.values(championsMoveDefinitions).map(m => [m.referenceName, m.model]));
  const measure = (old: boolean) => {
    const abilities = new Set<string>(old ? ["Technician","Huge Power"] : candidateAbilityNames);
    const items = new Set<string>(old ? ["Life Orb"] : candidateItemNames);
    const models = new Map([...allMoves].filter(([name]) => !old || name !== "Shadow Ball"));
    const templateMoves = rows.flatMap(r => r.set?.moves ?? []); const marginal = rows.flatMap(r => r.moves);
    const sum = (test: (name: string) => boolean) => marginal.reduce((s,[name,rate]) => s+(test(name) ? rate : 0),0);
    const hasModel = (name: string) => models.has(name);
    const hasDamage = (name: string) => models.has(name) && models.get(name)!.model !== "nonDamaging";
    return {
      ability: metric(rows.filter(r => r.set?.ability && abilities.has(r.set.ability)).length,50),
      item: metric(rows.filter(r => r.set?.item && items.has(r.set.item)).length,50),
      pair: metric(rows.filter(r => r.set?.ability && r.set.item && abilities.has(r.set.ability) && items.has(r.set.item)).length,50),
      templateModels: metric(templateMoves.filter(hasModel).length,templateMoves.length),
      templateDamage: metric(templateMoves.filter(hasDamage).length,templateMoves.length),
      marginalModels: metric(marginal.filter(([name]) => hasModel(name)).length,marginal.length),
      marginalDamage: metric(marginal.filter(([name]) => hasDamage(name)).length,marginal.length),
      marginalModelMass: metric(sum(hasModel),sum(() => true)),
      marginalDamageMass: metric(sum(hasDamage),sum(() => true)),
      marginalAbilityMentions: metric(rows.flatMap(r => r.abilities).filter(([name]) => abilities.has(name)).length,rows.flatMap(r => r.abilities).length),
      marginalItemMentions: metric(rows.flatMap(r => r.items).filter(([name]) => items.has(name)).length,rows.flatMap(r => r.items).length),
    };
  };
  return { format: meta.format, generatedAt: meta.generatedAt, rows:50, before: measure(true), after: measure(false),
    productionEligible: metric(0,50), gameVerified: metric(0,50), conditionResolvedRows:null,
    realDataCalculationsExecuted:0, realDataCatalogPromotions:0,
    scope:"Candidate model existence only, conditional on supported inputs. Template co-occurrence is not observed joint usage; marginal percentage-point sums are not population usage. No HP/activity/hazard context is supplied by this audit.",
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cache = process.argv[2]; if (!cache) throw new Error("Temporary cache path required");
  const baselinePath = "docs/validation/phase-2b3-coverage.json";
  const baseline = JSON.parse(readFileSync(baselinePath,"utf8"));
  const sources = JSON.parse(readFileSync(resolve(cache,"manifest.json"),"utf8")) as { key:string; sha256:string; fetchedAt:string; url:string }[];
  const formats = ["singles","doubles"].map(format => {
    const key = `meta-${format}`; const source = sources.find(s => s.key === key);
    const original = baseline.sources.find((s: { key:string }) => s.key === key);
    const bytes = readFileSync(resolve(cache,`${key}.json`)); const hash = createHash("sha256").update(bytes).digest("hex");
    if (!source || source.sha256 !== hash || original.sha256 !== hash || source.url !== original.url) throw new Error("SOURCE_SNAPSHOT_MISMATCH");
    const result = measureCandidateCoverage(JSON.parse(bytes.toString("utf8")));
    const prior = baseline.formats.find((r: { format:string }) => r.format === result.format);
    if (!prior) throw new Error("BASELINE_FORMAT_MISSING");
    const checks = [[result.before.ability,prior.rules.defenderAbility],[result.before.item,prior.rules.defenderItem],[result.before.pair,prior.rules.defenderAbilityAndItem],
      [result.before.templateModels,prior.attack.templateSlots],[result.before.templateDamage,prior.attack.templateDamageSlots],
      [result.before.marginalModels,prior.attack.marginalModelMentions],[result.before.marginalDamage,prior.attack.marginalDamageMentions],
      [result.before.marginalModelMass,prior.attack.marginalModelMass],[result.before.marginalDamageMass,prior.attack.marginalDamageMass]];
    if (checks.some(([a,b]) => JSON.stringify(a) !== JSON.stringify(b))) throw new Error("BASELINE_METRIC_MISMATCH");
    return { ...result, unchangedDataResolution: prior.data, unchangedMissingMaster: prior.missing,
      numericMassOverReportedDamagingMoves: prior.attack.damagingOnlyMass.percent === null ? null : metric(result.after.marginalDamageMass.numerator, prior.attack.damagingOnlyMass.denominator) };
  });
  const report = { auditedAt:new Date().toISOString(), scope:"Phase 2-B stage 4 candidate delta only", sources,
    implementationEvidence:["src/lib/engine/engine.ts","src/lib/engine/contracts.ts","src/lib/engine/champions-defense.ts","src/lib/engine/champions-moves.ts","scripts/audit/phase2b4-coverage.ts"].map(path => ({ path,sha256:createHash("sha256").update(readFileSync(path)).digest("hex") })),
    baseline:{ path:baselinePath,sha256:createHash("sha256").update(readFileSync(baselinePath)).digest("hex"),exactSourceHashesMatched:true },
    formats, attribution:baseline.attribution, retention:{ rawResponsesCommitted:false,rawCacheDeletedAt:null },
    gameVerified:false, rankingProvenance:"unverified_rank", P0_05:"unverified", P0_06:"unverified" };
  writeFileSync("docs/validation/phase-2b4-coverage.json", JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(formats.map(({ format,before,after }) => ({ format,before,after })),null,2));
}
