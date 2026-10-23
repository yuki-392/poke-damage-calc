import { describe, expect, it } from "vitest";
import { createContractValidator, parseSnapshotJson, MAX_SNAPSHOT_BYTES } from "../src/lib/contracts/validation";
import { masterCatalogSchema } from "../src/lib/contracts/master";
import { savedInputSnapshotSchema, apiSchemas } from "../src/lib/contracts/schemas";
import { makeBuild, makeCatalog, makeRanking, makeSnapshot } from "./fixtures";

const validator = () => createContractValidator(makeCatalog(), [makeRanking(), makeRanking("doubles")]);
const mutate = (path: string, value: unknown, mode: "normal" | "top50" = "normal") => {
  const result = JSON.parse(JSON.stringify(makeSnapshot(mode)));
  const keys = path.split(".");
  let parent = result;
  for (const key of keys.slice(0, -1)) parent = parent[key];
  parent[keys.at(-1)!] = value;
  return result;
};

describe("API-03 / REQ-06: save contract", () => {
  it.each(["normal", "top50"] as const)("roundtrips %s without mutating or adding fields", mode => {
    const original = makeSnapshot(mode);
    const result = validator().snapshot.parse(original);
    expect(result).toEqual(original);
    expect(result).not.toBe(original);
    expect(parseSnapshotJson(JSON.stringify(result), validator().snapshot)).toEqual(result);
  });

  it.each([
    ["payloadSchemaVersion", 2], ["payloadSchemaVersion", "1"], ["schemaVersion", "1"],
    ["input.attacker.statPoints.hp", -1], ["input.attacker.statPoints.hp", 33], ["input.attacker.statPoints.hp", 1.5],
    ["input.attacker.statPoints.speed", 1], ["input.attacker.statPoints.hp", "32"],
    ["input.attacker.natureId", null], ["input.attacker.natureId", "unknown"],
    ["input.attacker.natureFactors.attack", 1.1], ["input.attacker.natureFactors.hp", 1],
    ["input.attacker.stages.speed", 7], ["input.attacker.stages.defense", -7], ["input.attacker.stages.attack", 0.5],
    ["input.attacker.pokemonFormId", "unknown"], ["input.attacker.abilityId", "unknown"],
    ["input.attacker.abilityId", "test-illegal-ability"], ["input.attacker.abilityId", null],
    ["input.attacker.item", { kind: "known", itemId: "unknown" }], ["input.attacker.item", { kind: "customText", text: "" }],
    ["input.attacker.currentHp", 0], ["input.attacker.currentHp", 1.1],
    ["input.attacker.isMega", true], ["input.attacker.validity", { kind: "valid" }],
    ["input.moves", []], ["input.moves", Array(5).fill("test-move")], ["input.moves", ["unknown"]],
    ["input.conditions.weather", "hail"], ["input.conditions.targetsActuallyHit", 0], ["input.conditions.targetsActuallyHit", 4],
    ["input.conditions.targetsActuallyHit", 2], ["input.conditions.attackerGrounded", "yes"],
    ["input.conditions.supplementary", [{ kind: "multiplier", value: 2 }]],
    ["input.conditions.supplementary", [{ kind: "attackerWeightKg", kilograms: 0 }]],
    ["input.conditions.supplementary", [{ kind: "allyAbility", abilityId: "unknown", isActive: true }]],
    ["input.conditions.supplementary", [{ kind: "moveEffect", effectId: "test-effect", optionId: "unknown" }]],
    ["input.conditions.supplementary", [{ kind: "defenderWeightKg", kilograms: 1 }, { kind: "defenderWeightKg", kilograms: 2 }]],
    ["input.sourceVersions.ruleVersion", "missing"], ["input.sourceVersions.masterDataVersion", "missing"],
    ["input.sourceVersions.effectCatalogVersion", "missing"], ["input.sourceVersions.regulationId", "missing"],
    ["input.damage", [100, 200]], ["input.localDetailConditions", {}], ["input.activeTab", 0],
  ])("rejects %s = %j", (path, value) => {
    expect(validator().snapshot.safeParse(mutate(path as string, value)).success).toBe(false);
  });

  it("preserves hidden stats and supports boundary stages, null HP, 4 moves, and unknown item text", () => {
    const data = mutate("input.attacker.item", { kind: "customText", text: "効果不明の持ち物" });
    data.input.attacker.stages = { attack: -6, defense: 6, spAttack: -6, spDefense: 6, speed: 0 };
    data.input.moves = Array(4).fill("test-unlearned");
    expect(validator().snapshot.parse(data)).toEqual(data);
  });
  it("does not treat known unlearned moves or unsupported effects as unknown IDs", () => {
    expect(validator().snapshot.safeParse(mutate("input.moves", ["test-unlearned"])).success).toBe(true);
  });
  it("supports 2/3 actual hit targets in doubles", () => {
    const data = mutate("input.format", "doubles");
    for (const targets of [2, 3]) {
      data.input.conditions.targetsActuallyHit = targets;
      expect(validator().snapshot.safeParse(data).success).toBe(true);
    }
  });
  it("structural validation alone cannot certify master legality", () => {
    expect(savedInputSnapshotSchema.safeParse(mutate("input.attacker.natureId", "unknown")).success).toBe(true);
    expect(validator().snapshot.safeParse(mutate("input.attacker.natureId", "unknown")).success).toBe(false);
  });
  it("accepts a matching non-neutral nature without changing the hidden factors", () => {
    const data = mutate("input.attacker.natureId", "test-up");
    data.input.attacker.natureFactors.attack = 1.1;
    data.input.attacker.natureFactors.spAttack = 0.9;
    expect(validator().snapshot.parse(data)).toEqual(data);
  });
  it("validates defender builds and all three item states", () => {
    expect(validator().snapshot.safeParse(mutate("input.defender.statPoints.hp", 33)).success).toBe(false);
    expect(validator().snapshot.safeParse(mutate("input.attacker.item", { kind: "known", itemId: "test-item" })).success).toBe(true);
    expect(validator().snapshot.safeParse(mutate("input.attacker.item", { kind: "customText", text: "あ".repeat(101) })).success).toBe(false);
    expect(validator().snapshot.safeParse(mutate("input.attacker.item", { kind: "none", text: "discard me" })).success).toBe(false);
  });
  it("reports version and deleted snapshot errors without fallback", () => {
    const result = validator().snapshot.safeParse(mutate("input.sourceVersions.ruleVersion", "old"));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(i => i.message === "VERSION_INCOMPATIBLE")).toBe(true);
    const absent = createContractValidator(makeCatalog(), []).snapshot.safeParse(makeSnapshot("top50"));
    expect(absent.success).toBe(false);
    if (!absent.success) expect(absent.error.issues.some(i => i.message === "SNAPSHOT_UNAVAILABLE")).toBe(true);
  });
  it("rejects oversized UTF-8 JSON before parsing; accepts exactly the limit", () => {
    const json = JSON.stringify(makeSnapshot());
    const padded = json + " ".repeat(MAX_SNAPSHOT_BYTES - new TextEncoder().encode(json).length);
    expect(parseSnapshotJson(padded, validator().snapshot)).toEqual(makeSnapshot());
    expect(() => parseSnapshotJson(padded + " ", validator().snapshot)).toThrow(/PAYLOAD_TOO_LARGE/);
    expect(() => parseSnapshotJson('"' + "あ".repeat(90_000) + '"', validator().snapshot)).toThrow(/PAYLOAD_TOO_LARGE/);
    expect(() => parseSnapshotJson("{", validator().snapshot)).toThrow(/INVALID_JSON/);
  });
});

