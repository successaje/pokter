import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';


const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('an avatar shows the agent’s initial, drawn inline, until a picture or the mark loads', () => {
  const avatar = code('ui/AvatarImage.tsx');
  assert.match(avatar, /function initialArt\(name: string\): string/);
  assert.match(avatar, /data:image\/svg\+xml,/);
  assert.match(avatar, /backgroundImage: state === 'loaded' \? undefined : \[showing === src \? `url\("\$\{fallback\}"\)` : null, `url\("\$\{initialArt\(name\)\}"\)`\]/);
});

test('home and Discover say when Pokter last checked an agent, beside the hireable count', () => {
  for (const path of ['app/(site)/page.tsx', 'app/(site)/discover/page.tsx']) {
    const page = code(path);
    assert.match(page, /const checkedAt = lastCheckAt\(\);/, path);
    assert.match(page, /· checked <Ago at=\{checkedAt\} \/>/, path);
  }
  assert.match(code('lib/history/last-check.ts'), /store\.recent\(1\)\[0\]\?\.probedAt/);
});

test('a card shows where its money settles as a coloured pill beside the price', () => {
  const card = code('features/agents/AgentCard.tsx');
  assert.match(card, /money\.real \? 'bg-ok-wash text-ok' : 'bg-watch-wash text-watch'/);
  assert.match(card, /<PriceText row=\{row\} className="text-\[1\.45rem\][^"]*" \/>\n[^\n]*per job[^\n]*\n\s*<NetworkTag chainId=\{row\.hireChainId\} \/>/);
});

test('Proof opens with what outside buyers got, its mainnet share, and the verifier beside it', () => {
  const proof = code('app/(site)/proof/page.tsx');
  assert.match(proof, /settled with the agent&rsquo;s answer for buyers outside Pokter&rsquo;s team/);
  assert.match(proof, /outside\.answeredMainnet === 0\n\s*\? ', none on BNB Chain yet\.'/);
  assert.ok(proof.indexOf('Check every receipt against the chain') < proof.indexOf('aria-label="Filters"'), 'the verifier is above the filters');
  assert.match(proof, /\{CORRECTIONS\.length\} corrections, dated/);
  const activity = code('lib/erc8183/outside-activity.ts');
  assert.match(activity, /const answeredMainnet = answeredAtAll\.filter\(\(job\) => job\.chainId === 56 && !paidToCourier\(job\)\)\.length;/);
  assert.match(activity, /fundingEvidence\(job\) !== 'funded'/);
});
