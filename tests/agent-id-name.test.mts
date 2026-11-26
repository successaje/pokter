import assert from 'node:assert/strict';
import test from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { agentIdHandle, AGENT_ID_ABI } from '../src/lib/board/contract';
import { RequestRow } from '../src/features/briefs/RequestRow';
import { AgentIdName } from '../src/ui/AgentIdName';

/*
 * A wallet that holds an Agent ID is shown by its handle in place of its
 * address, linked to the wallet on BscScan. Only ever wallet to handle:
 * nothing finds a wallet from a name.
 */

const WALLET = '0x564cbb1c360af36681591f47af469913b6364431';

test('only a handle the registry itself would accept is shown', () => {
  assert.equal(agentIdHandle('pokter'), 'pokter');
  assert.equal(agentIdHandle('p0k'), 'p0k');
  assert.equal(agentIdHandle('a'.repeat(20)), 'a'.repeat(20));
  for (const raw of ['', 'ab', 'a'.repeat(21), 'Pokter', 'pok-ter', 'pok ter', 'pökter', 'ПОК', '<b>x</b>', null, undefined, 42]) {
    assert.equal(agentIdHandle(raw), null, JSON.stringify(raw));
  }
});

test('the name links to the wallet on BscScan, with the address as its title', () => {
  const html = renderToStaticMarkup(createElement(AgentIdName, { wallet: WALLET, handle: 'pokter' }));
  assert.match(html, new RegExp(`href="https://bscscan\\.com/address/${WALLET}"`));
  assert.match(html, new RegExp(`title="${WALLET}"`));
  assert.match(html, />Agent ID</);
  assert.match(html, />pokter</);
  assert.match(html, /target="_blank"/);
});

test('a request row names a poster by its Agent ID only when it has no published profile', () => {
  const row = { id: 'r1', poster: WALLET, title: 'A task', brief: 'Do it', budgetU: 1, budgetRaw: null, paymentToken: null, chainId: 56, closesAt: null, category: null, targetBuilder: null, postedAt: new Date(Date.UTC(2026, 10, 25)).toISOString(), state: 'open', proposals: 0, onBoard: false, hired: false };
  const now = Date.UTC(2026, 10, 26);
  const render = (extra: object) => renderToStaticMarkup(createElement(RequestRow, { request: { ...row, ...extra } as never, now }));
  assert.match(render({ posterAgentId: 'pokter' }), /by pokter/);
  assert.match(render({ posterAgentId: 'pokter', posterIdentity: { name: 'Pokter team', avatar: null } }), /by Pokter team/);
  assert.doesNotMatch(render({}), / by /);
});

test('the registry is read one way: from a wallet to its handle', () => {
  const reads = AGENT_ID_ABI.filter((item) => item.type === 'function').map((item) => item.name);
  assert.deepEqual(reads, ['balanceOf', 'handleOf'], 'no handle-to-owner lookup; tests/agent-id-lookup-direction checks the rest of the code');
});