describe("REQ-05 / RANK-01: snapshot integrity", () => {
  it.each([
    ["input.rankingSnapshotId", "missing"], ["input.format", "doubles"],
    ["input.defenderOverrides", { "1": makeBuild() }],
    ["input.defenderOverrides", { "test-singles-entry-1": makeBuild("test-form-2") }],
  ])("rejects invalid snapshot relation: %s", (path, value) => {
    expect(validator().snapshot.safeParse(mutate(path as string, value, "top50")).success).toBe(false);
  });
  it("accepts 50 overrides and rejects 51", () => {
    const overrides = Object.fromEntries(makeRanking().entries.map(e => [e.rankingEntryId, makeBuild(e.pokemonFormId)]));
    expect(validator().snapshot.safeParse(mutate("input.defenderOverrides", overrides, "top50")).success).toBe(true);
    overrides.extra = makeBuild();
    expect(validator().snapshot.safeParse(mutate("input.defenderOverrides", overrides, "top50")).success).toBe(false);
  });
  it("requires 50 unique rows, forms and ranks", () => {
    for (const field of ["rank", "rankingEntryId", "pokemonFormId"] as const) {
      const ranking = JSON.parse(JSON.stringify(makeRanking()));
      ranking.entries[1][field] = ranking.entries[0][field];
      expect(validator().ranking.safeParse(ranking).success).toBe(false);
    }
    const ranking = makeRanking();
    ranking.entries.pop();
    expect(validator().ranking.safeParse(ranking).success).toBe(false);
  });
  it("preserves unknown usage and timestamps; rejects unsafe attribution URLs", () => {
    const ranking = makeRanking();
    expect(validator().ranking.parse(ranking)).toEqual(ranking);
    ranking.attribution.url = "javascript:alert(1)";
    expect(validator().ranking.safeParse(ranking).success).toBe(false);
  });
  it("requires coherent singles+doubles pairs without claiming ingame verification", () => {
    const publication = { publicationId: "test-publication", publishedAt: "2026-10-23T00:00:00Z", rankings: { singles: makeRanking(), doubles: makeRanking("doubles") } };
    expect(validator().activeRankings.parse(publication)).toEqual(publication);
    publication.rankings.doubles.format = "singles";
    expect(validator().activeRankings.safeParse(publication).success).toBe(false);
  });
  it("rejects unknown ranking forms and inconsistent verification claims", () => {
    const ranking = makeRanking(); ranking.entries[0]!.pokemonFormId = "missing";
    expect(validator().ranking.safeParse(ranking).success).toBe(false);
    const provenance = makeRanking(); provenance.verificationStatus = "verified_ingame";
    expect(validator().ranking.safeParse(provenance).success).toBe(false);
  });
  it("requires a representative build when measured or estimated, with matching origin", () => {
    const ranking = JSON.parse(JSON.stringify(makeRanking()));
    ranking.entries[0].buildOrigin = "estimated";
    expect(validator().ranking.safeParse(ranking).success).toBe(false);
    ranking.entries[0].representativeBuild = { ...makeBuild(), origin: "estimated" };
    expect(validator().ranking.safeParse(ranking).success).toBe(true);
    ranking.entries[0].representativeBuild.origin = "measured";
    expect(validator().ranking.safeParse(ranking).success).toBe(false);
  });
});

