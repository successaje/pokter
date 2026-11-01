import assert from 'node:assert/strict';
import test from 'node:test';

import { getAddress } from 'viem';

import { fundingCoordinator, readAttemptRecord, type AttemptChainReader, type BeginInput, type FundingAttempt, type KeyValue, type LockManagerLike } from '../src/lib/hire/funding-journal';

/*
 * A stored payment record this browser cannot read. It may stand for a
 * payment that went through, so it is never read as "nothing recorded",
 * never written over, never deleted, and it blocks funding from the wallet
 * on that chain until the chain proves no payment from it can still happen.
 */

const BUYER = getAddress('0xdAb12cf15F4385188bE62bda9F00877AF4C1b32f');
const OTHER = getAddress('0x1111111111111111111111111111111111111111');
const PROVIDER = getAddress('0x93847647d7eb72a69E162117df6a8697dF53EDda');
const TX = `0x${'ab'.repeat(32)}`;
const ATTEMPT_KEY = `pokter:funding-attempt:97:${BUYER.toLowerCase()}`;
const FUNDED_KEY = `pokter:funded-attempts:97:${BUYER.toLowerCase()}`;

function memory(): KeyValue & { dump: () => Record<string, string> } {
  const d = new Map<string, string>();
  return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => void d.set(k, v), removeItem: (k) => void d.delete(k), dump: () => Object.fromEntries(d) };
}
function locks(): LockManagerLike & { hold: (name: string) => void } {
  const held = new Set<string>();
  return {
    hold: (name) => void held.add(name),
    async request(n, _o, cb) {
      if (held.has(n)) return cb(null);
      held.add(n);
      try {
        return await cb({});
      } finally {
        held.delete(n);
      }
    },
  };
}
const begin = (over: Partial<BeginInput> = {}): BeginInput => ({
  wallet: BUYER, chainId: 97, provider: PROVIDER, agent: { chainId: 97, tokenId: '2618', name: 'x' }, task: 't', description: 'brief + quote', token: PROVIDER, amountRaw: '10',
  startedAt: '2026-11-01T00:00:00.000Z', predictedJobId: '100', fundableUntil: 2_000, ...over,
});
const stored = (over: Record<string, unknown> = {}) => ({
  attemptId: 'a', ownerTab: 'A', wallet: BUYER, chainId: 97, provider: PROVIDER, agent: { chainId: 97, tokenId: '2618', name: 'x' }, task: 't', description: 'brief + quote', token: PROVIDER, amountRaw: '10',
  fundableUntil: 2_000, startedAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', predictedJobId: '100', jobId: null, callsId: null, txHashes: [], prompt: 'funding', state: 'pending', ...over,
});
const chain = (over: { jobs?: Record<string, { client: string; statusName: string; expiredAt?: bigint }>; receipt?: AttemptChainReader['receipt']; txState?: AttemptChainReader['txState'] } = {}): AttemptChainReader => ({
  receipt: over.receipt ?? (async () => null),
  txState: over.txState,
  job: async (id) => {
    const j = over.jobs?.[id.toString()];
    return j ? { provider: PROVIDER, budget: 10n, description: 'brief + quote', ...j } : null;
  },
  jobIdFrom: (logs) => (logs.length ? BigInt(String(logs[0])) : null),
});

test('an attempt record that is not JSON blocks funding, and is left exactly as it was', async () => {
  const kv = memory();
  kv.setItem(ATTEMPT_KEY, '{"attemptId":"a","wallet":');
  const journal = fundingCoordinator(kv, locks(), 'B');
  let asked = false;
  const result = await journal.run(begin(), async () => {
    asked = true;
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, 'unreadable-record');
  assert.equal(asked, false, 'the wallet was never asked');
  assert.equal(kv.getItem(ATTEMPT_KEY), '{"attemptId":"a","wallet":', 'not written over');
  assert.equal(journal.read(BUYER, 97), null);
  assert.equal(journal.unresolved(BUYER, 97).length, 1);
});

test('a record missing or mistyping a field that decides whether money can move is unreadable, not repaired', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['no prompt recorded', { prompt: undefined }],
    ['an unknown prompt', { prompt: 'paying' }],
    ['a deadline that is text', { fundableUntil: '2000' }],
    ['another wallet', { wallet: OTHER }],
    ['another network', { chainId: 56 }],
    ['an amount that is not a number', { amountRaw: '10 USDT' }],
    ['transactions that are not a list', { txHashes: TX }],
    ['a job number that is not a number', { jobId: 'job-105' }],
  ];
  for (const [what, over] of cases) {
    const record = JSON.parse(JSON.stringify(stored(over)));
    assert.equal(typeof readAttemptRecord(record, BUYER, 97), 'string', what);
  }
  // The one known repair stays: a batch id stored as the wallet's whole answer.
  const repaired = readAttemptRecord(stored({ callsId: { id: '0xbatch' } }), BUYER, 97);
  assert.equal(typeof repaired === 'object' && repaired.callsId, '0xbatch');
});

