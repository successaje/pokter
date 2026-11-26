import assert from 'node:assert/strict';
import test from 'node:test';

/*
 * Reading the Agent ID handles of wallets shown on Pokter: through a reader
 * the test supplies, so what is asked, kept, waited on and shown is exact.
 */

const { agentIdHandles } = await import('../../src/lib/board/server');
const { withPosterAgentIds } = await import('../../src/features/briefs/request-rows');

const wallet = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
type Call = { functionName: string; args: readonly unknown[] };

function reader(answers: Record<string, string | Error>, { delayMs = 0 } = {}) {
  const calls: Call[] = [];
  return {
    calls,
    readContract: (async ({ functionName, args }: Call) => {
      calls.push({ functionName, args });
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const answer = answers[String(args[0]).toLowerCase()] ?? '';
      if (answer instanceof Error) throw answer;
      return answer;
    }) as never,
  };
}

test('a holder is named, a wallet without one is not, and only handleOf is asked', async () => {
  const r = reader({ [wallet(1)]: 'pokter' });
  const names = await agentIdHandles([wallet(1), wallet(2), wallet(1).toUpperCase().replace('0X', '0x'), 'not-a-wallet'], { reader: r });
  assert.deepEqual([...names], [[wallet(1), 'pokter']]);
  assert.deepEqual(r.calls.map((c) => c.functionName), ['handleOf', 'handleOf'], 'each wallet once; the bad one never');
});

test('an answer is kept: a holder for a day, a wallet without one for an hour', async () => {
  const now = Date.UTC(2026, 10, 26, 12);
  const r = reader({ [wallet(3)]: 'kept' });
  await agentIdHandles([wallet(3), wallet(4)], { reader: r, now });
  await agentIdHandles([wallet(3), wallet(4)], { reader: r, now: now + 30 * 60_000 });
  assert.equal(r.calls.length, 2, 'both kept half an hour on');
  await agentIdHandles([wallet(3), wallet(4)], { reader: r, now: now + 2 * 3_600_000 });
  assert.deepEqual(r.calls.slice(2).map((c) => String(c.args[0]).toLowerCase()), [wallet(4)], 'only the wallet without one is asked again');
});

test('a handle the registry would not issue is never shown', async () => {
  const r = reader({ [wallet(5)]: 'Pokter', [wallet(6)]: 'pok-ter', [wallet(7)]: 'a'.repeat(21) });
  assert.equal((await agentIdHandles([wallet(5), wallet(6), wallet(7)], { reader: r })).size, 0);
});

test('a failed read shows the address and is asked again next time', async () => {
  const r = reader({ [wallet(8)]: new Error('rpc down') });
  assert.equal((await agentIdHandles([wallet(8)], { reader: r })).size, 0);
  await agentIdHandles([wallet(8)], { reader: r });
  assert.equal(r.calls.length, 2);
});

test('a slow read does not hold the page: the name appears on a later visit', async () => {
  const r = reader({ [wallet(9)]: 'later' }, { delayMs: 60 });
  const first = await agentIdHandles([wallet(9)], { reader: r, timeoutMs: 10 });
  assert.equal(first.size, 0, 'not waited for');
  await new Promise((resolve) => setTimeout(resolve, 80));
  const second = await agentIdHandles([wallet(9)], { reader: r, timeoutMs: 10 });
  assert.equal(second.get(wallet(9)), 'later');
  assert.equal(r.calls.length, 1, 'the first read finished and was kept');
});

test('request rows are named only where no published profile already names the poster', async () => {
  /* Every wallet read here first, through the test's reader, so the rows are named from what is kept and nothing reaches the network. */
  const r = reader({ [wallet(10)]: 'holder', [wallet(11)]: 'other' });
  await agentIdHandles([wallet(10), wallet(11), wallet(12)], { reader: r });
  const row = (poster: string, posterIdentity: { name: string; avatar: string | null } | null) => ({ poster, posterIdentity }) as never;
  const named = (await withPosterAgentIds([row(wallet(10), null), row(wallet(11), { name: 'Their profile', avatar: null }), row(wallet(12), null)])) as Array<{ posterAgentId?: string }>;
  assert.deepEqual(named.map((x) => x.posterAgentId ?? null), ['holder', null, null]);
});
