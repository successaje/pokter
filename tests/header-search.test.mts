import assert from 'node:assert/strict';
import test from 'node:test';

import { directHref, headerSuggestions, parseHeaderQuery, type SuggestAgent, type SuggestJob } from '../src/lib/search/header-query';

const agents: SuggestAgent[] = [
  { chainId: 56, tokenId: '367904', name: 'Vitals', wallet: '0x00000000000000000000000000000000000000aa', owner: '0x00000000000000000000000000000000000000bb' },
  { chainId: 97, tokenId: '2554', name: 'Venus Yield Keeper', wallet: null, owner: '0x00000000000000000000000000000000000000bb' },
  { chainId: 56, tokenId: '57012', name: 'Shares A Number', wallet: null, owner: '0x00000000000000000000000000000000000000cc' },
];
const jobs: SuggestJob[] = [{ jobId: '57012', chainId: 56, status: 'SUBMITTED', agentName: 'Halong Yield' }];

test('a reference is read as the thing it names', () => {
  assert.deepEqual(parseHeaderQuery('  '), { kind: 'empty' });
  assert.deepEqual(parseHeaderQuery('56/367904'), { kind: 'agent-ref', chainId: 56, tokenId: '367904' });
  assert.deepEqual(parseHeaderQuery('97:2554'), { kind: 'agent-ref', chainId: 97, tokenId: '2554' });
  assert.deepEqual(parseHeaderQuery('agent 56 / #0367904'), { kind: 'agent-ref', chainId: 56, tokenId: '367904' }, 'leading zeros dropped');
  assert.deepEqual(parseHeaderQuery('#57012'), { kind: 'number', value: '57012', job: false });
  assert.deepEqual(parseHeaderQuery('Job 57012'), { kind: 'number', value: '57012', job: true });
  assert.deepEqual(parseHeaderQuery('0x00000000000000000000000000000000000000AA'), { kind: 'address', address: '0x00000000000000000000000000000000000000aa' });
  assert.deepEqual(parseHeaderQuery('12/345'), { kind: 'text', text: '12/345' }, 'only networks Pokter lists');
  assert.deepEqual(parseHeaderQuery('venus yield'), { kind: 'text', text: 'venus yield' });
});

test('an agent reference links to the agent, listed or not', () => {
  assert.deepEqual(headerSuggestions(parseHeaderQuery('56/367904'), agents, []).map((s) => [s.label, s.href]), [['Vitals', '/agents/56/367904']]);
  const unlisted = headerSuggestions(parseHeaderQuery('97/9999'), agents, []);
  assert.equal(unlisted[0].href, '/agents/97/9999', 'the agent page reads the registry itself');
});

test('a number offers both the agent and the job it could be, and "job" puts the job first', () => {
  const bare = headerSuggestions(parseHeaderQuery('57012'), agents, jobs);
  assert.deepEqual(bare.map((s) => s.kind), ['agent', 'job']);
  assert.equal(bare[1].href, '/workspace/jobs/57012?chain=56');
  assert.match(bare[1].detail, /BNB Chain · submitted · Halong Yield/);
  assert.deepEqual(headerSuggestions(parseHeaderQuery('job 57012'), agents, jobs).map((s) => s.kind), ['job', 'agent']);
  assert.deepEqual(headerSuggestions(parseHeaderQuery('424242'), agents, jobs), [], 'nothing is invented');
});

test('an address finds the agent whose wallet it is, and the builder', () => {
  const wallet = headerSuggestions(parseHeaderQuery('0x00000000000000000000000000000000000000aa'), agents, []);
  assert.deepEqual(wallet.map((s) => s.kind), ['agent', 'builder']);
  const owner = headerSuggestions(parseHeaderQuery('0x00000000000000000000000000000000000000bb'), agents, []);
  assert.deepEqual(owner.map((s) => s.kind), ['builder']);
  assert.equal(owner[0].detail, 'Owns 2 listed agents');
});

test('words rank names by how much was typed, and always end in a Discover search', () => {
  const rows = headerSuggestions(parseHeaderQuery('venus'), agents, []);
  assert.deepEqual(rows.map((s) => s.label), ['Venus Yield Keeper', 'Search “venus”']);
  assert.equal(rows.at(-1)?.href, '/discover?q=venus');
  assert.deepEqual(headerSuggestions(parseHeaderQuery('translate subtitles'), agents, []).map((s) => s.kind), ['discover']);
});

test('Enter before suggestions arrive goes only where the text cannot mean anything else', () => {
  assert.equal(directHref(parseHeaderQuery('56/367904')), '/agents/56/367904');
  assert.equal(directHref(parseHeaderQuery('venus yield')), '/discover?q=venus%20yield');
  assert.equal(directHref(parseHeaderQuery('57012')), null, 'an agent or a job, on either network');
});
