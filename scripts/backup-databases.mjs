#!/usr/bin/env node
/**
 * Back up the databases this release changes, on the production machine,
 * before the currency backfill or any other write.
 *
 *   node scripts/backup-databases.mjs <label>
 *
 * Runs over `fly ssh` (as `house-register.mjs` does). Each database is copied
 * with SQLite's online backup, which is consistent while the app is running,
 * into /data/backups/<label>/ on the same volume; each copy is checked with
 * `PRAGMA integrity_check` and its row counts are printed beside the live
 * ones. Free space is checked first. To keep a copy off the machine as well:
 *
 *   fly sftp get -a pokter /data/backups/<label>/jobs.db ./jobs-<label>.db
 *
 * Restore (only with the app stopped, and only for a genuine failure): copy a
 * backup over its live file. See docs/release/hire-tokens.md, section 7.
 */
import { spawnSync } from 'node:child_process';

const APP = process.env.FLY_APP ?? 'pokter';
const label = process.argv[2];
if (!/^[\w-]{1,64}$/.test(label ?? '')) {
  console.error('Usage: node scripts/backup-databases.mjs <label>   (letters, digits, - and _)');
  process.exit(1);
}

const payload = `(async () => {
  const { DatabaseSync, backup } = require('node:sqlite');
  const fs = require('node:fs');
  const path = require('node:path');
  const root = process.env.BACKUP_ROOT || '/data/backups';
  const dir = path.join(root, ${JSON.stringify(label)});
  const sources = { jobs: process.env.JOB_DB_PATH, briefs: process.env.BRIEF_DB_PATH, provider: process.env.PROVIDER_DB_PATH, quest: process.env.QUEST_DB_PATH };
  if (fs.existsSync(dir)) { console.log(JSON.stringify({ error: 'backup label already used: ' + dir })); return; }
  const need = Object.values(sources).filter((p) => p && fs.existsSync(p)).reduce((n, p) => n + fs.statSync(p).size, 0);
  fs.mkdirSync(root, { recursive: true });
  const st = fs.statfsSync(root);
  const free = st.bavail * st.bsize;
  if (free < need * 2) { console.log(JSON.stringify({ error: 'not enough free space', needBytes: need, freeBytes: free })); return; }
  fs.mkdirSync(dir, { recursive: true });
  const report = { dir, freeBytesBefore: free, databases: {} };
  for (const [name, src] of Object.entries(sources)) {
    if (!src || !fs.existsSync(src)) { report.databases[name] = { skipped: 'no file at ' + src }; continue; }
    const dest = path.join(dir, name + '.db');
    const live = new DatabaseSync(src, { readOnly: true });
    await backup(live, dest);
    const copy = new DatabaseSync(dest, { readOnly: true });
    const tables = copy.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
    const counts = {};
    for (const t of tables) {
      const q = 'SELECT COUNT(*) AS n FROM "' + t.replace(/"/g, '""') + '"';
      counts[t] = { backup: copy.prepare(q).get().n, live: live.prepare(q).get().n };
    }
    report.databases[name] = { file: dest, bytes: fs.statSync(dest).size, integrity: copy.prepare('PRAGMA integrity_check').get().integrity_check, counts };
    copy.close();
    live.close();
  }
  console.log(JSON.stringify(report, null, 1));
})().catch((e) => console.log(JSON.stringify({ error: String(e) })));`;
if (process.env.BACKUP_LOCAL === '1') {
  /* Local rehearsal against ./data: the same payload, no fly (it runs as CommonJS under \`node -e\` there). */
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url); // eslint-disable-line @typescript-eslint/no-unused-vars -- read by the evaluated payload
  await eval(payload);
} else {
  const encoded = Buffer.from(payload).toString('base64');
  /* No quotes in the remote command: \`fly ssh console -C\` strips them (see house-register.mjs). */
  const run = spawnSync('fly', ['ssh', 'console', '-a', APP, '-C', `node -e eval(atob(process.argv[1])) ${encoded}`], { encoding: 'utf8' });
  process.stdout.write(run.stdout);
  if (run.status !== 0) process.stderr.write(run.stderr);
  process.exit(run.status ?? 1);
}
