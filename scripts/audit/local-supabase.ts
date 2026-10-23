/** Local-only platform verification. Never reads .env or uses a cloud project. */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import assert from "node:assert/strict";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Usage: pnpm audit:local <summary.json>");
assert.match(readFileSync("supabase/config.toml", "utf8"), /^project_id = "poke-damage-calc"$/m);
const run = (cmd: string, args: string[], input?: string) => {
  const result = spawnSync(cmd, args, { encoding: "utf8", input, timeout: 30_000, env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" } });
  if (result.status !== 0) throw new Error(`${cmd} local audit failed (exit ${result.status}); inspect local logs without publishing secrets`);
  return result.stdout;
};
// Status contains generated local keys. Capture in memory, never print or save them.
const status = z.object({ API_URL: z.url(), ANON_KEY: z.string(), SERVICE_ROLE_KEY: z.string() }).parse(JSON.parse(run("./node_modules/.bin/supabase", ["status", "-o", "json", "--agent", "no"])));
const url = new URL(status.API_URL);
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55321"); assert.equal(url.protocol, "http:");
const container = "supabase_db_poke-damage-calc";
const query = (sql: string) => run("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1"], sql);
const inventorySql = `select jsonb_build_object('version',current_setting('server_version'),
  'publicTables',(select coalesce(jsonb_agg(tablename),'[]'::jsonb) from pg_tables where schemaname='public'),
  'publicPolicies',(select count(*) from pg_policies where schemaname='public'),
  'applicationMigrationHistory',to_regclass('supabase_migrations.schema_migrations'),
  'authMigrationHistory',to_regclass('auth.schema_migrations'),
  'storageMigrationHistory',to_regclass('storage.migrations'),
  'authUsers',(select count(*) from auth.users));`;
const inventory = JSON.parse(query(inventorySql).trim());
const probe = query(readFileSync("scripts/audit/local-database.sql", "utf8"));
assert.match(probe, /PASS: temporary CHECK\/PK\/FK/);

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const client = createClient(status.API_URL, status.ANON_KEY, options);
const email = `phase01-audit-${randomUUID()}@example.test`;
let userId: string | undefined;
let signedOut = false;
const checks: Record<string, string> = {};
try {
  const anonymous = await client.auth.getUser();
  assert(anonymous.error); checks.noSessionRejected = "pass";
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: "http://127.0.0.1:3000/auth/callback" } });
  assert.equal(link.error, null);
  userId = link.data.user.id;
  assert.equal(new URL(link.data.properties.action_link).hostname, "127.0.0.1");
  checks.localMagicLinkGeneration = "pass";
  // A link for a new address may be issued as signup. Follow the issued type;
  // never assume every generateLink({type:magiclink}) response is magiclink.
  const issuedType = z.enum(["signup", "magiclink"]).parse(link.data.properties.verification_type);
  checks.issuedLinkType = issuedType;
  const verified = await client.auth.verifyOtp({ type: issuedType, token_hash: link.data.properties.hashed_token });
  assert.equal(verified.error, null); assert(verified.data.session);
  checks.magicLinkVerification = "pass";
  const current = await client.auth.getUser();
  assert.equal(current.error, null); assert.equal(current.data.user.id, userId);
  checks.verifiedUserIdentity = "pass";
  const reuse = await admin.auth.verifyOtp({ type: issuedType, token_hash: link.data.properties.hashed_token });
  assert(reuse.error); checks.magicLinkReuseRejected = "pass";
  const refreshToken = verified.data.session.refresh_token;
  assert.equal((await client.auth.signOut({ scope: "global" })).error, null);
  signedOut = true; checks.signOut = "pass";
  const refreshed = await client.auth.refreshSession({ refresh_token: refreshToken });
  assert(refreshed.error); checks.revokedRefreshRejected = "pass";
  const returningLink = await admin.auth.admin.generateLink({ type: "magiclink", email });
  assert.equal(returningLink.error, null);
  assert.equal(returningLink.data.properties.verification_type, "magiclink");
  const returning = await client.auth.verifyOtp({ type: "magiclink", token_hash: returningLink.data.properties.hashed_token });
  assert.equal(returning.error, null); assert(returning.data.session);
  signedOut = false;
  const returningUser = await client.auth.getUser();
  assert.equal(returningUser.error, null); assert.equal(returningUser.data.user.id, userId);
  checks.existingUserMagicLink = "pass";
  assert.equal((await client.auth.signOut({ scope: "global" })).error, null);
  signedOut = true;
} finally {
  if (userId) {
    if (!signedOut) {
      const signOut = await client.auth.signOut({ scope: "global" });
      assert.equal(signOut.error, null, "Revoke the synthetic session before deletion");
    }
    // Only this run's newly generated, unique .test user. Never delete preexisting users.
    assert.equal((await admin.auth.admin.deleteUser(userId)).error, null);
    checks.syntheticUserCleanup = "pass";
  }
}
const after = JSON.parse(query(inventorySql).trim());
assert.equal(after.authUsers, inventory.authUsers);
assert.deepEqual(after.publicTables, inventory.publicTables);
assert.equal(query("select count(*) from pg_tables where tablename like 'champions_phase01_%';").trim(), "0");
const summary = {
  auditedAt: new Date().toISOString(), localOnly: true, apiUrl: status.API_URL,
  dockerVersion: run("docker", ["version", "--format", "{{.Server.Version}}" ]).trim(),
  cliVersion: run("./node_modules/.bin/supabase", ["--version"]).trim(),
  database: inventory, databaseProbe: "pass: temporary CHECK, PK, FK, RLS owner/anon/WITH CHECK; all probe SQL rolled back",
  authentication: checks, preservation: { authUserCountUnchanged: true, publicTablesUnchanged: true, probeTablesRemaining: 0 },
  notImplemented: ["application baseline migration", "application tables/constraints/RLS", "Next.js authentication callback", "saved calculations API"],
  notTested: ["Google OAuth (external provider not connected)", "email delivery and browser callback (admin-generated local Magic Link only)", "production Supabase/Vercel"],
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
