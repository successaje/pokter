import assert from 'node:assert/strict';
import test from 'node:test';

import { getAddress } from 'viem';

/*
 * A passkey wallet funding a token other than $U, with the setting that turns
 * that path on for testing. Set before the modules load: the table is read
 * once, from the environment, as the build reads it. Off, the passkey funds
 * $U only (tests/hire-funding.test.mts pins that).
 */
process.env.NEXT_PUBLIC_PASSKEY_TOKEN_HIRES = 'on';

const { HIRE_PATHS, pathFundsToken } = await import('../src/lib/network/hire-paths');
const { planCommission } = await import('../src/lib/hire/commission-plan');
const { buildTokenHireCalls } = await import('../src/lib/erc8183/hire-calls');
const { enabledHireTokens, hireTokenAt } = await import('../src/lib/network/tokens');

const USDT97 = getAddress('0x337610d27c682E347C9cD60BD4b3b107C9d34dDd');
const ON = enabledHireTokens(`97:${USDT97}`);

test('switched on, the passkey path funds an offered token, and says why', () => {
  const usdt = hireTokenAt(97, USDT97, ON)!;
  assert.equal(pathFundsToken('passkey-wallet', usdt), true);
  assert.match(HIRE_PATHS['passkey-wallet'].why, /one passkey batch/);
  assert.equal(pathFundsToken('browser-wallet-batch', usdt), false, 'the browser batch stays off; only the passkey path is turned on');
});

test('a passkey hire in USDT plans the signed amount in USDT, never a $U budget', () => {
  const plan = planCommission({ escrowChainId: 97, walletMode: 'passkey', quote: { currency: USDT97, amountRaw: '10000000000000000' }, budgetU: 5, agentName: 'A', tokens: ON });
  assert.ok(plan.ok);
  assert.equal(plan.token?.address, USDT97);
  assert.equal(plan.amountRaw, 10000000000000000n);
  assert.equal(plan.path, 'passkey-wallet');
});

test('the passkey batch is the browser wallet’s five calls: the job is created in the signed token and only that token is approved', () => {
  const addresses = {
    commerce: getAddress('0x00000000000000000000000000000000000000c1'),
    router: getAddress('0x00000000000000000000000000000000000000c2'),
    policy: getAddress('0x00000000000000000000000000000000000000c3'),
    paymentToken: getAddress('0x00000000000000000000000000000000000000c4'),
  };
  const calls = buildTokenHireCalls({ chainId: 97, addresses, jobId: 7n, provider: getAddress('0x00000000000000000000000000000000000000a1'), description: 'task', budget: 10n, expiredAt: 1n, token: USDT97, tokens: ON });
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.map((call) => call.to), [addresses.commerce, addresses.router, addresses.commerce, USDT97, addresses.commerce]);
  assert.ok(calls.every((call) => !call.value), 'no call sends native value');
});
