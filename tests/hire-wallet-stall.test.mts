import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { finishableJob } from '../src/lib/hire/funding-journal';
import { walletActionError } from '../src/lib/wallet/errors';
import { answerWithin, confirmWalletStill, raceWithChain } from '../src/lib/wallet/step-watch';

/*
 * A wallet that sends a step and never answers the page, or stops answering
 * its quick checks, no longer holds the hire: the step is recognised on
 * chain, the checks have a time limit, the buyer is told what the page is
 * waiting for, and a reload finishes the job instead of starting another.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const ACCOUNT = '0x00000000000000000000000000000000000000a1';
const never = <T,>() => new Promise<T>(() => {});
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test('the chain settles a step the wallet never answers, once the buyer’s nonce moved', async () => {
  let nonce = 7;
  let landed = false;
  let polls = 0;
  const result = await raceWithChain(never<string>(), {
    nonceBefore: 7,
    nonceNow: async () => nonce,
    landed: async () => (landed ? { jobId: 1675n } : null),
    requireNonce: true,
    pollMs: 0,
  }, async () => {
    polls += 1;
    if (polls === 2) nonce = 8;
    if (polls === 3) landed = true;
    await tick();
  });
  assert.deepEqual(result, { kind: 'chain', landed: { jobId: 1675n } });
});

test('the wallet’s answer still wins when it comes first, and a refusal still stops the step', async () => {
  const result = await raceWithChain(Promise.resolve('0xabc'), { nonceBefore: 1, nonceNow: async () => 1, landed: async () => null, pollMs: 0 }, tick);
  assert.deepEqual(result, { kind: 'wallet', value: '0xabc' });
  await assert.rejects(
    raceWithChain(Promise.reject(new Error('User rejected the request')), { nonceBefore: 1, nonceNow: async () => 1, landed: async () => ({}), pollMs: 0 }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }),
    /User rejected/,
  );
});

test('an unreadable chain is asked again, never taken as an answer; a dry run needs the nonce to have moved', async () => {
  let polls = 0;
  const settled = raceWithChain(new Promise<string>((resolve) => setTimeout(() => resolve('0xlate'), 40)), {
    nonceBefore: null,
    nonceNow: async () => 9,
    landed: async () => {
      polls += 1;
      if (polls < 3) throw new Error('rate limited');
      return {};
    },
    requireNonce: true,
    pollMs: 0,
  }, tick);
  /* With no nonce to compare, a step that needs one is never settled by the chain: the wallet's late answer is. */
  assert.deepEqual(await settled, { kind: 'wallet', value: '0xlate' });
  assert.equal(polls, 0);
});

test('a quick wallet check has a time limit, and a silent wallet is trusted only if it never said it moved', async () => {
  assert.equal(await answerWithin(never<string>(), 5), null);
  assert.deepEqual(await answerWithin(Promise.resolve('0x61'), 50), { value: '0x61' });

  const silent = { chainId: 97, account: ACCOUNT as `0x${string}`, request: () => never<unknown>(), switchChain: async () => {}, ms: 5 };
  await confirmWalletStill({ ...silent, changed: () => false });
  await assert.rejects(confirmWalletStill({ ...silent, changed: () => true }), /WALLET_NOT_RESPONDING/);

  let switched = 0;
  const answering = (chain: string, accounts: string[]) => ({
    chainId: 97, account: ACCOUNT as `0x${string}`, changed: () => false, ms: 50,
    request: async (method: 'eth_chainId' | 'eth_accounts') => (method === 'eth_chainId' ? chain : accounts),
    switchChain: async () => { switched += 1; },
  });
  await confirmWalletStill(answering('0x61', [ACCOUNT]));
  await confirmWalletStill(answering('0x38', [ACCOUNT.toUpperCase().replace('0X', '0x')]));
  assert.equal(switched, 1, 'a wallet on another network is asked to switch, as before');
  await assert.rejects(confirmWalletStill(answering('0x61', ['0x00000000000000000000000000000000000000b2'])), /ACCOUNT_CHANGED/);
});

test('a reload offers to finish the attempt’s own unfunded job while the escrow still allows it', () => {
  const now = 1_793_200_000;
  const attempt = { fundableUntil: null };
  assert.equal(finishableJob(attempt, { outcome: 'not-funded', jobId: '1675', detail: '', expiredAt: now + 3_600 }, now), '1675');
  assert.equal(finishableJob(attempt, { outcome: 'not-funded', jobId: '1675', detail: '', expiredAt: now - 1 }, now), null, 'past its deadline it cannot be funded');
  assert.equal(finishableJob(attempt, { outcome: 'not-funded', jobId: null, detail: '' }, now), null, 'no job was created');
  assert.equal(finishableJob(attempt, { outcome: 'funded', jobId: '1675' } as never, now), null);
});

