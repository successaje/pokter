import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { chainLabel, shortNetworkLabel } from '../src/lib/network/presentation';


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

test('a card shows where its money settles as a coloured pill on its own line under the price', () => {
  const card = code('features/agents/AgentCard.tsx');
  // One tag for every card that shows money, agents and requests alike (ui/Network.tsx).
  assert.match(code('ui/Network.tsx'), /const networkTone = \(mainnet: boolean\) => mainnet \? 'bg-ok-wash text-ok' : 'bg-watch-wash text-watch'/);
  assert.match(card, /import \{ NetworkTag \} from '@\/ui\/Network';/);
  assert.match(code('features/briefs/RequestRow.tsx'), /<NetworkTag chainId=\{request\.chainId\} \/>/);
  // A request's own page says it the same way: in its summary's Network row, and over the proposal form.
  assert.match(code('app/(site)/requests/[id]/page.tsx'), /\['Network', <NetworkTag key="n" chainId=\{brief\.chainId\} \/>\]/);
  assert.match(code('features/briefs/RequestDetail.tsx'), /<NetworkTag chainId=\{request\.chainId\} className="self-start" \/>/);
  for (const file of ['features/briefs/RequestDetail.tsx', 'app/(site)/requests/[id]/page.tsx']) {
    assert.doesNotMatch(code(file), /test tokens'|BNB Chain · real/, `${file} no longer spells the network out in money words`);
  }
  // The price line holds the price and "per job" only; the tag follows it, one tag or two, never beside it.
  assert.match(card, /<PriceText row=\{row\} className="text-\[1\.45rem\][^"]*" \/>\n[^\n]*per job[^\n]*\n\s*<\/span>\n\s*<NetworkTag chainId=\{row\.hireChainId\} alsoHireOn=\{hireChainIds\} className="mt-2 self-start" \/>/);
});

test('an agent’s or a job’s number, and every network switch, say Mainnet or Testnet', () => {
  assert.equal(shortNetworkLabel(56), 'Mainnet');
  assert.equal(shortNetworkLabel(97), 'Testnet');
  assert.equal(shortNetworkLabel(1), 'chain 1', 'an unknown chain is named, never guessed to be either');
  // Sentences, payment steps and wallet prompts keep the chain's own name: it is what a wallet shows.
  assert.equal(chainLabel(56), 'BNB Chain');
  for (const file of [
    'features/hire/HireFlow.tsx',
    'features/briefs/ProposalForm.tsx',
    'features/briefs/ProposalList.tsx',
    'features/briefs/RequestForm.tsx',
    'features/briefs/RequestsBoard.tsx',
    'features/studio/CreateAgent.tsx',
    'features/studio/StudioClient.tsx',
    'features/profile/ProfileEditor.tsx',
    'app/(site)/builders/[address]/page.tsx',
    'lib/search/header-query.ts',
    'features/agents/AgentCard.tsx',
    'features/discover/FilterBar.tsx',
    'features/discover/HirePulse.tsx',
    'features/home/data.ts',
    'features/compare/CompareView.tsx',
    'features/workspace/JobDetail.tsx',
    'features/studio/LaunchKit.tsx',
  ]) {
    assert.doesNotMatch(code(file), /'BNB Chain'|'BNB Testnet'|'BNB testnet'/, `${file} labels a number or a switch with the chain's name`);
  }
  // The hire page's switch, and the deploy check that finds it after a release.
  assert.match(code('features/hire/HireFlow.tsx'), /\) : shortNetworkLabel\(option\.chainId\)\}/);
  const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(deploy, /grep -qE 'role="radio"\[\^>\]\*>Mainnet<'/);
  assert.match(deploy, /grep -qE 'role="radio"\[\^>\]\*>Testnet<'/);
});

test('Proof gives mainnet and testnet equal footing and names its evidence limits', () => {
  const proof = code('app/(site)/proof/page.tsx');
  assert.match(proof, /grid gap-4 xl:grid-cols-2/);
  assert.match(proof, /NetworkSummary network="mainnet"/);
  assert.match(proof, /NetworkSummary network="testnet"/);
  assert.match(proof, /Testnet tokens have no monetary value/);
  assert.match(proof, /does not establish an independent person or an unsubsidised purchase/);
  assert.match(proof, /independent verifier/i);
  assert.match(proof, /Newest status read/);
  const activity = code('lib/erc8183/outside-activity.ts');
  assert.match(activity, /const answeredMainnet = answeredAtAll\.filter\(\(job\) => job\.chainId === 56 && !paidToCourier\(job\)\)\.length;/);
  assert.match(activity, /const bought = buyerJobs\.filter\(\(job\) => !isSelfHire\(job\) && !isLifecycleDemo\(job\) && fundingEvidence\(job\) === 'funded'\);/);
});

test('Discover counts funded jobs, open jobs and deliveries from one population', () => {
  const activity = code('lib/erc8183/outside-activity.ts');
  // Every indexed job put demonstrations and self-hires in "funded" but not in "deliveries".
  assert.doesNotMatch(activity, /indexedJobs|activeJobs/);
  for (const figure of [/funded: bought\.length,/, /open: bought\.filter\(/, /const answeredAtAll = bought\.filter\(/, /for \(const job of bought\)/]) assert.match(activity, figure);
});
