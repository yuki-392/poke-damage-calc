import { describe, expect, it } from "vitest";
import { createDamageEngine } from "../src/lib/engine/engine";
import { championsDefenseDefinitions, defenseContextOptions } from "../src/lib/engine/champions-defense";
import { championsMoveDefinitions } from "../src/lib/engine/champions-moves";
import { makeDefenseFixture, type DefenseName } from "./champions-defense-fixtures";
import { makeNamedMoveFixture } from "./champions-moves-fixtures";
import { rankingSchema } from "../src/lib/contracts/schemas";
import { makeTop50Fixture } from "./engine-fixtures";

type Setup = ReturnType<typeof makeDefenseFixture>;
const run = (s: Setup) => createDamageEngine(s.catalog).calculateDamage(s.request);
const state = (s: Setup, optionId: string) => { const c = s.request.conditions.supplementary.at(-1)!; if (c.kind === "moveEffect") c.optionId = optionId; };
describe("P2B4 scoped defensive candidates", () => {
  it("registers only three unverified defense rules and the requested move", () => {
    expect(Object.keys(championsDefenseDefinitions)).toEqual(["levitate", "airBalloon", "multiscale"]);
    expect(championsMoveDefinitions.shadowBall.model).toEqual({ model: "standard", power: 80, type: "ghost", category: "special", target: "single" });
    for (const d of Object.values(championsDefenseDefinitions)) {
      expect(d.evidence.verification).toBe("supported_unverified"); expect(d.evidence.gameEvidenceIds).toEqual([]);
    }
  });
  describe.each(["levitate", "airBalloon", "multiscale"] as DefenseName[])("%s", name => {
    it("requires explicit scoped context on a relevant attack", () => {
      const s = makeDefenseFixture(name); s.request.conditions.supplementary = [];
      expect(run(s)).toMatchObject({ status: "missingContext", code: "DEFENSE_CONTEXT_REQUIRED" });
    });
    it.each(defenseContextOptions.filter(o => o !== "active-single-hit-clear-field" && o !== "unknown-activity"))("rejects unimplemented interaction %s", option => {
      const s = makeDefenseFixture(name); state(s, option);
      expect(run(s)).toMatchObject({ status: "unsupported", code: "DEFENSE_INTERACTION_UNSUPPORTED" });
    });
    it("distinguishes explicitly unknown activity from unsupported suppression", () => {
      const s = makeDefenseFixture(name); state(s,"unknown-activity");
      expect(run(s)).toMatchObject({ status:"missingContext",code:"EFFECT_ACTIVITY_REQUIRED" });
    });
    it("rejects unknown context options as invalid", () => {
      const s = makeDefenseFixture(name); state(s, "made-up"); expect(run(s).status).toBe("invalid");
    });
    it("keeps production blocked", () => {
      const s = makeDefenseFixture(name); s.catalog.execution = "production";
      expect(run(s)).toMatchObject({ status: "unsupported", code: "RULES_NOT_APPROVED" });
    });
    it("does not promote unconfirmed availability", () => {
      const s = makeDefenseFixture(name); const def = s.catalog.effects[`champions:${name}`]!;
      if (def.kind === "championsDefense") def.evidence.availability = "unconfirmed";
      expect(run(s)).toMatchObject({ status: "unsupported", code: "NAMED_EFFECT_AVAILABILITY_UNCONFIRMED" });
    });
    it("uses identical normal and TOP50 defense evaluation across 200 cells", () => {
      const s = makeDefenseFixture(name, "earthquake", "lifeOrb"); const engine = createDamageEngine(s.catalog);
      const { moveId, ...common } = s.request; const moves = [moveId,"move:shadowBall","move:flamethrower","move:protect"];
      const normal = engine.calculateNormal({ ...common, moves });
      expect(normal.status).toBe("ok"); if (normal.status !== "ok") throw new Error("normal");
      const ranking = rankingSchema.parse(makeTop50Fixture().ranking);
      for (const row of ranking.entries) row.representativeBuild = { ...s.request.defender, pokemonFormId:row.pokemonFormId,origin:"estimated" };
      const top = engine.calculateTop50({ format:s.request.format,attacker:s.request.attacker,moves,conditions:s.request.conditions,sourceVersions:s.request.sourceVersions,rankingSnapshotId:ranking.snapshotId,defenderOverrides:{} },ranking);
      expect(top.status).toBe("ok"); if (top.status !== "ok") throw new Error("top50");
      expect(top.cells).toHaveLength(200);
      for (const cell of top.cells) expect(cell.result).toEqual(normal.results[cell.moveIndex]);
    });
    it("refuses fixed or unregistered incoming models", () => {
      const s = makeDefenseFixture(name); s.request.moveId = "test-move";
      expect(run(s)).toMatchObject({ status: "unsupported", code: "DEFENSE_MOVE_MODEL_UNSUPPORTED" });
    });
    it("does not apply incoming rules to the attacker", () => {
      const s = makeDefenseFixture(name, "shadowBall");
      if (name === "airBalloon") { s.request.attacker.item = s.request.defender.item; s.request.defender.item = { kind: "none" }; }
      else { s.request.attacker.abilityId = s.request.defender.abilityId; s.request.defender.abilityId = s.catalog.master.abilities[0]!.id; }
      s.request.conditions.supplementary = []; s.catalog.master.forms[1]!.types = ["psychic"];
      const result = run(s); expect(result.status).toBe("ok");
      if (result.status === "ok") expect(result.trace).toContainEqual(expect.objectContaining({ effectId: `champions:${name}`, evaluation: "inactive", reason: "incoming_only" }));
    });
    it("does not manufacture damage for Protect", () => { expect(run(makeDefenseFixture(name, "protect"))).toMatchObject({ status: "nonDamaging", gameVerified: false }); });
  });
  describe.each(["levitate", "airBalloon"] as const)("%s immunity", name => {
    it("returns exactly sixteen zeros against Ground", () => {
      const r = run(makeDefenseFixture(name)); expect(r.status).toBe("ok");
      if (r.status === "ok") { expect(r.rolls).toEqual(Array(16).fill(0)); expect(r.trace).toContainEqual(expect.objectContaining({ effectId: `champions:${name}`, evaluation: "active" })); expect(r.gameVerified).toBe(false); }
    });
    it("proves irrelevance for non-Ground without fabricating activity", () => {
      const s = makeDefenseFixture(name, "rockSlide"); s.request.conditions.supplementary = [];
      const r = run(s); expect(r.status).toBe("ok");
      if (r.status === "ok") expect(r.trace).toContainEqual(expect.objectContaining({ evaluation: "inactive", reason: "non_ground_attack" }));
    });
    it("requires grounded state when the Ground immunity matters", () => {
      const s = makeDefenseFixture(name); s.request.conditions.defenderGrounded = null;
      expect(run(s)).toMatchObject({ status: "missingContext", code: "GROUNDED_STATE_REQUIRED" });
    });
    it("does not guess grounding interactions", () => {
      const s = makeDefenseFixture(name); s.request.conditions.defenderGrounded = true;
      expect(run(s)).toMatchObject({ status: "unsupported", code: "GROUNDING_INTERACTION_UNSUPPORTED" });
    });
    it("does not let immunity conceal an unsupported other effect", () => {
      const s = makeDefenseFixture(name); s.request.attacker.item = { kind: "customText", text: "unknown" };
      expect(run(s).status).toBe("unsupported");
    });
  });
  it("combines both immunities without aliasing their context", () => {
    const s = makeDefenseFixture("levitate"); s.request.defender.item = { kind: "known", itemId: "fixture:airBalloon" };
    expect(run(s).status).toBe("missingContext");
    s.request.conditions.supplementary.push({ kind: "moveEffect", effectId: "champions:airBalloon", optionId: "active-single-hit-clear-field" });
    const r = run(s); expect(r.status === "ok" && r.rolls.every(n => n === 0)).toBe(true);
  });
  it("requires Multiscale HP rather than assuming full health", () => {
    const s = makeDefenseFixture("multiscale"); s.request.defender.currentHp = null;
    expect(run(s)).toMatchObject({ status: "missingContext", code: "DEFENDER_CURRENT_HP_REQUIRED" });
  });
  it("rejects HP above maximum", () => {
    const s = makeDefenseFixture("multiscale"); s.request.defender.currentHp = 176; expect(run(s)).toMatchObject({ status: "invalid", code: "CURRENT_HP_EXCEEDS_MAX" });
  });
  it("classifies HP below max as inactive, with unchanged damage", () => {
    const s = makeDefenseFixture("multiscale"); s.request.defender.currentHp = 174; s.request.conditions.supplementary = [];
    const r = run(s); const plain = makeNamedMoveFixture("earthquake"); plain.request.defender.currentHp = 174;
    const p = createDamageEngine(plain.catalog).calculateDamage(plain.request);
    expect(r.status === "ok" && p.status === "ok" && r.rolls).toEqual(p.status === "ok" && p.rolls);
    if (r.status === "ok") expect(r.trace).toContainEqual(expect.objectContaining({ evaluation: "inactive", reason: "hp_below_maximum" }));
  });
  it("halves at F4 but does not reuse full-HP damage for n-hit KO", () => {
    const r = run(makeDefenseFixture("multiscale")); expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.trace).toContainEqual(expect.objectContaining({ phase: "F4", evaluation: "active", modifier4096: 2048 }));
      expect(r.ko).toMatchObject({ kind: "unavailable", reason: "STATEFUL_DEFENSE" });
      expect(r.assumptions).not.toContain("independent_identical_damage_rolls");
    }
  });
  it("marks Multiscale irrelevant when the attack is already type-immune", () => {
    const r = run(makeDefenseFixture("multiscale","shadowBall")); expect(r.status).toBe("ok");
    if (r.status === "ok") { expect(r.ko.kind).toBe("immune"); expect(r.trace).toContainEqual(expect.objectContaining({ effectId:"champions:multiscale", evaluation:"inactive", reason:"attack_already_immune" })); }
  });
  it("reports exact one-hit KO probability without inventing repeated KO", () => {
    const s = makeDefenseFixture("multiscale", "shadowBall", "lifeOrb"); s.catalog.master.forms[0]!.types = ["ghost"]; s.catalog.master.forms[1]!.types = ["psychic"];
    s.request.attacker.stages.spAttack = 6;
    const r = run(s); expect(r.status).toBe("ok");
    if (r.status === "ok") { expect(r.ko).toMatchObject({ kind:"unavailable",oneHitProbability:{ numerator:"1",denominator:"1" } }); expect(r.remainingHp).toEqual({ min:0,max:0 }); }
  });
  it("keeps Shadow Ball single-target and rejects corrupted power", () => {
    const s = makeNamedMoveFixture("shadowBall"); s.request.format = "doubles"; s.request.conditions.targetsActuallyHit = 2;
    expect(run(s)).toMatchObject({ status:"invalid",code:"SINGLE_TARGET_COUNT" });
    s.request.conditions.targetsActuallyHit = 1; const move = s.catalog.moves[s.request.moveId]!;
    if (move.model === "standard") move.power = 81;
    expect(run(s)).toMatchObject({ status:"unsupported",code:"MOVE_MODEL_MISMATCH" });
  });
  it("keeps Shadow Ball production and secondary effect context unapproved", () => {
    const s = makeNamedMoveFixture("shadowBall"); s.catalog.execution = "production";
    expect(run(s)).toMatchObject({ status:"unsupported",code:"RULES_NOT_APPROVED" });
    s.catalog.execution = "fixture"; s.request.conditions.supplementary.push({ kind:"moveEffect",effectId:"champions:move:shadowBall",optionId:"spdef-drop" });
    expect(run(s).status).toBe("invalid");
  });
});
