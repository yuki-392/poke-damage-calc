import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { parse } from "yaml";
import { apiSchemas, type SavedInputSnapshot, type ActiveRankingsDTO } from "../src/lib/contracts/schemas";
import type { SavedInputSnapshot as ReferenceSnapshot, ActiveRankingsDTO as ReferenceRankings } from "../design/champions-codex-handoff-v1.0/contracts/shared-contract.reference";

describe("P0-02: canonical contract alignment", () => {
  it("keeps the handoff wire types", () => {
    expectTypeOf<SavedInputSnapshot>().toEqualTypeOf<ReferenceSnapshot>();
    expectTypeOf<ActiveRankingsDTO>().toEqualTypeOf<ReferenceRankings>();
  });
  it("SCOPE-01: implements only the six approved API paths in the generated contract", () => {
    const api = parse(readFileSync("contracts/openapi.yaml", "utf8"));
    expect(Object.keys(api.paths).sort()).toEqual([
      "/api/v1/bootstrap", "/api/v1/calculations", "/api/v1/calculations/{id}",
      "/api/v1/catalog/{kind}", "/api/v1/rankings/active", "/api/v1/rankings/snapshots/{snapshotId}",
    ].sort());
    expect(JSON.stringify(api)).not.toMatch(/shared snapshot|\/shares|shared_calculations|"Shares"/i);
    expect(Object.keys(api.components.schemas).sort()).toEqual(Object.keys(apiSchemas).sort());
  });
});
