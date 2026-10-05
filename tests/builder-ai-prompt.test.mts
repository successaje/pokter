import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentBuildPrompt } from '../src/lib/builder/ai-prompt';

test('creates a category-aware A2A build prompt with safety constraints', () => {
  const prompt = createAgentBuildPrompt({
    name: 'Treasury Sentinel',
    description: 'Returns a sourced treasury risk report.',
    category: 'yield',
    protocol: 'a2a',
    target: 'Stablecoins',
    policy: 'Capital preservation',
    output: 'Risk report',
  });

  assert.match(prompt, /Treasury Sentinel/);
  assert.match(prompt, /GET \/\.well-known\/agent-card\.json/);
  assert.match(prompt, /Never request, print, store, or hard-code a seed phrase or private key/);
  assert.match(prompt, /public HTTPS URL/);
  assert.match(prompt, /three meaningfully different agent concepts and original names/);
});

test('uses the MCP discovery contract when MCP is selected', () => {
  const prompt = createAgentBuildPrompt({
    name: '',
    description: '',
    category: '',
    protocol: 'mcp',
  });

  assert.match(prompt, /MCP Streamable HTTP JSON-RPC/);
  assert.match(prompt, /initialize and tools\/list/);
  assert.doesNotMatch(prompt, /GET \/\.well-known\/agent-card\.json/);
  assert.match(prompt, /Not chosen—propose original options/);
});

/*
 * These are the parts an agent cannot be sold without, and all of them were
 * missing. A service built to the old prompt passed four of Pokter's six
 * checks — identity, endpoint, answering, capabilities — and failed the
 * fifth, so it listed, probed well, and could never be hired. The prompt is
 * the only place that fault can be prevented, because it is decided while
 * the agent is being written.
 */
const BASE = {
  name: '',
  description: '',
  category: '',
  protocol: 'a2a',
} as const;

test('the prompt asks for the two skills a sale needs', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /`negotiate`/);
  assert.match(prompt, /`notify_funded`/);
  assert.match(prompt, /signed with its registered ERC-8004 wallet/);
});

test('it says delivery is an on-chain submit, not an HTTP response', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /on-chain submit/);
  assert.match(prompt, /Returning JSON over HTTP is not delivery/);
});

/*
 * The failure this exists to stop: ten of the thirteen agents that have
 * ever returned a signed price quote in a token the escrow cannot pay.
 */
test('it names the escrow chain and forbids quoting in the wrong currency', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /chain 97/);
  assert.match(prompt, /quote in the payment token of chain 97/);
  assert.match(prompt, /signed for chain 56, verifies correctly and still cannot be paid/);
  assert.match(prompt, /do not guess it/);
});

test('it explains that both chains are listed and where the money settles', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /BNB Chain mainnet \(56\) or BNB Smart Chain Testnet \(97\)/);
  assert.match(prompt, /Pokter lists both/);
  assert.match(prompt, /test token with no real value/);
});

test('it warns that probing proves reachability, not correctness', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /every two hours/);
  assert.match(prompt, /proves reachability only — never correctness/);
});

test('it ends with a listing block in the order the form asks for it', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /Pokter listing/);
  for (const field of [
    'Agent name:',
    'Description:',
    'Category:',
    'Service protocol:',
    'Endpoint:',
    'Public repository:',
    'Identity chain:',
  ]) {
    assert.ok(prompt.includes(field), `listing block is missing "${field}"`);
  }
});

test('the listing block offers only categories Pokter actually has', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /rebalancing, grid-trading, yield, health-factor/);
});
