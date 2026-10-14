#!/usr/bin/env node
/**
 * Create a wallet for each house agent and store its key as a Fly secret.
 *
 *   node scripts/house-wallets.mjs brinkwatch
 *   node scripts/house-wallets.mjs brinkwatch cresthold centreline gridloom touchstone
 *
 * The key goes from memory straight into `fly secrets import` (staged, so it
 * applies on the next deploy). It is never printed or written to disk; only
 * the address is shown, so the wallet can be funded. An agent that already
 * has a key is skipped: replacing the key of a funded, registered wallet
 * would orphan its money and its registration.
 */
import { spawnSync } from 'node:child_process';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const APP = process.env.FLY_APP ?? 'pokter';
const slugs = process.argv.slice(2);
if (slugs.length === 0) {
  console.error('Name the agents: node scripts/house-wallets.mjs brinkwatch [more…]');
  process.exit(1);
}
const envName = (slug) => `HOUSE_AGENT_${slug.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_KEY`;

const listed = spawnSync('fly', ['secrets', 'list', '-a', APP, '--json'], { encoding: 'utf8' });
if (listed.status !== 0) {
  console.error(`Could not list secrets for ${APP}: ${listed.stderr.trim()}`);
  process.exit(1);
}
const existing = new Set(JSON.parse(listed.stdout).map((secret) => secret.Name ?? secret.name));

const lines = [];
const created = [];
for (const slug of slugs) {
  const name = envName(slug);
  if (existing.has(name)) {
    console.log(`${slug.padEnd(12)} already has a wallet (${name}); left as it is.`);
    continue;
  }
  const key = generatePrivateKey();
  lines.push(`${name}=${key}`);
  created.push({ slug, address: privateKeyToAccount(key).address });
}
if (lines.length === 0) process.exit(0);

const imported = spawnSync('fly', ['secrets', 'import', '-a', APP, '--stage'], { input: `${lines.join('\n')}\n`, encoding: 'utf8' });
lines.length = 0;
if (imported.status !== 0) {
  console.error(`Fly refused the secrets; nothing was stored: ${imported.stderr.trim()}`);
  process.exit(1);
}
console.log('\nStored (staged; they apply on the next deploy). Fund these addresses:');
for (const { slug, address } of created) console.log(`${slug.padEnd(12)} ${address}`);
console.log('\nMainnet: about 0.003 BNB each. Testnet: tBNB from the faucet.');
