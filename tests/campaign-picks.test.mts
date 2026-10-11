import assert from 'node:assert/strict';
import test from 'node:test';

import { guidePicks } from '../src/lib/campaign/picks';
import type { SearchableAgent } from '../src/lib/search/match';

function agent(name: string, opts: { owner?: string; delivered?: number; missed?: number; probes?: number; hireable?: boolean; requiresAuth?: boolean } = {}): SearchableAgent {
  const probes = opts.probes ?? 0;
  return {
    listing: { agent: { name, token_id: name, chain_id: 97, owner_address: opts.owner ?? `0x${name}` }, hireable: opts.hireable ?? true, requiresAuth: opts.requiresAuth },
    record: { totalProbes: probes, totalAnswered: probes, windows: [{ label: '7d', probes, answered: probes, ratio: 1 }] },
    history: { delivered: opts.delivered ?? 0, missed: opts.missed ?? 0 },
  } as unknown as SearchableAgent;
}

const isHireable = (entry: SearchableAgent) => (entry.listing as unknown as { hireable: boolean }).hireable;
const names = (xs: SearchableAgent[]) => xs.map((x) => x.listing.agent.name);

test('an agent that misses its paid jobs is never recommended, however well it answers probes', () => {
  // The real case: a public agent card answered 266 of 266 probes while its
  // work endpoint required a login, and both paid jobs expired.
  const lapses = agent('answers-but-misses', { probes: 266, missed: 2 });
  const delivers = agent('delivers', { probes: 30, delivered: 1 });
  assert.deepEqual(names(guidePicks([lapses, delivers], { isHireable })), ['delivers']);
});

test('delivered paid work outranks probe reliability', () => {
  const reliable = agent('reliable', { probes: 300 });
  const proven = agent('proven', { probes: 25, delivered: 2 });
  assert.deepEqual(names(guidePicks([reliable, proven], { isHireable })), ['proven', 'reliable']);
});

test('one agent per operator, and only hireable, real agents', () => {
  const a = agent('a', { owner: '0xop', delivered: 3 });
  const b = agent('b', { owner: '0xop', delivered: 2 });
  const c = agent('c', { hireable: false, delivered: 5 });
  const demo = agent('Grid Trader (demo)', { delivered: 4 });
  const d = agent('d');
  assert.deepEqual(names(guidePicks([a, b, c, demo, d], { isHireable })), ['a', 'd']);
});

test('operators that share a funder count once', () => {
  const a = agent('a', { owner: '0x1', delivered: 1 });
  const b = agent('b', { owner: '0x2', delivered: 1 });
  const operatorOf = () => 'same-funder';
  assert.deepEqual(names(guidePicks([a, b], { isHireable, operatorOf })), ['a']);
});

test('an agent whose card requires a login is not recommended before its first job lapses', () => {
  const gated = agent('gated', { probes: 266, requiresAuth: true });
  const open = agent('open', { probes: 30 });
  assert.deepEqual(names(guidePicks([gated, open], { isHireable })), ['open']);
});