test('a paused wallet is explained, not reported as an unknown error', () => {
  const message = walletActionError(new Error('WALLET_NOT_RESPONDING'), 'Commissioning');
  assert.match(message, /^Commissioning paused: your wallet stopped answering after it changed network or account\./);
  assert.match(message, /carries on from the step where it stopped/);
});

test('every step of both funding paths is watched on chain, with registration gated on the nonce', () => {
  const external = code('lib/wallet/external.ts');
  const hire = external.slice(external.indexOf('export async function hireFromExternalWallet'), external.indexOf('export interface ExternalBalances'));
  const resume = external.slice(external.indexOf('export async function resumeExternalFunding'));
  for (const path of [hire, resume]) {
    assert.equal(path.match(/await raceWithChain\(/g)?.length, 2, 'the wallet’s answer, then its receipt');
    assert.match(path, /await stillThere\(\)/);
    assert.doesNotMatch(path.slice(path.indexOf('const send = async')), /await ensureChain\(chainId\); await assertAccount\(account\);/);
    assert.match(path, /await effects\.registered\([^)]*\), true\)/);
    assert.match(path, /effects\.budgeted\(/);
    assert.match(path, /effects\.approved\(/);
    assert.match(path, /effects\.funded\(/);
    assert.match(path, /followed\.stop\(\)/);
  }
  assert.match(hire, /effects\.created\(predictedJobId, input\.provider, description\)/);
  assert.match(hire, /created\.landed\?\.jobId \?\? jobCreatedFromReceipt\(created\.receipt!/);
});

test('the page keeps a finishable job, says what it is waiting for, and lets the buyer start over', () => {
  const hook = code('lib/hire/useHire.ts');
  assert.match(hook, /const finishable = promptMovesMoney\(snapshot\.prompt\) \? null : finishableJob\(snapshot, verdict, chainNow\);/);
  assert.ok(hook.indexOf('const finishable') < hook.indexOf('const settled = await coordinator.settle(snapshot, verdict, chainNow'), 'decided before the attempt can be closed');
  assert.match(hook, /const startOver = async \(\) =>/);
  const flow = code('features/hire/HireFlow.tsx');
  assert.match(flow, /onClick=\{\(\) => void hire\.startOver\(\)\}>Start a new hire instead</);
  assert.match(flow, /title=\{hire\.resumableJobId \? `Job \$\{hire\.resumableJobId\} is waiting to be funded`/);
  assert.match(flow, /const WALLET_STEP_PATIENCE_MS = 20_000;/);
  assert.match(flow, /\{waitingOnWallet && \(/);
});

test('a revert counts as registered only when the same dry run succeeded before the prompt', async () => {
  const { stepEffects } = await import('../src/lib/wallet/step-effects');
  const revert = Object.assign(new Error('execution reverted: already registered'), {});
  let registeredNow = false;
  const read = { call: async () => { if (registeredNow) throw revert; return { data: '0x' }; }, readContract: async () => 0n } as never;
  const effects = stepEffects(read, '0x00000000000000000000000000000000000000c1', ACCOUNT as `0x${string}`);
  const landed = await effects.registered('0x00000000000000000000000000000000000000d1', '0x51d5456d');
  assert.equal(await landed(), null, 'still unregistered');
  registeredNow = true;
  assert.deepEqual(await landed(), {}, 'the dry run now reverts');
  /* Reverting before the prompt says nothing about the step: the chain is not consulted for it. */
  const alreadyReverting = await stepEffects({ call: async () => { throw revert; }, readContract: async () => 0n } as never, '0x00000000000000000000000000000000000000c1', ACCOUNT as `0x${string}`)
    .registered('0x00000000000000000000000000000000000000d1', '0x51d5456d');
  assert.equal(await alreadyReverting(), null);
  /* A node that fails is not a revert. */
  let flaky = false;
  const flakyRead = { call: async () => { if (flaky) throw new Error('fetch failed'); return { data: '0x' }; }, readContract: async () => 0n } as never;
  const watched = await stepEffects(flakyRead, '0x00000000000000000000000000000000000000c1', ACCOUNT as `0x${string}`).registered('0x00000000000000000000000000000000000000d1', '0x51d5456d');
  flaky = true;
  assert.equal(await watched(), null);
});

test('funded means any status from FUNDED to REJECTED: an agent can deliver seconds after the money lands', async () => {
  const { stepEffects } = await import('../src/lib/wallet/step-effects');
  const withStatus = (status: number) => stepEffects({ call: async () => ({}), readContract: async () => ({ status, budget: 5n, client: ACCOUNT, provider: ACCOUNT, description: 'd' }) } as never, '0x00000000000000000000000000000000000000c1', ACCOUNT as `0x${string}`).funded(1n)();
  assert.deepEqual([await withStatus(0), await withStatus(1), await withStatus(2), await withStatus(3), await withStatus(4), await withStatus(5)], [null, {}, {}, {}, {}, null]);
});
