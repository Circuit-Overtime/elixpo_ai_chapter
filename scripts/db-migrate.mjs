#!/usr/bin/env node
// Apply pending D1 migrations from worker/migrations in order.
// Usage:  node scripts/db-migrate.mjs [--remote|--local]
//
// This script tracks applied migrations in a `_migrations` table so re-running
// only applies new ones. Both Wrangler and Next use the same explicit config
// and persistent local state, otherwise `npm run dev` can start against a
// separate, empty D1 database.

import { readdir, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { writeFileSync, unlinkSync } from 'node:fs'

const args = new Set(process.argv.slice(2))
const flag = args.has('--local') ? '--local' : '--remote'
// --init: mark every existing migration file as applied without running
// it. Use this once on a database that already has migrations 0001..N
// applied manually, before adopting this tracker.
const INIT_MODE = args.has('--init')
const DB_NAME = 'lixsketch'
const WRANGLER_CONFIG = 'wrangler.next.toml'
const LOCAL_PERSIST_DIR = '.wrangler/state'
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'worker/migrations')

function wranglerDatabaseArgs(...extra) {
  const common = ['wrangler', 'd1', 'execute', DB_NAME, flag, `--config=${WRANGLER_CONFIG}`]
  if (flag === '--local') common.push(`--persist-to=${LOCAL_PERSIST_DIR}`)
  return [...common, ...extra]
}

function run(cmd, cmdArgs, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: opts.capture ? ['inherit', 'pipe', 'inherit'] : 'inherit', shell: process.platform === 'win32' })
    let out = ''
    if (opts.capture) child.stdout.on('data', (d) => { out += d.toString(); process.stdout.write(d) })
    child.on('exit', (code) => code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}`)))
    child.on('error', reject)
  })
}

async function execSQL(sql) {
  const tmp = path.join(tmpdir(), `lixsketch-migration-${Date.now()}.sql`)
  writeFileSync(tmp, sql, 'utf8')
  try {
    return await run('npx', wranglerDatabaseArgs(`--file=${tmp}`), { capture: true })
  } finally {
    try { unlinkSync(tmp) } catch {}
  }
}

// Wrangler 4.87 no longer includes SELECT result rows when SQL is supplied
// through --file. Use --command for reads so migration history and schema
// probes receive their actual rows instead of only execution totals.
function querySQL(sql) {
  return run('npx', wranglerDatabaseArgs(`--command=${sql}`), { capture: true })
}

async function execFile(filePath) {
  await run('npx', wranglerDatabaseArgs(`--file=${filePath}`))
}

// 1. Ensure history table exists.
await execSQL(`CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);`)

// 2. Read applied migrations.
const appliedOut = await querySQL(`SELECT name FROM _migrations;`)
const applied = new Set()
// Wrangler output varies between JSON and a Unicode table depending on its
// version and terminal. Migration filenames are unique enough to parse from
// either representation without depending on the surrounding renderer.
for (const name of appliedOut.match(/\b\d{4}_[a-z0-9_.-]+\.sql\b/gi) || []) applied.add(name)

// 3. List migration files.
const files = (await readdir(MIGRATIONS_DIR))
  .filter((f) => f.endsWith('.sql'))
  .sort()

const pending = files.filter((f) => !applied.has(f))

// Safety check: if _migrations is empty AND `scenes` already exists, the
// caller probably ran migrations manually before adopting this tracker.
// Abort with a clear message instead of attempting non-idempotent
// ALTER TABLE statements.
if (!INIT_MODE && applied.size === 0) {
  const probe = await querySQL(`SELECT name FROM sqlite_master WHERE type='table' AND name='scenes';`)
  if (/\bscenes\b/.test(probe)) {
    console.error('\n✗ Schema already exists but _migrations history is empty.')
    console.error('  This usually means migrations were applied manually before this tracker was added.')
    console.error('  Run `npm run db:migrate -- --init` ONCE to seed history with every migration')
    console.error('  file marked as applied. Then re-run this command for any new pending migrations.\n')
    process.exit(1)
  }
}

if (INIT_MODE) {
  console.log(`Init mode: marking ${files.length} migration(s) as applied without running them.`)
  for (const f of files) {
    if (applied.has(f)) continue
    await execSQL(`INSERT INTO _migrations (name) VALUES ('${f.replace(/'/g, "''")}');`)
    console.log(`  ✓ ${f}`)
  }
  console.log(`✓ History seeded.`)
  process.exit(0)
}

if (!pending.length) {
  console.log(`✓ No pending migrations [${flag}].  ${applied.size} already applied.`)
  process.exit(0)
}

console.log(`Applying ${pending.length} pending migration(s) to D1 [${flag}]:`)
for (const f of pending) {
  console.log(`  → ${f}`)
  const full = path.join('worker/migrations', f)
  await execFile(full)
  await execSQL(`INSERT INTO _migrations (name) VALUES ('${f.replace(/'/g, "''")}');`)
}
console.log(`✓ Applied ${pending.length} migration(s).`)