describe("P0-04: master contract, not proof of game correctness", () => {
  it("accepts a synthetic catalog with explicit provisional provenance", () => {
    expect(masterCatalogSchema.parse(makeCatalog())).toEqual(makeCatalog());
  });
  it("rejects illegal nature vectors, dangling IDs, and duplicate IDs", () => {
    const nature = makeCatalog(); nature.natures[0]!.factors.attack = 1.1;
    expect(masterCatalogSchema.safeParse(nature).success).toBe(false);
    const ability = makeCatalog(); ability.forms[0]!.legalAbilityIds = ["missing"];
    expect(masterCatalogSchema.safeParse(ability).success).toBe(false);
    const duplicate = makeCatalog(); duplicate.forms.push(duplicate.forms[0]!);
    expect(masterCatalogSchema.safeParse(duplicate).success).toBe(false);
  });
  it("rejects verified claims without evidence references", () => {
    const data = makeCatalog(); data.effects[0]!.support = "verified";
    expect(masterCatalogSchema.safeParse(data).success).toBe(false);
  });
  it("does not admit unconfirmed forms", () => {
    const data = makeCatalog(); data.forms[0]!.inclusion = "unconfirmed";
    const contracts = createContractValidator(data, []);
    expect(contracts.snapshot.safeParse(makeSnapshot()).success).toBe(false);
  });
  it("copies validation context so caller mutations cannot change a session's catalog", () => {
    const data = makeCatalog();
    const contracts = createContractValidator(data, []);
    data.forms[0]!.legalAbilityIds = ["test-illegal-ability"];
    expect(contracts.snapshot.safeParse(makeSnapshot()).success).toBe(true);
  });
});

describe("API write/read envelopes", () => {
  it("validates titles, snapshot semantics and revision", () => {
    expect(validator().calculationWrite.safeParse({ title: "保存", snapshot: makeSnapshot() }).success).toBe(true);
    expect(validator().calculationWrite.safeParse({ title: "", snapshot: makeSnapshot() }).success).toBe(false);
    expect(validator().calculationWrite.safeParse({ title: "保存", snapshot: mutate("input.attacker.natureId", "unknown") }).success).toBe(false);
    expect(apiSchemas.IfMatch.safeParse('"rev:1"').success).toBe(true);
    expect(apiSchemas.IfMatch.safeParse('"rev:0"').success).toBe(false);
    expect(apiSchemas.IfMatch.safeParse('rev:1').success).toBe(false);
  });
  it("rejects saved mode/format mismatch and zero revision", () => {
    const saved = { id: "f11a8c61-88fb-4464-a536-65cf869e169b", title: "保存", mode: "normal", format: "singles", revision: 1, createdAt: "2026-10-23T00:00:00Z", updatedAt: "2026-10-23T00:00:00Z", snapshot: makeSnapshot() };
    expect(validator().savedCalculation.safeParse(saved).success).toBe(true);
    expect(validator().savedCalculation.safeParse({ ...saved, mode: "top50" }).success).toBe(false);
    expect(validator().savedCalculation.safeParse({ ...saved, format: "doubles" }).success).toBe(false);
    expect(validator().savedCalculation.safeParse({ ...saved, revision: 0 }).success).toBe(false);
  });
  it("requires a form for learnset queries and rejects arbitrary catalog kinds", () => {
    expect(apiSchemas.CatalogQuery.safeParse({ kind: "learnsets", version: "v1" }).success).toBe(false);
    expect(apiSchemas.CatalogQuery.safeParse({ kind: "learnsets", version: "v1", formId: "test-form-1" }).success).toBe(true);
    expect(apiSchemas.CatalogQuery.safeParse({ kind: "dump", version: "v1" }).success).toBe(false);
  });
});
