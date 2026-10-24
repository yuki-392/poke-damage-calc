import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { auditFormatCoverage } from "./top50-coverage";
import { createDamageEngine } from "../../src/lib/engine/engine";
import { makeEngineCatalog, makeDamageRequest } from "../../tests/engine-fixtures";

const cacheDir=process.argv[2]; const output=process.argv[3];
if (!cacheDir || !output) throw new Error("Usage: pnpm audit:coverage <temporary-cache> <aggregate-output.json>");
const temporaryRoot=resolve(cacheDir);
const manifest=z.array(z.object({ key:z.string(), url:z.url(), fetchedAt:z.iso.datetime({ offset:true }), sha256:z.string().regex(/^[0-9a-f]{64}$/) }))
  .parse(JSON.parse(readFileSync(resolve(cacheDir,"manifest.json"),"utf8")));
function read(key:string): unknown {
  const entry=manifest.find(e => e.key===key);
  if (!entry) throw new Error("MISSING_SOURCE: "+key);
  const bytes=readFileSync(resolve(temporaryRoot,key+".json"));
  if (createHash("sha256").update(bytes).digest("hex")!==entry.sha256) throw new Error("SOURCE_HASH_MISMATCH: "+key);
  return JSON.parse(bytes.toString("utf8"));
}
const index=z.object({ generatedAt:z.iso.datetime(), dataVersion:z.string(), defaultSeason:z.string(),
  pokemon:z.array(z.object({ summary:z.object({ forms:z.array(z.unknown()) }) })) }).parse(read("api-index"));
const resources={
  forms:index.pokemon.flatMap(p => p.summary.forms),
  roster:read("master-roster"), stats:read("master-stats"), natures:read("master-natures"),
  abilities:read("master-abilities"), items:read("master-items"), moves:read("master-moves"),
};
// Synthetic probe only: upstream values never enter an execution:'fixture' catalog.
const probe=createDamageEngine({ ...makeEngineCatalog(),execution:"production" }).calculateDamage(makeDamageRequest());
if (probe.status!=="unsupported" || probe.code!=="RULES_NOT_APPROVED") throw new Error("PRODUCTION_SAFETY_GATE_CHANGED");
const formats=["singles","doubles"].map(format => auditFormatCoverage(read("meta-"+format),resources));
const report={
  auditedAt:new Date().toISOString(), scope:"Phase 2-B stage 3, aggregate coverage only", sources:manifest,
  upstream:{ generatedAt:index.generatedAt,dataVersion:index.dataVersion,seasonLabel:index.defaultSeason,regulationId:null },
  pinnedMasterRevision:"cb874a3040174314f67642f382143cc8a401122a",
  implementationEvidence:["src/lib/engine/engine.ts","src/lib/engine/contracts.ts","src/lib/engine/champions-rules.ts","src/lib/engine/champions-moves.ts"].map(path => ({
    path,sha256:createHash("sha256").update(readFileSync(path)).digest("hex"),
  })),
  retention:{ rawResponsesCommitted:false,rawCacheDeletedAt:null },
  attribution:[
    { label:"Battle data provided by Pokémon Champions Battle Data",url:"https://championsbattledata.com/",terms:"https://championsbattledata.com/api-rules/",
      storage:"Only aggregate diagnostics retained. This run's raw temporary files must be removed after verification." },
    { label:"Pokemon Champions Data Contributors",url:"https://github.com/otterlyclueless/pokemon-champions-data",license:"https://creativecommons.org/licenses/by/4.0/",
      changes:"Name/alias lookups and aggregate missing-field counts. No source fields or approval flags changed." },
  ],
  productionProbe:{ status:probe.status,code:probe.code,input:"synthetic only" },
  formats, realDataCalculationsExecuted:0, realDataCatalogPromotions:0,
  ingameVerification:{ P0_05:"unverified",P0_06:"unverified" },
  unmeasured:["Population-weighted move coverage","Joint build usage","Raw points/nature completeness for all TOP50","Game accuracy","Real-data end-to-end success"],
};
writeFileSync(output,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(formats.map(r => ({ format:r.format,data:r.data,rules:r.rules,attack:r.attack,blockers:r.blockers,missing:r.missing })),null,2));