test('a paid-quotes list that cannot be read blocks funding, so the same quote is never paid twice', async () => {
  const kv = memory();
  kv.setItem(FUNDED_KEY, 'not json');
  const journal = fundingCoordinator(kv, locks(), 'B');
  const result = await journal.run(begin(), async () => 'paid');
  assert.equal(!result.ok && result.reason, 'unreadable-record');
  assert.equal(kv.getItem(FUNDED_KEY), 'not json');
});

test('a quote paid while the list is unreadable is recorded beside it, and the list is not touched', async () => {
  const kv = memory();
  const journal = fundingCoordinator(kv, locks(), 'A');
  const result = await journal.run(begin(), async (session) => {
    session.note({ jobId: '105' });
    kv.setItem(FUNDED_KEY, '[{"hash":7}]'); // broken while this attempt was paying
    session.close();
    return 'paid';
  });
  assert.equal(result.ok, true);
  assert.equal(kv.getItem(FUNDED_KEY), '[{"hash":7}]');
  assert.equal(JSON.parse(kv.getItem(`${FUNDED_KEY}:beside-unreadable`)!).length, 1);
  assert.equal(kv.getItem(ATTEMPT_KEY), null, 'the paid attempt itself closed as usual');
});

test('resolution: a job the record names that is funded on chain proves its payment landed', async () => {
  const kv = memory();
  const raw = JSON.stringify(stored({ prompt: undefined, jobId: '105' }));
  kv.setItem(ATTEMPT_KEY, raw);
  const journal = fundingCoordinator(kv, locks(), 'B', () => new Date('2026-11-01T09:00:00Z'));
  const [record] = journal.unresolved(BUYER, 97);
  const outcome = await journal.resolveUnreadable(record, BUYER, 97, chain({ jobs: { '105': { client: BUYER, statusName: 'FUNDED' } } }), 1_000);
  assert.equal(outcome.outcome, 'resolved');
  assert.equal(outcome.outcome === 'resolved' && outcome.rule, 'job-funded');
  assert.equal(kv.getItem(ATTEMPT_KEY), null, 'no longer blocks');
  const aside = JSON.parse(kv.getItem(`${ATTEMPT_KEY}:set-aside:2026-11-01T09:00:00.000Z`)!);
  assert.equal(aside.raw, raw, 'kept exactly as stored, with what proved it');
  assert.equal(aside.rule, 'job-funded');
  assert.equal(journal.unresolved(BUYER, 97).length, 0);
});

test('resolution: an open job is settled only once its deadline on chain has passed', async () => {
  const raw = JSON.stringify(stored({ prompt: undefined, jobId: '105' }));
  for (const [expiredAt, chainNow, expect] of [[1_500n, 1_600, 'resolved'], [3_000n, 1_600, 'unresolved'], [1_600n, 1_600, 'unresolved']] as const) {
    const kv = memory();
    kv.setItem(ATTEMPT_KEY, raw);
    const journal = fundingCoordinator(kv, locks(), 'B');
    const outcome = await journal.resolveUnreadable(journal.unresolved(BUYER, 97)[0], BUYER, 97, chain({ jobs: { '105': { client: BUYER, statusName: 'OPEN', expiredAt } } }), chainNow);
    assert.equal(outcome.outcome, expect, `expires ${expiredAt}, chain at ${chainNow}`);
    assert.equal(kv.getItem(ATTEMPT_KEY) === null, expect === 'resolved');
  }
});

test('resolution: a job found through the record’s own mined transaction counts as named', async () => {
  const kv = memory();
  kv.setItem(ATTEMPT_KEY, JSON.stringify(stored({ prompt: 'paying', txHashes: [TX] })));
  const journal = fundingCoordinator(kv, locks(), 'B');
  const mined = async (hash: string) => (hash === TX ? { status: 'success' as const, logs: ['105'] } : null);
  const outcome = await journal.resolveUnreadable(journal.unresolved(BUYER, 97)[0], BUYER, 97, chain({ receipt: mined, jobs: { '105': { client: BUYER, statusName: 'SUBMITTED' } } }), 1_000);
  assert.equal(outcome.outcome === 'resolved' && outcome.jobId, '105');
});

test('resolution: a job that belongs to someone else proves nothing about this wallet', async () => {
  const kv = memory();
  kv.setItem(ATTEMPT_KEY, JSON.stringify(stored({ prompt: undefined, jobId: '105', fundableUntil: null })));
  const journal = fundingCoordinator(kv, locks(), 'B');
  const outcome = await journal.resolveUnreadable(journal.unresolved(BUYER, 97)[0], BUYER, 97, chain({ jobs: { '105': { client: OTHER, statusName: 'FUNDED' } } }), 1_000);
  assert.equal(outcome.outcome, 'unresolved');
  assert.notEqual(kv.getItem(ATTEMPT_KEY), null);
});

