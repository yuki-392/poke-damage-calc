/** Offline aggregate audit. Never approves a master or executes real-data damage. */
import { z } from "zod";
import { sourceMetaSchema, resolveForm, mapNature } from "./external-mapping";
import { statPointsSchema } from "../../src/lib/contracts/schemas";
import { championsTypes, championsEffectDefinitions } from "../../src/lib/engine/champions-rules";
import { championsMoveDefinitions } from "../../src/lib/engine/champions-moves";
import { championsDefenseDefinitions } from "../../src/lib/engine/champions-defense";

const named = z.object({ name: z.string().min(1) });
const pairs = z.array(z.tuple([z.string().min(1), z.number().min(0).max(100)]))
  .refine(rows => new Set(rows.map(r => r[0])).size === rows.length, "Duplicate marginal names");
export const coverageMetaSchema = sourceMetaSchema.extend({ pokemon: z.array(sourceMetaSchema.shape.pokemon.element.extend({
  moves: pairs, items: pairs, abilities: pairs, natures: pairs,
  spreads: z.array(z.tuple([z.number().min(0).max(100), z.array(z.number()).length(6)])),
})) });
export const coverageResourcesSchema = z.object({
  forms: z.array(z.object({ showdown_name: z.string().min(1), saved_name: z.string().optional(), form_name: z.string().optional() })),
  roster: z.array(named.extend({ types: z.array(z.string()), abilities: z.record(z.string(), z.string()) })),
  stats: z.array(named.extend({ hp: z.number(), atk: z.number(), def: z.number(), spa: z.number(), spd: z.number(), spe: z.number() })),
  natures: z.array(named.extend({ increasedStat: z.string().nullable(), decreasedStat: z.string().nullable() })),
  abilities: z.array(named), items: z.array(named), moves: z.array(named.extend({ inChampions: z.boolean().optional(), category:z.string().optional() })),
});
function metric(numerator: number, denominator: number) {
  return { numerator, denominator, percent: denominator ? Number((100*numerator/denominator).toFixed(4)) : null };
}
const moveRules = new Map(Object.values(championsMoveDefinitions).map(m => [m.referenceName, m.model]));
export const candidateAbilityNames = ["Technician", "Huge Power", "Levitate", "Multiscale"] as const;
export const candidateItemNames = ["Life Orb", "Air Balloon"] as const;
const abilityRules = new Set<string>(candidateAbilityNames);
const itemRules = new Set<string>(candidateItemNames);
type Frequency = { name: string; templateRows: number; marginalRows: number; marginalPercentSum: number };
function increment(map: Map<string, Frequency>, name: string, kind: "templateRows" | "marginalRows", rate = 0) {
  const row = map.get(name) ?? { name, templateRows: 0, marginalRows: 0, marginalPercentSum: 0 };
  row[kind]++; row.marginalPercentSum += rate; map.set(name, row);
}
function rounded(row: Frequency) { return { ...row, marginalPercentSum: Number(row.marginalPercentSum.toFixed(6)) }; }
const candidateNames = {
  abilities: ["Levitate", "Multiscale", "Disguise", "Intimidate", "Unaware", "Thick Fat", "Filter", "Stamina", "Rough Skin"],
  items: ["Focus Sash", "Air Balloon", "Sitrus Berry", "Leftovers", "Rocky Helmet", "Assault Vest", "Eviolite"],
  moves: ["Shadow Ball", "Ice Beam", "Close Combat", "U-turn", "Heat Wave", "Weather Ball", "Hyper Voice", ...moveRules.keys()],
};

