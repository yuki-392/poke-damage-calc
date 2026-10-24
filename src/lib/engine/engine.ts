import { z } from "zod";
import { championsMoveDefinitions } from "./champions-moves";
import { defenseContextOptions } from "./champions-defense";
import { normalSavedInputSchema, rankingSchema, top50SavedInputSchema } from "../contracts/schemas";
import { createContractValidator } from "../contracts/validation";
import { damageRequestSchema, engineCatalogSchema, type DamageResult, type EffectDefinition, type Failure, type FailureStatus, type TraceEntry } from "./contracts";
import { analyzeKo, fraction } from "./ko";
import { applyRatio, applyStage, baseDamage, combine4096, resolveStats } from "./math";

class Stop extends Error {
  constructor(readonly status: FailureStatus, readonly code: string, readonly paths: string[] = []) { super(code); }
}
function stop(status: FailureStatus, code: string, paths: string[] = []): never { throw new Stop(status, code, paths); }

/** Trusted, versioned catalogs are parsed/copied once. No singleton, I/O or UI state.
 * Only explicit fixtures can produce numbers in this phase. No game-approved profile ships.
 */
export function createDamageEngine(catalogInput: unknown) {
  const catalog = engineCatalogSchema.parse(catalogInput);
  const { master, rules } = catalog;
  const contracts = createContractValidator(master, []);
  const forms = new Map(master.forms.map(f => [f.id, f]));
  const abilities = new Map(master.abilities.map(a => [a.id, a]));
  const items = new Map(master.items.map(i => [i.id, i]));
  const moves = new Map(master.moves.map(m => [m.id, m]));
  const effects = new Map(master.effects.map(e => [e.id, e]));
  const failure = (status: FailureStatus, code: string, paths: string[] = []): Failure => ({ status, code, messageKey: `engine.${code}`, fieldPaths: [...paths], missingKeys: status === "missingContext" ? [...paths] : [], sourceVersions: { ...rules.sourceVersions }, sourceIds: [...rules.sourceIds] });
  const evidence = () => ({ verification: "fixture_only" as const, gameVerified: false as const, sourceVersions: { ...rules.sourceVersions }, sourceIds: [...rules.sourceIds], assumptions: ["conditional_on_hits", "independent_identical_damage_rolls", "no_healing_or_between_hit_changes", "no_accuracy_or_secondary_effect_probability", "fixture_rules_not_game_verified"] });

  const calculateDamage = (requestInput: unknown): DamageResult => {
    try {
      const parsed = damageRequestSchema.safeParse(requestInput);
      if (!parsed.success) return failure("invalid", "INVALID_REQUEST", parsed.error.issues.map(i => i.path.join(".")));
      const request = parsed.data;
      if (Object.entries(rules.sourceVersions).some(([key, value]) => request.sourceVersions[key as keyof typeof request.sourceVersions] !== value)) return failure("invalid", "VERSION_INCOMPATIBLE", ["sourceVersions"]);
      for (const [owner, build] of [["attacker", request.attacker], ["defender", request.defender]] as const) {
        const form = forms.get(build.pokemonFormId);
        if (form && form.inclusion !== "confirmed") stop("unsupported", "FORM_INCLUSION_UNCONFIRMED", [`${owner}.pokemonFormId`]);
      }
      const validated = contracts.snapshot.safeParse({ payloadSchemaVersion: 1, mode: "normal", input: { format: request.format, attacker: request.attacker, defender: request.defender, moves: [request.moveId], conditions: request.conditions, sourceVersions: request.sourceVersions } });
      if (!validated.success) return failure("invalid", "INVALID_BUILD_OR_CONTEXT", validated.error.issues.map(i => i.path.join(".")));
      if (catalog.execution !== "fixture") stop("unsupported", "RULES_NOT_APPROVED");
      const trace: TraceEntry[] = [];
      const attackerForm = forms.get(request.attacker.pokemonFormId)!;
      const defenderForm = forms.get(request.defender.pokemonFormId)!;
      const move = catalog.moves[request.moveId];
      if (!move) stop("unsupported", "MOVE_MODEL_UNCLASSIFIED", ["moveId"]);
      if (move.model === "unsupported") stop("unsupported", move.reason, ["moveId"]);
      const actorStats = (owner: "attacker" | "defender") => {
        const build = request[owner]; const form = forms.get(build.pokemonFormId)!;
        const model = catalog.formRules[form.id]?.statModel;
        if (!model || model === "unsupported") stop("unsupported", "FORM_RULE_UNSUPPORTED", [`${owner}.pokemonFormId`]);
        if (!form.baseStats) stop(owner === "attacker" && move.model === "hpScaled" ? "missingContext" : "unsupported", owner === "attacker" && move.model === "hpScaled" ? "MAX_HP_UNAVAILABLE" : "BASE_STATS_UNAVAILABLE", [`${owner}.pokemonFormId`]);
        const stats = resolveStats(form.baseStats!, build, model);
        if (build.currentHp !== null && build.currentHp > stats.hp) stop("invalid", "CURRENT_HP_EXCEEDS_MAX", [`${owner}.currentHp`]);
        return stats;
      };
      const attackerStats = actorStats("attacker"); const defenderStats = actorStats("defender");
      const selected: { id: string; owner: string; definition: EffectDefinition }[] = [];
      const collect = (ids: string[], owner: string, entity: "move" | "ability" | "item") => {
        if (!ids.length) stop("unsupported", "EFFECT_UNCLASSIFIED", [owner]);
        if (new Set(ids).size !== ids.length) stop("unsupported", "DUPLICATE_EFFECT_ID", [owner]);
        for (const id of ids) {
          const effect = effects.get(id); const definition = catalog.effects[id];
          if (!effect || !definition) stop("unsupported", "EFFECT_UNCLASSIFIED", [owner]);
          if (effect.support === "unsupported") stop("unsupported", "EFFECT_UNSUPPORTED", [owner]);
          if (definition.kind === "unsupported") stop("unsupported", definition.reason, [owner]);
          if (effect.support === "audited_neutral" && definition.kind !== "neutral") stop("unsupported", "EFFECT_CLASSIFICATION_CONFLICT", [owner]);
          if (definition.kind === "champions") {
            if (entity !== (definition.name === "lifeOrb" ? "item" : "ability")) stop("unsupported", "EFFECT_ENTITY_MISMATCH", [owner]);
            if (definition.evidence.availability !== "reference_listed") stop("unsupported", "NAMED_EFFECT_AVAILABILITY_UNCONFIRMED", [owner]);
            if (selected.some(e => e.owner === owner && e.definition.kind === "champions" && e.definition.name === definition.name)) stop("unsupported", "DUPLICATE_NAMED_EFFECT", [owner]);
          }
          if (definition.kind === "championsMove") {
            if (entity !== "move") stop("unsupported", "EFFECT_ENTITY_MISMATCH", [owner]);
            if (definition.evidence.availability !== "reference_listed") stop("unsupported", "NAMED_MOVE_AVAILABILITY_UNCONFIRMED", ["moveId"]);
            const expected = championsMoveDefinitions[definition.name].model;
            if (Object.entries(expected).some(([key, value]) => (move as Record<string, unknown>)[key] !== value)) stop("unsupported", "MOVE_MODEL_MISMATCH", ["moveId"]);
            if (selected.some(e => e.definition.kind === "championsMove")) stop("unsupported", "DUPLICATE_MOVE_MODEL", ["moveId"]);
          }
          if (definition.kind === "championsDefense") {
            if (entity !== (definition.name === "airBalloon" ? "item" : "ability")) stop("unsupported", "EFFECT_ENTITY_MISMATCH", [owner]);
            if (definition.evidence.availability !== "reference_listed") stop("unsupported", "NAMED_EFFECT_AVAILABILITY_UNCONFIRMED", [owner]);
            if (selected.some(e => e.owner === owner && e.definition.kind === "championsDefense" && e.definition.name === definition.name)) stop("unsupported", "DUPLICATE_NAMED_EFFECT", [owner]);
          }
          selected.push({ id, owner, definition });
        }
      };
      collect(moves.get(request.moveId)!.effectIds, "move", "move");
      for (const owner of ["attacker", "defender"] as const) {
        const build = request[owner];
        if (build.abilityId !== null) collect(abilities.get(build.abilityId)!.effectIds, owner, "ability");
        if (build.item.kind === "customText") stop("unsupported", "UNRESOLVED_ITEM", [`${owner}.item`]);
        if (build.item.kind === "known") collect(items.get(build.item.itemId)!.effectIds, owner, "item");
      }
      const context = request.conditions;
      const named = selected.filter(e => e.definition.kind === "champions");
      const defenses = selected.filter(e => e.definition.kind === "championsDefense");
      const registeredMove = selected.find(e => e.definition.kind === "championsMove");
      const moveName = registeredMove?.definition.kind === "championsMove" ? registeredMove.definition.name : undefined;
      const activity = new Map<string, string>();
      for (const condition of context.supplementary) {
        if (condition.kind !== "moveEffect") stop("unsupported", "CONTEXT_RULE_UNSUPPORTED", ["conditions.supplementary"]);
        const offensive = named.some(e => e.id === condition.effectId && e.owner === "attacker") && ["active", "suppressed"].includes(condition.optionId);
        const defensive = defenses.some(e => e.id === condition.effectId && e.owner === "defender") && defenseContextOptions.some(o => o === condition.optionId);
        if (!offensive && !defensive) stop("unsupported", "CONTEXT_RULE_UNSUPPORTED", ["conditions.supplementary"]);
        activity.set(condition.effectId, condition.optionId);
      }
      const requestEvidence = () => ({ ...evidence(),
        sourceIds: [...new Set([...rules.sourceIds, ...(catalog.typeChartEvidence?.sources.map(s => s.id) ?? []), ...selected.flatMap(e => e.definition.kind === "champions" || e.definition.kind === "championsMove" || e.definition.kind === "championsDefense" ? e.definition.evidence.sources.map(s => s.id) : [])])],
        assumptions: [...evidence().assumptions, ...(moveName ? ["secondary_effects_not_simulated"] : []), ...(moveName === "protect" ? ["protect_defense_not_simulated"] : []), ...(named.length ? ["named_effect_activity_explicitly_resolved"] : []), ...(named.some(e => e.definition.kind === "champions" && e.definition.name === "lifeOrb") ? ["life_orb_recoil_not_in_damage_or_ko_model"] : [])],
      });
      if (catalog.typeChartEvidence && catalog.typeChartEvidence.availability !== "reference_listed") stop("unsupported", "TYPE_CHART_UNCONFIRMED");
      if (context.terrain !== "none" || context.weather === "sand" || context.weather === "snow") stop("unsupported", "CONTEXT_RULE_UNSUPPORTED", ["conditions"]);
      selected.filter(e => e.definition.kind === "neutral").forEach(e => trace.push({ phase: "Resolve", effectId: e.id, owner: e.owner, reason: "explicit_fixture_neutral" }));
      if (registeredMove?.definition.kind === "championsMove") trace.push({ phase: "Resolve", effectId: registeredMove.id, owner: "move", reason: "registered_move_model", sourceIds: registeredMove.definition.evidence.sources.map(s => s.id) });
      if (move.model === "nonDamaging") {
        defenses.forEach(e => trace.push({ phase: "Resolve", effectId: e.id, owner: e.owner, evaluation: "inactive", reason: "non_damaging_attack" }));
        return { ...requestEvidence(), status: "nonDamaging", code: "NON_DAMAGING", trace };
      }
      if ((moveName === "rockSlide" || moveName === "waterSpout") && context.targetsActuallyHit > 2) stop("invalid", "MOVE_TARGET_COUNT", ["conditions.targetsActuallyHit"]);
      if (move.model !== "fixed" && move.target === "single" && context.targetsActuallyHit !== 1) stop("invalid", "SINGLE_TARGET_COUNT", ["conditions.targetsActuallyHit"]);
      if (move.type === "ground" && defenderForm.types.includes("flying") && context.defenderGrounded === true) stop("unsupported", "GROUNDED_TYPE_INTERACTION_UNSUPPORTED", ["conditions.defenderGrounded"]);
      let resolvedPower = move.model === "fixed" ? 0 : move.power;
      if (move.model === "hpScaled") {
        if (request.attacker.currentHp === null) stop("missingContext", "CURRENT_HP_REQUIRED", ["attacker.currentHp"]);
        resolvedPower = Math.max(1, applyRatio(move.power, request.attacker.currentHp, attackerStats.hp, "floor"));
        trace.push({ phase: "M0", before: move.power, after: resolvedPower, rounding: "floor" });
      }
      const chart = catalog.typeChart[move.type];
      let typeN = 1; let typeD = 1;
      for (const type of defenderForm.types) {
        const factor = chart?.[type];
        if (factor === undefined) stop("unsupported", "TYPE_CHART_INCOMPLETE", ["defender.pokemonFormId"]);
        typeN *= factor === 0 ? 0 : factor === 2 ? 2 : 1;
        typeD *= factor === 0.5 ? 2 : 1;
      }
      const immunity = selected.find(e => e.definition.kind === "immunity" && e.owner === "defender" && e.definition.type === move.type);
      let immune = typeN === 0 || !!immunity;
      if (immune) trace.push({ phase: "Immunity", effectId: immunity?.id, owner: "defender", after: 0, reason: immunity ? "effect_immunity" : "type_immunity" });
      // Resolve intrinsic named rules before collecting phase modifiers. Active state must
      // already account for suppression by the caller; unknown mechanisms are rejected above.
      const namedModifiers: { id: string; phase: "P1" | "A1" | "F4"; factor: number; order: number }[] = [];
      let statefulDefense = false;
      for (const effect of defenses) {
        const def = effect.definition;
        if (def.kind !== "championsDefense") continue;
        const phase = def.name === "multiscale" ? "F4" : "Immunity";
        const entry = { phase, effectId: effect.id, owner: effect.owner, sourceIds: def.evidence.sources.map(s => s.id) };
        if (effect.owner !== "defender") { trace.push({ ...entry, evaluation: "inactive", reason: "incoming_only" }); continue; }
        const state = activity.get(effect.id);
        if (state === "unknown-activity") stop("missingContext", "EFFECT_ACTIVITY_REQUIRED", [`conditions.supplementary.${effect.id}`]);
        // Explicit unsupported context cannot be erased by an otherwise inactive condition.
        if (state && state !== "active-single-hit-clear-field") stop("unsupported", "DEFENSE_INTERACTION_UNSUPPORTED", [`conditions.supplementary.${effect.id}`]);
        if (!moveName || (move.model !== "standard" && moveName !== "waterSpout")) stop("unsupported", "DEFENSE_MOVE_MODEL_UNSUPPORTED", ["moveId"]);
        if (def.name !== "multiscale" && move.type !== "ground") { trace.push({ ...entry, evaluation: "inactive", reason: "non_ground_attack" }); continue; }
        if (def.name === "multiscale") {
          if (request.defender.currentHp === null) stop("missingContext", "DEFENDER_CURRENT_HP_REQUIRED", ["defender.currentHp"]);
          if (request.defender.currentHp < defenderStats.hp) { trace.push({ ...entry, evaluation: "inactive", reason: "hp_below_maximum" }); continue; }
        }
        if (!state) stop("missingContext", "DEFENSE_CONTEXT_REQUIRED", [`conditions.supplementary.${effect.id}`]);
        if (def.name === "multiscale") {
          if (immune) { trace.push({ ...entry, evaluation: "inactive", reason: "attack_already_immune" }); continue; }
          trace.push({ ...entry, evaluation: "active", modifier4096: 2048, reason: "full_hp_initial_single_hit" });
          namedModifiers.push({ id: effect.id, phase: "F4", factor: 2048, order: 50 });
          statefulDefense = true;
        } else {
          if (context.defenderGrounded === null) stop("missingContext", "GROUNDED_STATE_REQUIRED", ["conditions.defenderGrounded"]);
          if (context.defenderGrounded) stop("unsupported", "GROUNDING_INTERACTION_UNSUPPORTED", ["conditions.defenderGrounded"]);
          immune = true;
          trace.push({ ...entry, evaluation: "active", after: 0, reason: "ground_immunity_no_gravity" });
        }
      }
      for (const effect of named) {
        const def = effect.definition;
        if (def.kind !== "champions") continue;
        const phase = def.name === "technician" ? "P1" : def.name === "hugePower" ? "A1" : "F4";
        const sourceIds = def.evidence.sources.map(s => s.id);
        if (effect.owner !== "attacker") { trace.push({ phase, effectId: effect.id, owner: effect.owner, suppressed: true, reason: "outgoing_only", sourceIds }); continue; }
        const state = activity.get(effect.id);
        if (!state) stop("missingContext", "EFFECT_ACTIVITY_REQUIRED", [`conditions.supplementary.${effect.id}`]);
        if (state === "suppressed") { trace.push({ phase, effectId: effect.id, owner: effect.owner, suppressed: true, reason: "explicit_effect_suppression", sourceIds }); continue; }
        if (move.model !== "standard" && !(move.model === "hpScaled" && moveName === "waterSpout")) stop("unsupported", "NAMED_EFFECT_MODEL_UNSUPPORTED", ["moveId"]);
        if ((def.name === "technician" && resolvedPower > 60) || (def.name === "hugePower" && move.category !== "physical")) {
          trace.push({ phase, effectId: effect.id, owner: effect.owner, suppressed: true, reason: "activation_condition_not_met", sourceIds }); continue;
        }
        const factor = def.name === "technician" ? 6144 : def.name === "hugePower" ? 8192 : 5324;
        trace.push({ phase, effectId: effect.id, owner: effect.owner, modifier4096: factor, reason: "named_effect_active", sourceIds });
        namedModifiers.push({ id: effect.id, phase, factor, order: def.name === "technician" ? 100 : def.name === "hugePower" ? 200 : 300 });
      }
      const modifiersFor = (phase: "P1" | "A1" | "D1" | "F4") => {
        const active: { id: string; factor: number; order: number }[] = namedModifiers.filter(e => e.phase === phase);
        for (const effect of selected) {
          const def = effect.definition;
          if (def.kind !== "multiplier" || def.phase !== phase) continue;
          const matches = def.scope === effect.owner && (def.category === "any" || (move.model !== "fixed" && def.category === move.category));
          if (!matches) { trace.push({ phase, effectId: effect.id, owner: effect.owner, suppressed: true, reason: "scope_or_category" }); continue; }
          active.push({ id: effect.id, factor: def.factor4096, order: def.order });
        }
        if (new Set(active.map(e => e.order)).size !== active.length) stop("unsupported", "AMBIGUOUS_EFFECT_ORDER");
        return active.sort((a, b) => a.order - b.order);
      };
      // Resolve ALL active phases before immunity can yield a numeric outcome.
      const groups = { P1: modifiersFor("P1"), A1: modifiersFor("A1"), D1: modifiersFor("D1"), F4: modifiersFor("F4") };
      const modifyGroup = (value: number, phase: keyof typeof groups, builtins: number[] = []) => {
        const group = groups[phase];
        const modifier = combine4096([...builtins, ...group.map(e => e.factor)]);
        for (const effect of group) trace.push({ phase, effectId: effect.id, modifier4096: effect.factor, rounding: "halfUp", reason: "combine_in_declared_order" });
        const after = Math.max(1, applyRatio(value, modifier, 4096, "halfDown"));
        trace.push({ phase: phase === "P1" ? "P2" : phase, before: value, after, modifier4096: modifier, rounding: "halfDown" });
        return after;
      };
      let rolls: number[];
      if (move.model === "fixed") {
        if (Object.values(groups).some(group => group.length)) stop("unsupported", "FIXED_EFFECT_INTERACTION");
        rolls = [immune ? 0 : move.damage];
        trace.push({ phase: "Fixed", after: rolls[0], reason: "explicit_fixture_fixed_model" });
      } else {
        const power = modifyGroup(resolvedPower, "P1", context.helpingHand ? [rules.modifiers.helpingHand] : []);
        const attackStat = move.category === "physical" ? "attack" : "spAttack";
        const defenseStat = move.category === "physical" ? "defense" : "spDefense";
        const attackStage = context.critical ? Math.max(0, request.attacker.stages[attackStat]) : request.attacker.stages[attackStat];
        const defenseStage = context.critical ? Math.min(0, request.defender.stages[defenseStat]) : request.defender.stages[defenseStat];
        const attack = modifyGroup(applyStage(attackerStats[attackStat], attackStage), "A1");
        const defense = modifyGroup(applyStage(defenderStats[defenseStat], defenseStage), "D1");
        let base = baseDamage(power, attack, defense);
        trace.push({ phase: "B1", after: base, rounding: "floor" });
        const apply = (value: number, modifier: number, phase: string, roll?: number) => {
          const after = applyRatio(value, modifier, 4096, "halfDown");
          trace.push({ phase, before: value, after, modifier4096: modifier, rounding: "halfDown", ...(roll === undefined ? {} : { roll }) });
          return after;
        };
        if (move.target === "spread" && context.targetsActuallyHit > 1) base = apply(base, rules.modifiers.spread, "F1.spread");
        if ((context.weather === "sun" && move.type === "fire") || (context.weather === "rain" && move.type === "water")) base = apply(base, rules.modifiers.weatherBoost, "F1.weather");
        if ((context.weather === "rain" && move.type === "fire") || (context.weather === "sun" && move.type === "water")) base = apply(base, rules.modifiers.weatherWeaken, "F1.weather");
        if (context.critical) base = apply(base, rules.modifiers.critical, "F1.critical");
        const screen = context.auroraVeilOnDefenderSide || (move.category === "physical" ? context.reflectOnDefenderSide : context.lightScreenOnDefenderSide);
        if (screen && context.critical) trace.push({ phase: "F4.screen", suppressed: true, reason: "critical" });
        const screenModifiers = screen && !context.critical ? [request.format === "singles" ? rules.modifiers.screenSingles : rules.modifiers.screenDoubles] : [];
        const finalModifier = combine4096([...screenModifiers, ...groups.F4.map(e => e.factor)]);
        for (const effect of groups.F4) trace.push({ phase: "F4", effectId: effect.id, modifier4096: effect.factor, rounding: "halfUp" });
        rolls = Array.from({ length: 16 }, (_, i) => {
          let damage = applyRatio(base, 85 + i, 100, "floor");
          trace.push({ phase: "F2.random", before: base, after: damage, rounding: "floor", roll: 85 + i });
          if (attackerForm.types.includes(move.type)) damage = apply(damage, rules.modifiers.stab, "F3.stab", 85 + i);
          const typed = applyRatio(damage, typeN, typeD, "floor");
          trace.push({ phase: "F3.type", before: damage, after: typed, rounding: "floor", roll: 85 + i });
          damage = typed;
          if (move.category === "physical" && request.attacker.status === "burn") damage = apply(damage, rules.modifiers.burn, "F3.burn", 85 + i);
          damage = apply(damage, finalModifier, "F4", 85 + i);
          const finalDamage = immune ? 0 : Math.max(1, damage);
          trace.push({ phase: "F5", before: damage, after: finalDamage, roll: 85 + i, reason: immune ? "immune" : "minimum_one" });
          return finalDamage;
        });
      }
      const min = Math.min(...rolls); const max = Math.max(...rolls);
      const currentHp = request.defender.currentHp ?? defenderStats.hp;
      const ko = statefulDefense && !immune
        ? { kind: "unavailable" as const, reason: "STATEFUL_DEFENSE" as const, oneHitProbability: fraction(BigInt(rolls.filter(n => n >= currentHp).length), BigInt(rolls.length)) }
        : analyzeKo(rolls, currentHp);
      if (ko.kind === "limitExceeded") stop("unsupported", "KO_RESOURCE_LIMIT");
      const distribution = new Map<number, number>();
      for (const roll of rolls) distribution.set(roll, (distribution.get(roll) ?? 0) + 1);
      const resultEvidence = requestEvidence();
      if (statefulDefense) resultEvidence.assumptions = [...resultEvidence.assumptions.filter(a => a !== "independent_identical_damage_rolls" && a !== "no_healing_or_between_hit_changes"), "initial_single_hit_clear_field_only", "stateful_defense_repeated_ko_not_simulated"];
      return { ...resultEvidence, status: "ok", rolls, distribution: [...distribution].map(([damage, count]) => ({ damage, count })), range: { min, max },
        damagePercent: { min: fraction(BigInt(min) * 100n, BigInt(defenderStats.hp)), max: fraction(BigInt(max) * 100n, BigInt(defenderStats.hp)) },
        remainingHp: { min: Math.max(0, currentHp - max), max: Math.max(0, currentHp - min) }, maximumHp: defenderStats.hp, currentHp, ko, trace };
    } catch (error) {
      if (error instanceof Stop) return failure(error.status, error.code, error.paths);
      if (error instanceof RangeError || error instanceof z.ZodError) return failure("invalid", "ARITHMETIC_OR_DATA_INVALID");
      throw error;
    }
  };

  const calculateNormal = (input: unknown) => {
    const parsed = normalSavedInputSchema.safeParse(input);
    if (!parsed.success) return failure("invalid", "INVALID_NORMAL_INPUT");
    const { moves, ...common } = parsed.data;
    return { status: "ok" as const, results: moves.map(moveId => calculateDamage({ ...common, moveId })) };
  };
  const calculateTop50 = (input: unknown, rankingInput: unknown) => {
    const parsed = top50SavedInputSchema.safeParse(input); const reference = rankingSchema.safeParse(rankingInput);
    if (!parsed.success || !reference.success) return failure("invalid", "INVALID_TOP50_INPUT");
    const data = parsed.data; const ranking = reference.data;
    if (data.rankingSnapshotId !== ranking.snapshotId || data.format !== ranking.format || data.sourceVersions.regulationId !== ranking.regulationId) return failure("invalid", "SNAPSHOT_MISMATCH");
    const entries = new Map(ranking.entries.map(e => [e.rankingEntryId, e]));
    for (const [id, build] of Object.entries(data.defenderOverrides)) {
      if (entries.get(id)?.pokemonFormId !== build.pokemonFormId) return failure("invalid", "OVERRIDE_ENTRY_MISMATCH");
    }
    const cells = ranking.entries.flatMap(entry => data.moves.map((moveId, moveIndex) => {
      const defender = data.defenderOverrides[entry.rankingEntryId] ?? entry.representativeBuild;
      const result = defender
        ? calculateDamage({ format: data.format, attacker: data.attacker, defender, moveId, conditions: data.conditions, sourceVersions: data.sourceVersions })
        : failure("missingContext", "DEFENDER_BUILD_MISSING", [`defenderOverrides.${entry.rankingEntryId}`]);
      return { rankingEntryId: entry.rankingEntryId, moveId, moveIndex, result };
    }));
    return { status: "ok" as const, cells };
  };
  return { calculateDamage, calculateNormal, calculateTop50 };
}