test('resolution: with no job named, only the record’s own deadline passing on chain settles it', async () => {
  const raw = JSON.stringify(stored({ prompt: undefined, predictedJobId: null }));
  for (const [chainNow, expect] of [[2_001, 'resolved'], [2_000, 'unresolved']] as const) {
    const kv = memory();
    kv.setItem(ATTEMPT_KEY, raw);
    const journal = fundingCoordinator(kv, locks(), 'B');
    const outcome = await journal.resolveUnreadable(journal.unresolved(BUYER, 97)[0], BUYER, 97, chain(), chainNow);
    assert.equal(outcome.outcome, expect, `chain at ${chainNow}, deadline 2000`);
  }
});

test('resolution: a record with nothing the chain can check stays, however old it is', async () => {
  const kv = memory();
  kv.setItem(ATTEMPT_KEY, '{"attemptId":"a","wallet":');
  const journal = fundingCoordinator(kv, locks(), 'B');
  const outcome = await journal.resolveUnreadable(journal.unresolved(BUYER, 97)[0], BUYER, 97, chain(), 9_999_999_999);
  assert.equal(outcome.outcome, 'unresolved');
  assert.equal(kv.getItem(ATTEMPT_KEY), '{"attemptId":"a","wallet":');
});

test('resolution: a transaction not mined yet keeps it until its deadline passes', async () => {
  const kv = memory();
  kv.setItem(ATTEMPT_KEY, JSON.stringify(stored({ prompt: undefined, predictedJobId: null, txHashes: [TX] })));
  const journal = fundingCoordinator(kv, locks(), 'B');
  const record = journal.unresolved(BUYER, 97)[0];
  assert.equal((await journal.resolveUnreadable(record, BUYER, 97, chain({ txState: async () => 'pending' }), 1_000)).outcome, 'unresolved');
  assert.equal((await journal.resolveUnreadable(record, BUYER, 97, chain({ txState: async () => 'pending' }), 2_001)).outcome, 'resolved');
});

test('resolution waits for a tab that may still be paying, and never acts on a record that changed', async () => {
  const kv = memory();
  const raw = JSON.stringify(stored({ prompt: undefined, jobId: '105' }));
  kv.setItem(ATTEMPT_KEY, raw);
  const lock = locks();
  const journal = fundingCoordinator(kv, lock, 'B');
  const record = journal.unresolved(BUYER, 97)[0];
  const funded = chain({ jobs: { '105': { client: BUYER, statusName: 'FUNDED' } } });

  lock.hold(`pokter:funding-lock:97:${BUYER.toLowerCase()}`);
  assert.equal((await journal.resolveUnreadable(record, BUYER, 97, funded, 1_000)).outcome, 'busy');
  assert.equal(kv.getItem(ATTEMPT_KEY), raw);

  const fresh = fundingCoordinator(kv, locks(), 'C');
  kv.setItem(ATTEMPT_KEY, `${raw} `);
  assert.equal((await fresh.resolveUnreadable(record, BUYER, 97, funded, 1_000)).outcome, 'stale');
  assert.equal(kv.getItem(ATTEMPT_KEY), `${raw} `);
});

test('once the chain resolves it, funding goes ahead, and quotes paid meanwhile are still never paid twice', async () => {
  const kv = memory();
  const broken = JSON.stringify([{ hash: 'h1', jobId: '1', until: 1_500 }, { hash: 7, jobId: '2', until: 1_600 }]);
  kv.setItem(FUNDED_KEY, broken);
  kv.setItem(`${FUNDED_KEY}:beside-unreadable`, JSON.stringify([{ hash: (await import('../src/lib/hire/funding-journal')).descriptionHash('brief + quote'), jobId: '105', until: 2_000 }]));
  const journal = fundingCoordinator(kv, locks(), 'B', () => new Date('2026-11-01T09:00:00Z'));
  const [record] = journal.unresolved(BUYER, 97);
  assert.equal(record.kind, 'funded-list');

  assert.equal((await journal.resolveUnreadable(record, BUYER, 97, chain(), 1_600)).outcome, 'unresolved', 'one quote could still be paid');
  const outcome = await journal.resolveUnreadable(record, BUYER, 97, chain(), 1_601);
  assert.equal(outcome.outcome === 'resolved' && outcome.rule, 'quotes-expired');
  assert.equal(JSON.parse(kv.getItem(`${FUNDED_KEY}:set-aside:2026-11-01T09:00:00.000Z`)!).raw, broken);
  assert.equal(kv.getItem(`${FUNDED_KEY}:beside-unreadable`), null);

  const again = await journal.run(begin(), async () => 'paid');
  assert.equal(!again.ok && again.reason, 'already-funded', 'the quote paid while the list was unreadable');
  const other = await journal.run(begin({ description: 'another brief + quote' }), async () => 'paid');
  assert.deepEqual(other, { ok: true, value: 'paid' });
});

test('a readable record behaves exactly as before: an open attempt blocks, nothing unreadable is reported', async () => {
  const kv = memory();
  const open: FundingAttempt = stored() as unknown as FundingAttempt;
  kv.setItem(ATTEMPT_KEY, JSON.stringify(open));
  const journal = fundingCoordinator(kv, locks(), 'B');
  assert.deepEqual(journal.unresolved(BUYER, 97), []);
  const result = await journal.run(begin(), async () => 'paid');
  assert.equal(!result.ok && result.reason, 'open-attempt');
});