export function auditFormatCoverage(rawMeta: unknown, rawResources: unknown) {
  const source = coverageMetaSchema.parse(rawMeta); const resources = coverageResourcesSchema.parse(rawResources);
  const rows = source.pokemon.filter(row => row.position <= 50);
  if (rows.length !== 50 || new Set(rows.map(r => r.name)).size !== 50 || new Set(rows.map(r => r.position)).size !== 50)
    throw new Error("INCOMPLETE_OR_DUPLICATE_TOP50");
  const known = { abilities: new Set(resources.abilities.map(r => r.name)), items: new Set(resources.items.map(r => r.name)), moves: new Map(resources.moves.map(r => [r.name,r])) };
  const sourceMasterForms = resources.roster.map(row => ({ ...row, resolved: resolveForm(row.name, resources.forms) }));
  const frequency = { abilities: new Map<string,Frequency>(), items: new Map<string,Frequency>(), moves: new Map<string,Frequency>() };
  const data = { formId: 0, masterForm: 0, baseStats: 0, types: 0, points: 0, abilityName: 0, abilityFormLink: 0, itemName: 0, nature: 0, allRepresentativeFields: 0 };
  const blockers = { unresolvedSourceForm: 0, missingMasterForm: 0, missingBaseStats: 0, invalidTypes: 0, missingOrInvalidPoints: 0, missingAbilityCatalog: 0, illegalAbilityOnKnownForm: 0, missingItemCatalog: 0, missingOrInvalidNature: 0, incompleteTemplate: 0, unsupportedDefenderAbility: 0, unsupportedDefenderItem: 0 };
  const missing = { forms: new Set<string>(), abilities: new Set<string>(), items: new Set<string>(), natures: new Set<string>(), templateExcludedMoves: new Set<string>(), marginalExcludedMoves:new Set<string>() };
  let abilityModelRows=0, itemModelRows=0, pairModelRows=0, templateSlots=0, templateModels=0, templateDamage=0, templateMissingMoves=0, templateExcludedSlots=0;
  let mentions=0, supportedMentions=0, mass=0, supportedMass=0, damageMass=0, damageMentions=0, missingMarginalMoves=0, excludedMarginalMoves=0;
  let knownFormRows=0, legalAbilityOnKnownRows=0;
  let damagingMass=0, unknownCategoryMentions=0;
  for (const row of rows) {
    const id = resolveForm(row.name, resources.forms);
    const candidates = id ? sourceMasterForms.filter(f => f.resolved === id) : [];
    const form = candidates.length === 1 ? candidates[0] : undefined;
    const stats = form ? resources.stats.filter(s => s.name === form.name) : [];
    const validStats = stats.length === 1 && [stats[0]!.hp,stats[0]!.atk,stats[0]!.def,stats[0]!.spa,stats[0]!.spd,stats[0]!.spe].every(n => Number.isSafeInteger(n) && n > 0);
    const validTypes = !!form && form.types.length >= 1 && form.types.length <= 2 && new Set(form.types).size === form.types.length && form.types.every(t => championsTypes.some(c => c === t.toLowerCase()));
    const set = row.set; const ability=set?.ability; const item=set?.item;
    const pointValues = set?.bonuses;
    const points = pointValues ? statPointsSchema.safeParse(Object.fromEntries(["hp","attack","defense","spAttack","spDefense","speed"].map((key,i) => [key,pointValues[i]]))).success : false;
    const abilityName = !!ability && known.abilities.has(ability);
    const abilityFormLink = !!ability && !!form && Object.values(form.abilities).includes(ability);
    const itemName = !!item && known.items.has(item);
    const natures = resources.natures.filter(n => n.name === set?.nature);
    let nature=false;
    if (natures.length === 1) { try { mapNature(natures[0]); nature=true; } catch { /* remains unresolved */ } }
    const resolved = { formId: !!id, masterForm: !!form, baseStats: validStats, types: validTypes, points, abilityName, abilityFormLink, itemName, nature };
    for (const key of Object.keys(resolved) as (keyof typeof resolved)[]) if (resolved[key]) data[key]++;
    if (Object.values(resolved).every(Boolean)) data.allRepresentativeFields++;
    if (!id) blockers.unresolvedSourceForm++;
    if (!form) { blockers.missingMasterForm++; missing.forms.add(row.name); }
    if (!validStats) blockers.missingBaseStats++;
    if (!validTypes) blockers.invalidTypes++;
    if (!points) blockers.missingOrInvalidPoints++;
    if (!abilityName) { blockers.missingAbilityCatalog++; if (ability) missing.abilities.add(ability); }
    if (form) { knownFormRows++; if (abilityFormLink) legalAbilityOnKnownRows++; else blockers.illegalAbilityOnKnownForm++; }
    if (!itemName) { blockers.missingItemCatalog++; if (item) missing.items.add(item); }
    if (!nature) { blockers.missingOrInvalidNature++; if (set?.nature) missing.natures.add(set.nature); }
    if (!set || !ability || !item || !set.nature) blockers.incompleteTemplate++;
    const hasAbilityRule = !!ability && abilityRules.has(ability); const hasItemRule = !!item && itemRules.has(item);
    if (hasAbilityRule) abilityModelRows++; else blockers.unsupportedDefenderAbility++;
    if (hasItemRule) itemModelRows++; else blockers.unsupportedDefenderItem++;
    if (hasAbilityRule && hasItemRule) pairModelRows++;
    if (ability) increment(frequency.abilities,ability,"templateRows");
    if (item) increment(frequency.items,item,"templateRows");
    for (const move of set?.moves ?? []) {
      templateSlots++; increment(frequency.moves,move,"templateRows");
      const model = moveRules.get(move);
      if (model) { templateModels++; if (model.model !== "nonDamaging") templateDamage++; }
      if (!known.moves.has(move)) templateMissingMoves++;
      if (known.moves.get(move)?.inChampions === false) { templateExcludedSlots++; missing.templateExcludedMoves.add(move); }
    }
    for (const kind of ["abilities","items","moves"] as const) {
      for (const [name,rate] of row[kind]) {
        increment(frequency[kind],name,"marginalRows",rate);
        if (kind === "moves") {
          mentions++; mass+=rate; const model=moveRules.get(name);
          if (model) { supportedMentions++; supportedMass+=rate; if (model.model !== "nonDamaging") { damageMass+=rate; damageMentions++; } }
          if (!known.moves.has(name)) missingMarginalMoves++;
          if (known.moves.get(name)?.inChampions === false) { excludedMarginalMoves++; missing.marginalExcludedMoves.add(name); }
          const category=known.moves.get(name)?.category?.toLowerCase();
          if (category==="physical" || category==="special") damagingMass+=rate;
          else if (category!=="status") unknownCategoryMentions++;
        }
      }
    }
  }
  const n=rows.length;
  const top = (kind: keyof typeof frequency, by: "templateRows" | "marginalPercentSum") => [...frequency[kind].values()].sort((a,b) => b[by]-a[by] || a.name.localeCompare(b.name)).slice(0,12).map(rounded);
  const coverageByKind = (kind: "abilities" | "items", rules: Set<string>) => {
    const values=[...frequency[kind].values()];
    const catalog=known[kind];
    const total=values.reduce((s,v) => s+v.marginalRows,0);
    return { distinctNames: metric(values.filter(v => rules.has(v.name)).length,values.length),
      marginalMentions: metric(values.filter(v => rules.has(v.name)).reduce((s,v) => s+v.marginalRows,0),total),
      catalogNames:metric(values.filter(v => catalog.has(v.name)).length,values.length),
      catalogMentions:metric(values.filter(v => catalog.has(v.name)).reduce((s,v) => s+v.marginalRows,0),total),
      missingCatalogNames:values.filter(v => !catalog.has(v.name)).map(v => v.name).sort() };
  };
  return {
    format: source.format, generatedAt: source.generatedAt, rows: n, rankingProvenance: "unverified_rank", regulationId: null,
    data: { ...Object.fromEntries(Object.entries(data).map(([key,value]) => [key,metric(value,n)])) as Record<keyof typeof data,ReturnType<typeof metric>>,
      abilityLegalityAmongKnownForms: metric(legalAbilityOnKnownRows,knownFormRows), physicalStatAlignmentVerified: false, rawPointCompleteness: null, rawNatureCompleteness: null },
    rules: { defenderAbility: metric(abilityModelRows,n), defenderItem: metric(itemModelRows,n), defenderAbilityAndItem: metric(pairModelRows,n),
      formBindings: metric(0,n), integratedRealCatalogRows: metric(0,n), marginalAbilities: coverageByKind("abilities",abilityRules), marginalItems: coverageByKind("items",itemRules),
      scope: "Named candidate models only; original three effects are outgoing-only, and three scoped defensive candidates require independently resolved context under the six supported move models. No other effect is inferred neutral." },
    production: { eligibleRows: metric(0,n), basis: "global RULES_NOT_APPROVED and absent approved real catalog; policy eligibility, not observed success", measuredCalculationSuccess: null },
    gameEvidence: { rankRows: metric(0,n), damageRows: metric(0,n), measuredGameAccuracy: null },
    attack: { templateSlots: metric(templateModels,templateSlots), templateDamageSlots: metric(templateDamage,templateSlots), templateMissingMoves, templateExcludedSlots,
      marginalModelMentions: metric(supportedMentions,mentions), marginalDamageMentions: metric(damageMentions,mentions),
      marginalModelMass: metric(Number(supportedMass.toFixed(6)),Number(mass.toFixed(6))), marginalDamageMass: metric(Number(damageMass.toFixed(6)),Number(mass.toFixed(6))),
      damagingOnlyMass: unknownCategoryMentions ? null : metric(Number(damageMass.toFixed(6)),Number(damagingMass.toFixed(6))), unknownCategoryMentions,
      marginalMissingMoveMentions: missingMarginalMoves, marginalExcludedMoveMentions: excludedMarginalMoves,
      marginalRowEntryRange: { min: Math.min(...rows.map(r => r.moves.length)), max: Math.max(...rows.map(r => r.moves.length)) },
      distinctReportedMoveNames: frequency.moves.size, jointMoveAbilityItemUsage: null,
      marginalMeaning: "Sum of reported per-form marginal percentage points, with equal weight per TOP50 form and truncated reported lists; not population usage or a joint distribution. Protect is model-only, never damage coverage." },
    blockers, missing: Object.fromEntries(Object.entries(missing).map(([key,value]) => [key,[...value].sort()])),
    frequencies: Object.fromEntries((["abilities","items","moves"] as const).map(kind => [kind,{ byTemplate: top(kind,"templateRows"), byMarginalMass: top(kind,"marginalPercentSum") }])),
    priorityEvidence: Object.fromEntries((Object.keys(candidateNames) as (keyof typeof candidateNames)[]).map(kind => [kind,candidateNames[kind].map(name => rounded(frequency[kind].get(name) ?? { name,templateRows:0,marginalRows:0,marginalPercentSum:0 }))])),
    limitations: ["Representative sets combine independent category tops and may contain upstream defaults/clamps, not observed joint builds", "Item marginals may mix mega stones and baseline forms; no cross-form combination inferred", "All real master inclusion/provenance remains unconfirmed/provisional", "No actual real-data calculation was attempted"],
    registeredCandidateEffects: [...Object.keys(championsEffectDefinitions), ...Object.keys(championsDefenseDefinitions)],
  };
}
