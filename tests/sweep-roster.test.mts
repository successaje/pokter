import assert from 'node:assert/strict';
import test from 'node:test';

/*
 * The roster is built from four sources and two of them — tracked and
 * enrolled agents — are stored across every chain. Taking them whole was
 * harmless while one chain was swept and became a real fault the moment a
 * second pass existed: the testnet sweep inherited every mainnet agent ever
 * probed, calling each of them a second time every two hours.
 *
 * The filter is reproduced here rather than imported because `sweep.ts` is
 * server-only and pulls the chain client in with it. What is being pinned is
 * the rule, which is the part that was wrong.
 */
const dedupeForChain = (
  chainId: number,
  sources: { chainId: number; tokenId: string }[][],
) => {
  const seen = new Set<string>();
  return sources
    .flat()
    .filter((entry) => entry.chainId === chainId)
    .filter((entry) => {
      const key = `${entry.chainId}:${entry.tokenId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const a = (chainId: number, tokenId: string) => ({ chainId, tokenId });

test('a testnet sweep does not inherit mainnet agents', () => {
  const listed = [a(97, '1'), a(97, '2')];
  const tracked = [a(56, '900'), a(56, '901'), a(97, '2')];
  const enrolled = [a(56, '902')];
  const registry = [a(97, '3')];

  const roster = dedupeForChain(97, [listed, tracked, enrolled, registry]);

  assert.deepEqual(
    roster.map((entry) => entry.tokenId),
    ['1', '2', '3'],
    'only chain 97 agents, each once',
  );
  assert.equal(
    roster.some((entry) => entry.chainId === 56),
    false,
    'no mainnet agent may be probed by the testnet pass',
  );
});

test('a mainnet sweep does not inherit testnet agents', () => {
  const roster = dedupeForChain(56, [
    [a(56, '10')],
    [a(97, '20'), a(56, '11')],
    [],
    [a(97, '21')],
  ]);
  assert.deepEqual(roster.map((e) => e.tokenId), ['10', '11']);
});

test('an agent listed and tracked is still probed once', () => {
  const roster = dedupeForChain(97, [[a(97, '5')], [a(97, '5')], [], [a(97, '5')]]);
  assert.equal(roster.length, 1);
});
