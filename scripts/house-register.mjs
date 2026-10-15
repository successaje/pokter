#!/usr/bin/env node
/**
 * Register a house agent on one chain, from inside the production server.
 *
 *   node scripts/house-register.mjs brinkwatch 97
 *
 * The agent's key exists only in the server's secrets, so the request runs
 * there over `fly ssh`, authorised by the server's own sweep secret, which
 * never leaves the machine. Safe to repeat: a registered agent is reported,
 * not minted again, and an unfunded wallet is reported with what it needs.
 */
import { spawnSync } from 'node:child_process';

const APP = process.env.FLY_APP ?? 'pokter';
const [slug, chain] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(slug ?? '') || !['56', '97'].includes(chain ?? '')) {
  console.error('Usage: node scripts/house-register.mjs <agent> <56|97>');
  process.exit(1);
}
const payload = `fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/house/register', {
  method: 'POST',
  headers: { authorization: 'Bearer ' + process.env.SWEEP_SECRET, 'content-type': 'application/json' },
  body: JSON.stringify({ slug: ${JSON.stringify(slug)}, chainId: ${Number(chain)} }),
}).then((r) => r.text()).then((t) => console.log(t)).catch((e) => console.error(String(e)));`;
const encoded = Buffer.from(payload).toString('base64');
/*
 * No quotes anywhere in the remote command: `fly ssh console -C` strips
 * them, which turned 'base64' into a bare name the first time this ran.
 * The request travels as its own argument and is decoded with atob.
 */
const run = spawnSync('fly', ['ssh', 'console', '-a', APP, '-C', `node -e eval(atob(process.argv[1])) ${encoded}`], { encoding: 'utf8' });
process.stdout.write(run.stdout);
if (run.status !== 0) process.stderr.write(run.stderr);
process.exit(run.status ?? 1);
