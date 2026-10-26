#!/usr/bin/env node
/**
 * Run the job-currency backfill on the production server, from here.
 *
 *   node scripts/currency-backfill.mjs                 dry run: reads, writes nothing
 *   node scripts/currency-backfill.mjs --write <runId> writes, page by page, with an audit row per job
 *
 * The request runs on the machine over `fly ssh`, authorised by the server's
 * own SWEEP_SECRET, which never leaves it (as `house-register.mjs` does).
 * It reads `jobPaymentToken` for every job whose token is unknown and, on a
 * write run, fills only nulls: a repeated page is harmless and a failed read
 * stays unknown. See docs/release/hire-tokens.md, section 6.
 */
import { spawnSync } from 'node:child_process';

const APP = process.env.FLY_APP ?? 'pokter';
const write = process.argv[2] === '--write';
const runId = process.argv[3];
if (write && !/^[\w-]{1,64}$/.test(runId ?? '')) {
  console.error('Usage: node scripts/currency-backfill.mjs [--write <runId>]   (runId: letters, digits, - and _)');
  process.exit(1);
}

const payload = `(async () => {
  const call = (body) => fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/jobs/backfill-currency', {
    method: 'POST', headers: { authorization: 'Bearer ' + process.env.SWEEP_SECRET, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => r.json());
  const write = ${JSON.stringify(write)};
  let after = null, pages = 0, examined = 0, read = 0, unread = 0, written = 0, last = null;
  const byToken = {};
  do {
    last = await call({ write, limit: 200, ...(write ? { runId: ${JSON.stringify(runId ?? '')} } : {}), ...(after ? { after } : {}) });
    if (last.error) { console.log(JSON.stringify({ error: last.error })); return; }
    pages += 1; examined += last.examined; read += last.read; unread += last.unread; written += last.written;
    for (const [k, v] of Object.entries(last.byToken ?? {})) byToken[k] = (byToken[k] ?? 0) + v;
    after = last.nextCursor;
  } while (after && pages < 500);
  const unreadSample = (last.readings ?? []).filter((r) => r.outcome === 'unread').slice(0, 5);
  console.log(JSON.stringify({ write, runId: last.runId, pages, examined, read, unread, written, byToken, remainingUnknown: last.remainingUnknown, unreadSample }, null, 1));
})().catch((e) => console.error(String(e)));`;
const encoded = Buffer.from(payload).toString('base64');
/* No quotes in the remote command: \`fly ssh console -C\` strips them (see house-register.mjs). */
const run = spawnSync('fly', ['ssh', 'console', '-a', APP, '-C', `node -e eval(atob(process.argv[1])) ${encoded}`], { encoding: 'utf8' });
process.stdout.write(run.stdout);
if (run.status !== 0) process.stderr.write(run.stderr);
process.exit(run.status ?? 1);
