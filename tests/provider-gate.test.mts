import assert from 'node:assert/strict';
import test from 'node:test';

import { scopeGuarded, withConfirmedAgent, type ToolAnswer } from '../src/lib/assistant/provider-gate';
import type { AutomationTokenRecord } from '../src/lib/builders/automation-store';
import type { OwnerConfirmation } from '../src/lib/builders/provider-ownership';

/*
 * Both of these guards were statements in `/api/mcp/provider/route.ts` with
 * the work beside them, and their only coverage was a source regex in
 * `tests/provider-route-wiring.test.mts`. A regex cannot see ordering, and
 * mutation proved both were therefore untested:
 *
 *  - moving the scope check to run after `await body(args)` left all 1,875
 *    assertions passing, so a token without `deliverables:prepare` would
 *    have written the staged row and *then* been refused;
 *  - deleting `confirmAgentOwner` from `prepare_deliverable` also passed,
 *    because `assert.match(PROVIDER, /confirmAgentOwner\(/)` was satisfied
 *    by the surviving call inside another helper.
 *
 * So every test here is about a body that must NOT have run. The guards
 * hold the work as a callback, which is what makes "did it run" observable
 * at all, and `ran` is the assertion that fails under either mutation.
 */

const token = (scopes: string[]): AutomationTokenRecord => ({
  id: 'token-1',
  ownerAddress: '0x1111111111111111111111111111111111111111',
  label: 'Laptop',
  hint: 'abcd',
  scopes,
  createdAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '2026-12-01T00:00:00.000Z',
  revokedAt: null,
  lastUsedAt: null,
});

/** A tool body that records whether it was reached. */
function spy(answer: ToolAnswer = { data: { staged: true } }) {
  const calls: unknown[] = [];
  return {
    get ran() {
      return calls.length > 0;
    },
    get calls() {
      return calls.length;
    },
    body: async (args?: unknown) => {
      calls.push(args);
      return answer;
    },
  };
}

test('a tool the token has no scope for never reaches its body', async () => {
  const work = spy();
  const answer = await scopeGuarded('deliverables:prepare', token(['requests:read']), work.body)({ content: 'done' });
  /* The assertion the mutation breaks. A gate that runs after the body
     returns this same refusal — with the staged row already written. */
  assert.equal(work.ran, false, 'the scope gate must refuse before the work runs, not after it');
  assert.equal(answer.isError, true);
  const data = answer.data as { error: string; grantedScopes: string[] };
  assert.match(data.error, /deliverables:prepare/, 'the refusal names the scope to mint');
  assert.match(data.error, /\/build\/automation/, 'and where to mint it');
  assert.deepEqual(data.grantedScopes, ['requests:read'], 'and hands back what the token does carry');
});

test('the body runs, exactly once, when the scope is there', async () => {
  const work = spy({ data: { jobs: 3 } });
  const answer = await scopeGuarded('jobs:read', token(['requests:read', 'jobs:read']), work.body)({ limit: 5 });
  assert.equal(work.calls, 1);
  assert.deepEqual(answer, { data: { jobs: 3 } }, 'the guard returns the body’s own answer untouched');
});

test('the arguments reach the body unchanged', async () => {
  const calls: unknown[] = [];
  const answer = await scopeGuarded('jobs:read', token(['jobs:read']), async (args: Record<string, unknown>) => {
    calls.push(args);
    return { data: null };
  })({ state: 'funded', limit: 20 });
  assert.deepEqual(calls, [{ state: 'funded', limit: 20 }]);
  assert.deepEqual(answer, { data: null });
});

/*
 * `provider_status` carries no scope deliberately: it is the honest first
 * call for any live token. The gate must let it through rather than
 * treating "no scope" as "no permission".
 */
test('a tool with no scope of its own runs for a token carrying none', async () => {
  const work = spy();
  await scopeGuarded(null, token([]), work.body)({});
  assert.equal(work.ran, true);
});

test('an error the body throws is the body’s, not swallowed as a refusal', async () => {
  await assert.rejects(
    () => scopeGuarded('jobs:read', token(['jobs:read']), async () => { throw new Error('store is down'); })({}),
    /store is down/,
  );
});

const AGENT = { chainId: 97, tokenId: '42' };

const transferred: OwnerConfirmation = {
  ok: false,
  unavailable: false,
  reason: 'The registry names 0xB as the owner of agent 97:42, not this automation token’s wallet.',
};
const cannotRead: OwnerConfirmation = {
  ok: false,
  unavailable: true,
  reason: 'The ERC-8004 registry on chain 97 did not answer, so Pokter cannot confirm that this wallet owns agent 97:42.',
};

test('work for an agent the registry gives to somebody else is never run', async () => {
  const work = spy();
  const answer = await withConfirmedAgent(AGENT, async () => transferred, work.body);
  assert.equal(work.ran, false, 'the staging must not happen for an agent this wallet no longer owns');
  assert.equal(answer.isError, true);
  assert.match((answer.data as { error: string }).error, /not this automation token’s wallet/);
});

/*
 * Fail closed. An RPC failure must not read as a revoked permission — the
 * refusal says "could not confirm" — but it must not run the work either,
 * which is the half that matters: a staged row written on an unverifiable
 * claim of ownership is a row somebody else's job carries.
 */
test('work is not run when the registry could not be read', async () => {
  const work = spy();
  const answer = await withConfirmedAgent(AGENT, async () => cannotRead, work.body);
  assert.equal(work.ran, false);
  assert.equal(answer.isError, true);
  assert.match((answer.data as { error: string }).error, /did not answer/);
  assert.doesNotMatch(
    (answer.data as { error: string }).error,
    /not this|does not own/,
    '"could not check" is never reported as "not yours"',
  );
});

test('a registry read that throws is not a confirmation', async () => {
  const work = spy();
  const answer = await withConfirmedAgent(AGENT, async () => { throw new Error('ECONNRESET'); }, work.body);
  assert.equal(work.ran, false, 'a thrown read must fail closed, not fall through to the work');
  assert.equal(answer.isError, true);
  assert.match((answer.data as { error: string }).error, /could not reach the ERC-8004 registry/);
  assert.match((answer.data as { error: string }).error, /97:42/, 'and names the agent it could not check');
});

test('the work runs once the registry confirms the wallet, and is given the agent it asked about', async () => {
  const work = spy({ data: { staged: true, key: 'k' } });
  const asked: Array<[number, string]> = [];
  const answer = await withConfirmedAgent(
    AGENT,
    async (chainId, tokenId) => {
      asked.push([chainId, tokenId]);
      return { ok: true, owner: '0x1111111111111111111111111111111111111111' };
    },
    work.body,
  );
  assert.deepEqual(asked, [[97, '42']], 'the agent checked is the one the job names');
  assert.equal(work.calls, 1);
  assert.deepEqual(answer, { data: { staged: true, key: 'k' } });
});
