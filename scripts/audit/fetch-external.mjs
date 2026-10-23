// Explicit one-shot, local audit fetch. No scheduler, mirror, DB import or public API.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const battle = "https://championsbattledata.com";
const master = "https://raw.githubusercontent.com/otterlyclueless/pokemon-champions-data/main";
const sources = {
  "api-index": `${battle}/api/index`,
  "meta-singles": `${battle}/data/builder/meta-singles.json`,
  "meta-doubles": `${battle}/data/builder/meta-doubles.json`,
  "metadata-tauros": `${battle}/api/metadata/tauros`,
  "battle-singles-garchomp": `${battle}/api/battle/Singles/garchomp`,
  "battle-doubles-garchomp": `${battle}/api/battle/Doubles/garchomp`,
  "master-roster": `${master}/pokemon/roster.json`,
  "master-natures": `${master}/natures/natures.json`,
  "master-stats": `${master}/pokemon/base-stats.json`,
  "master-moves": `${master}/moves/moves.json`,
  "master-abilities": `${master}/abilities/abilities.json`,
  "master-items": `${master}/items/items.json`,
  "master-learnsets": `${master}/learnsets/learnsets.json`,
  "master-commit": "https://api.github.com/repos/otterlyclueless/pokemon-champions-data/commits/main",
};
const cacheDir = mkdtempSync(join(tmpdir(), "champions-phase01-real-"));
const manifest = [];
try {
  for (const [key, url] of Object.entries(sources)) {
    const file = join(cacheDir, `${key}.json`);
    // Use the OS CA store on macOS. Never disable TLS verification.
    const result = spawnSync("curl", ["--fail", "--location", "--silent", "--show-error", "--max-time", "30", "--connect-timeout", "10", "--max-filesize", "12000000", url, "--output", file], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`FETCH_FAILED ${key}: ${result.stderr.trim()}`);
    const bytes = readFileSync(file);
    JSON.parse(bytes.toString("utf8"));
    manifest.push({ key, url, fetchedAt: new Date().toISOString(), sha256: createHash("sha256").update(bytes).digest("hex") });
    await new Promise(resolve => setTimeout(resolve, 500));
  }
} finally {
  writeFileSync(join(cacheDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  console.log(`Temporary cache: ${cacheDir}`);
  console.log("Remove this run's temporary cache after validation; do not commit or serve raw responses.");
}
