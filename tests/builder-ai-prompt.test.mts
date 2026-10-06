import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentBuildPrompt } from '../src/lib/builder/ai-prompt';
import { FAUCETS } from '../src/lib/network/presentation';

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

/*
 * The one part of the contract the prompt deliberately does not describe.
 * A wire format written out in prose is reproduced confidently and slightly
 * wrong, and slightly wrong here means a quote Pokter cannot verify — so
 * the prompt sends the model to read a card that works instead.
 */
test('it sends the model to read a live agent card for the message shapes', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /\.well-known\/agent-card\.json/);
  assert.match(prompt, /negotiates and delivers end to end/);
  assert.match(prompt, /Copy the contract, not the strategy/);
});

test('it says what to do when the reference card does not load', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /If the card does not load/);
  assert.match(prompt, /rather than inventing the shape/);
  assert.match(prompt, /showing a signed price/);
});

/*
 * Observed on 5 Oct 2026: a probe waits ten seconds, and an agent already
 * listed on Pokter took twenty-two to wake from a sleeping free tier. The
 * probe it misses is recorded as a day it did not answer, so where the
 * agent is hosted decides part of its public record before it serves
 * anyone.
 */
test('it warns that a sleeping host fails the probe', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /waits ten seconds/);
  assert.match(prompt, /host that sleeps when idle/);
  assert.match(prompt, /recorded as a failure the agent never saw/);
});

test('it says the record is continuous, public and uneditable', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /record is continuous and public/);
  assert.match(prompt, /no private rehearsal/i);
  assert.match(prompt, /Nothing about the record can be edited/);
});

/* Seven now, including the one that catches an unpayable quote. */
test('it defers the verdict to Pokter’s own checks, all seven', () => {
  const prompt = createAgentBuildPrompt({ ...BASE });
  assert.match(prompt, /seven checks of its own/);
  assert.match(prompt, /the quote can actually be paid from the escrow/);
  assert.match(prompt, /do not describe it to me as working on the strength of your own tests alone/);
});

/*
 * The build prompt has to tell somebody how to fund the wallet, because
 * registering the identity and submitting a delivery are both transactions
 * and an empty wallet fails at the step the assistant has just called done.
 *
 * Pinned against the faucet constants rather than against literal strings:
 * the point is that the prompt hands over the exact wording the bot expects,
 * and that it is the same wording the wallet panel shows. A copy that drifts
 * is worse than no instructions, because it fails quietly.
 */
test('the build prompt says how to get gas and the payment token', () => {
  const prompt = createAgentBuildPrompt({
    name: '', description: '', category: '', protocol: 'a2a',
  });

  if (!FAUCETS) {
    // Mainnet has no faucet and no business advertising one.
    assert.ok(!/Telegram/i.test(prompt));
    return;
  }

  const bot = FAUCETS.paymentTokenBot;
  assert.ok(bot, 'the testnet config is expected to carry a bot');
  assert.ok(prompt.includes(bot!.handle));
  assert.ok(prompt.includes(bot!.url));

  /*
   * One message, because the bot takes both. Two separate asks would have
   * somebody message it twice for a wallet that is short of each, which is
   * every wallet made for this.
   */
  assert.ok(prompt.includes(bot!.bothAsk.replace('ADDRESS', '0xMY_WALLET')));
  assert.ok(!prompt.includes('ADDRESS'), 'the placeholder must not survive into the prompt');

  // And it must say when to check, not merely where to go.
  assert.match(prompt, /funded before you tell me to register/);
});
