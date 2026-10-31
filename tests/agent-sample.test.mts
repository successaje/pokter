import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { structuredProfile, type StructuredInput } from '../src/features/agent/structured';

/*
 * An agent page's sample of what it delivers. Touchstone's page said it
 * had "not delivered a paid job through Pokter yet" while the same page
 * listed eight delivered jobs: the stored copies of mainnet deliveries are
 * keyed `56:id`, and the sample read the bare id. No sample must never be
 * said as no delivery, and the sample follows the publication rule the
 * job evidence pages use: an outside buyer's answer only once the buyer
 * publishes it.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const base: StructuredInput = { description: '', skills: [], sample: null, category: null, hireBlocker: null, warnings: [] };

test('a sample is a delivered job whose answer is public; the brief depends on who paid', () => {
  const loader = code('lib/agent/sample-delivery.ts');
  assert.match(loader, /readDeliverable\(deliverableKey\(job\.chainId, job\.jobId\)\)/);
  assert.doesNotMatch(loader, /readDeliverable\(job\.jobId\)/, 'the bare id finds no mainnet delivery');
  /* An outside buyer's answer is a sample only once the buyer has published it. */
  assert.match(loader, /\.filter\(\(job\) => answerIsPublic\(funderOf\(job\), store\.answerPublication\(job\.chainId, job\.jobId\)\)\)/);
  assert.match(loader, /asked: briefIsPublic\(funder\) \? unpacked\.asked : null/);
  assert.match(loader, /asked: briefIsPublic\(funder\) \? answer\.asked : null/);
  /* A published buyer's job before a test, and an agent's own published delivery when Pokter holds no copy — only if it matches its hash. */
  assert.match(loader, /Number\(funderOf\(a\) === 'team'\) - Number\(funderOf\(b\) === 'team'\)/);
  assert.match(loader, /if \(!read\.ok \|\| !manifestMatch\(read\.text, onchain\.deliverable\)\) return remember\(null\);/);
  assert.match(code('features/agent/profile.ts'), /sample: await sampleDelivery\(agent\.chain_id, agent\.token_id\)/);
  assert.match(code('features/agent/StructuredProfile.tsx'), /An outside buyer&rsquo;s answer appears here only once the buyer publishes it, and any answer only once it matches its hash on chain\./);
  /* The buyer's own address is taken out of what is shown, as on the evidence pages; the hash is of the original bytes. */
  assert.match(loader, /const shown = publishableAnswerText\(stored\.manifestText, funder, job\.client\);/);
  assert.match(loader, /const shown = publishableAnswerText\(read\.text, funder, onchain\.client\);\s*const answer = readDeliveredAnswer\(shown\);/);
  assert.match(loader, /manifestHash: keccak256\(stringToBytes\(stored\.manifestText\)\)/);
});

test('delivered jobs with no sample to show are said as exactly that, with the newest delivery’s evidence', () => {
  const s = structuredProfile({
    ...base,
    jobHistory: [
      { chainId: 97, jobId: '1667', delivered: true },
      { chainId: 97, jobId: '1600', delivered: false },
      { chainId: 97, jobId: '1590', delivered: true },
    ],
  });
  assert.equal(s.back.result, null);
  assert.equal(s.back.delivered, 2);
  assert.deepEqual(s.back.latest, { chainId: 97, jobId: '1667', delivered: true });
  assert.equal(structuredProfile(base).back.delivered, 0, 'and no history is still no delivery');
  assert.equal(structuredProfile({ ...base, history: { delivered: 31 }, jobHistory: [{ chainId: 56, jobId: '9', delivered: true }] }).back.delivered, 31, 'the whole count, not the newest twelve');
  const view = code('features/agent/StructuredProfile.tsx');
  const noSample = view.indexOf('No published sample yet.');
  const never = view.indexOf('It has not delivered a paid job through Pokter yet');
  assert.ok(noSample > 0 && never > noSample, 'checked before the never-delivered sentence');
  assert.match(view, /\) : s\.back\.delivered > 0 \? \(/);
  assert.match(view, /<Link href=\{jobEvidencePath\(\{ chainId: s\.back\.latest\.chainId, jobId: s\.back\.latest\.jobId \}\)\}/);
});

test('the one-line answer is the field that carries it, not the first field', () => {
  const s = structuredProfile({
    ...base,
    sample: {
      jobId: '57005',
      kind: 'agent',
      asked: null,
      title: null,
      result: null,
      limitations: [],
      fields: [
        { label: 'token', value: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82' },
        { label: 'name', value: 'PancakeSwap Token' },
        { label: 'verdict', value: 'Caution' },
      ],
    },
  });
  assert.equal(s.back.result, 'verdict: Caution');
});

test('the agent page passes its job history to the profile', () => {
  assert.match(code('app/(site)/agents/[chainId]/[tokenId]/page.tsx'), /<StructuredProfile s=\{structuredProfile\(p\)\}/);
  assert.match(code('features/agent/profile.ts'), /jobHistory/);
});

test('a sample reads the way its job page reads it, never as serialised field values', () => {
  const loader = code('lib/agent/sample-delivery.ts');
  /* Both readers carry the whole parsed answer, with the brief kept only where it may be shown. */
  assert.equal(loader.match(/answer: \{ \.\.\.answer, asked: briefIsPublic\(funder\) \? answer\.asked : null \},/g)?.length, 2);
  const page = code('app/(site)/agents/[chainId]/[tokenId]/page.tsx');
  assert.match(page, /<DeliveredAnswerView answer=\{p\.sample\.answer\} chainId=\{p\.sample\.chainId\} when=\{\(value\) => utcWhen\(value\) \?\? value\} \/>/);
  assert.doesNotMatch(page, /JSON\.stringify\(f\.value\)/, 'a nested result printed as braces');
  /* A lifecycle receipt is not an answer: its fields stay plain, formatted by the same value renderer. */
  assert.match(page, /p\.sample\.kind === 'lifecycle' \? \(/);
  assert.match(page, /<AnswerValue value=\{f\.value\} \/>/);
});
