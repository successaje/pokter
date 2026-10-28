import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { GET_REQUEST, PREPARE_PROPOSAL, PROPOSAL_TOOL_CHAIN, REQUEST_TOOLS, SEARCH_REQUESTS } from '../src/lib/assistant/request-tools';
import { bidMessage, type Bid, type Brief } from '../src/lib/briefs/model';
import { DELIVERY_OPTIONS, filterRequests, plainNote, PROPOSAL_LINK_MAX, proposalLink, readProposalPrefill, requestDetail, requestSummary } from '../src/lib/briefs/public-view';
import { apiEndpoints } from '../src/lib/api/endpoints';
import { MCP_TOOL_SUMMARIES } from '../src/lib/mcp/catalogue';
import { INSTRUCTIONS } from '../src/lib/mcp/server';

/*
 * Work for an agent, as data and as tools: the requests buyers posted, read
 * the way their pages show them, and a proposal prepared for its owner to
 * sign — never sent by anything but the owner's own wallet.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const USDT56 = '0x55d398326f99059fF775485246999027B3197955';
const NOW = Date.parse('2026-10-27T12:00:00Z');

const brief = (over: Partial<Brief> = {}): Brief => ({
  id: '3f6c1a2e-8d4b-4c7a-9e21-5b0d7f9a1c34',
  title: 'Liquidation maths on a stated Venus position',
  brief: 'Work out the health factor of this Venus position.',
  acceptance: ['States the health factor with the block number.'],
  failSignals: ['Uses documented parameters instead of live ones.'],
  budgetU: 0.5,
  paymentToken: USDT56,
  budgetRaw: '500000000000000000',
  chainId: 56,
  deliverDays: 3,
  closesAt: null,
  category: 'health-factor',
  poster: '0x00000000000000000000000000000000000000aa',
  signature: '0xsig',
  state: 'open',
  postedAt: '2026-10-26T12:00:00Z',
  awardedBidId: null,
  ...over,
});

test('open requests by default, filtered by the category the poster signed and by words', () => {
  const venus = brief();
  const grid = brief({ id: 'g', title: 'Size a grid', brief: 'Grid for BNB/USDT.', acceptance: ['Gives the range.'], category: 'grid-trading', postedAt: '2026-10-27T10:00:00Z' });
  const closed = brief({ id: 'c', closesAt: '2026-10-27T11:00:00Z' });
  const awarded = brief({ id: 'a', state: 'awarded' });
  assert.deepEqual(filterRequests([venus, grid, closed, awarded], {}, NOW).map((b) => b.id), ['g', venus.id], 'open only, newest first');
  assert.deepEqual(filterRequests([venus, grid, closed, awarded], { openOnly: false }, NOW).length, 4);
  assert.deepEqual(filterRequests([venus, grid], { category: 'health-factor' }, NOW).map((b) => b.id), [venus.id]);
  assert.deepEqual(filterRequests([venus, grid], { query: 'venus health' }, NOW).map((b) => b.id), [venus.id]);
  assert.deepEqual(filterRequests([venus, grid], { chainId: 97 }, NOW), []);
});

test('a request reads in its own token, with its status in the board’s words and no signatures', () => {
  const bid: Bid = { id: 'b1', briefId: 'x', agentChainId: 56, agentTokenId: '269228', priceU: 0.4, paymentToken: USDT56, priceRaw: '400000000000000000', deliverDays: 2, note: 'How.', bidder: '0x00000000000000000000000000000000000000bb', signature: '0xbidsig', placedAt: '2026-10-27T09:00:00Z' };
  const one = requestDetail(brief({ awardedBidId: 'b1', state: 'awarded' }), [bid], { hired: false }, 'https://pokter.xyz', NOW);
  assert.equal(one.status, 'Agent chosen');
  assert.equal(one.budget.label, '0.5 USDT');
  assert.equal(one.budget.token, USDT56);
  assert.match(String(one.budget.tokenIdentity), /on BNB Chain, contract 0x55d3/);
  assert.equal(one.proposalsList[0].chosen, true);
  assert.equal(one.proposalsList[0].price.label, '0.4 USDT');
  assert.doesNotMatch(JSON.stringify(one), /0xsig|0xbidsig/, 'signatures are for verifying, not reading');
  assert.equal(requestSummary(brief(), { proposals: 0, hired: false }, 'https://pokter.xyz', NOW).page, `https://pokter.xyz/requests/${brief().id}`);
  assert.equal(requestSummary(brief({ chainId: 97, paymentToken: null }), { proposals: 0, hired: false }, 'https://pokter.xyz', NOW).budget.testTokens, true);
});

test('a prepared proposal’s link opens the same values in the form, and a bad link fills nothing it cannot read', () => {
  const link = proposalLink('https://pokter.xyz', 'abc', { agentChainId: 56, agentTokenId: '269228', price: '0.12', deliverDays: 2, note: 'Reads Venus & returns HF.' });
  assert.equal(link.noteInLink, true);
  const params = Object.fromEntries(new URL(link.url).searchParams);
  assert.deepEqual(readProposalPrefill(params), { agentChainId: 56, agentTokenId: '269228', price: '0.12', deliverDays: 2, note: 'Reads Venus & returns HF.' });
  assert.equal(readProposalPrefill({ propose: '1:2' }), null, 'no agent, no prefill');
  const loose = readProposalPrefill({ propose: '97:5', price: '1e5', days: '4', note: 'x'.repeat(5000) });
  assert.equal(loose?.price, '', 'an amount that is not a plain decimal is left for the owner to type');
  assert.equal(loose?.deliverDays, null, 'a delivery time the form does not offer is left to the form');
  assert.equal(loose?.note.length, 1200);
});

test('the three tools are served, listed, read-only, and stop at the owner’s signature', () => {
  const route = code('app/api/mcp/route.ts');
  const listed = MCP_TOOL_SUMMARIES.map(([name]) => name);
  for (const tool of REQUEST_TOOLS) {
    assert.ok(listed.includes(tool.name), `${tool.name} is on the pages`);
    assert.ok(route.includes(`...${tool.name.toUpperCase()},`), `${tool.name} is served`);
    assert.equal(tool.spends, false);
  }
  assert.match(PREPARE_PROPOSAL.description, /Nothing is sent or stored/);
  assert.match(PREPARE_PROPOSAL.description, /Never say a proposal was made until they have/);
  assert.match(SEARCH_REQUESTS.description, /Read-only/);
  assert.match(GET_REQUEST.description, /Read-only/);
  assert.match(INSTRUCTIONS, /prepare_proposal checks a proposal and returns a link for the agent’s owner to review and sign/);
  /* No override of the read-only hints, and no path to the write route. */
  const tools = route.slice(route.indexOf('...SEARCH_REQUESTS,'), route.indexOf("name: 'integration_kit'"));
  assert.doesNotMatch(tools, /annotations:/);
  assert.doesNotMatch(tools, /placeBid|\/bids|method: 'POST'/);
  assert.match(tools, /parseBidContent\(/, 'the proposal route’s own reading');
  assert.match(tools, /withinBudget\(/);
  assert.match(tools, /registryOwner\(c, t\)/, 'the owner from the registry, not taken on trust');
  assert.deepEqual(PREPARE_PROPOSAL.inputSchema.properties && (PREPARE_PROPOSAL.inputSchema.properties as Record<string, { enum?: number[] }>).deliver_days.enum, [...DELIVERY_OPTIONS]);
  assert.equal(PROPOSAL_TOOL_CHAIN.find((s) => s.step === 'review and sign the proposal')?.tool, null);
});

test('the message an owner is shown is the one the proposal route verifies', () => {
  const route = code('app/api/mcp/route.ts');
  assert.match(route, /messageToSign: bidMessage\(\{ \.\.\.parsed\.content, chainId: brief\.chainId, briefId: id, bidder: owner/);
  assert.match(code('app/api/briefs/[id]/bids/route.ts'), /bidMessage\(\{ \.\.\.content, chainId: brief\.chainId, briefId: id, bidder, placedAt \}\)/);
  assert.match(bidMessage({ briefId: 'b', bidder: '0xAA', placedAt: 't', agentChainId: 56, agentTokenId: '1', priceU: 0.5, paymentToken: USDT56, chainId: 56, deliverDays: 2, note: 'n' }), /^Bidder: 0xaa$/m);
});

test('the request page opens a prepared proposal for the owner to check, and names the request’s own money', () => {
  const form = code('features/briefs/ProposalForm.tsx');
  assert.match(form, /title="Filled in for you"/);
  assert.match(form, /\/api\/builders\/agent\?chainId=\$\{prefill!\.agentChainId\}/, 'the agent is looked up, with its owner, as Add by ID does');
  assert.match(form, /import \{ DELIVERY_OPTIONS, type ProposalPrefill \} from '@\/lib\/briefs\/public-view'/, 'one list of delivery times for the form and the tool');
  const detail = code('features/briefs/RequestDetail.tsx');
  assert.match(detail, /useState\(Boolean\(prefill\)\)/);
  assert.doesNotMatch(detail, /'BNB Chain · real \$U'/, 'a USDT request said real $U');
  assert.match(code('app/(site)/requests/[id]/page.tsx'), /prefill=\{taking \? readProposalPrefill\(sp\) : null\}/);
});

test('the deploy check asks for the new tools, and the API index lists the endpoints', () => {
  const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(deploy, /search_requests get_request prepare_proposal integration_kit/);
  const paths = apiEndpoints('v1').map((e) => e.path);
  assert.ok(paths.includes('/api/v1/requests') && paths.includes('/api/v1/requests/{id}'));
});

test('a tampered link fills in only text, which renders as text, and never a reordered note', () => {
  const tampered = readProposalPrefill({ propose: '56:1', price: '0.1', days: '2', note: '<script>alert(1)</script>\u202Eevil\u0007\nline two\ttab' });
  assert.equal(tampered?.note, '<script>alert(1)</script>evil\nline two\ttab', 'markup kept as literal text; bidi and control characters dropped; line breaks and tabs kept');
  assert.equal(plainNote('a\u2066b\u2069c\u0000d'), 'abcd');
  for (const bad of ['56:1;alert(1)', '1:1', '56:', 'javascript:1', '56:1234567890123']) assert.equal(readProposalPrefill({ propose: bad }), null, bad);
  for (const file of ['features/briefs/ProposalForm.tsx', 'features/briefs/RequestDetail.tsx', 'app/(site)/requests/[id]/page.tsx']) {
    assert.doesNotMatch(code(file), /dangerouslySetInnerHTML/, `${file} renders the note as text`);
  }
  assert.match(code('app/api/mcp/route.ts'), /const note = typeof args\.note === 'string' \? plainNote\(args\.note\)\.trim\(\) : ''/, 'and what the owner is asked to sign is the same plain text');
});

test('a prepared link stays under the length links survive, leaving a long note to paste', () => {
  const long = proposalLink('https://pokter.xyz', '3f6c1a2e-8d4b-4c7a-9e21-5b0d7f9a1c34', { agentChainId: 56, agentTokenId: '269228', price: '0.12', deliverDays: 2, note: 'é'.repeat(1200) });
  assert.equal(long.noteInLink, false);
  assert.ok(long.url.length <= PROPOSAL_LINK_MAX);
  assert.equal(new URL(long.url).searchParams.get('note'), null);
  const route = code('app/api/mcp/route.ts');
  assert.match(route, /if \(!link\.noteInLink\) warnings\.push\('The note is too long to carry in a link/);
  assert.match(route, /authorizes: 'Nothing\. The link only fills in a form, and anyone can edit a link\./, 'preparing a link says it authorizes nothing');
  assert.match(code('features/briefs/ProposalForm.tsx'), /Anyone can edit a link, so they say nothing about who prepared them\./);
});

test('on submission the proposal route checks everything a link could have tampered with, before it stores anything', () => {
  const route = code('app/api/briefs/[id]/bids/route.ts');
  const post = route.slice(route.indexOf('export async function POST'));
  const order = [
    'acceptsProposals(brief)', /* status, read from the store, not the link */
    'parseBidContent(body.content, brief)', /* the request's token, and amounts within one hire's limits */
    'staleProposal(', /* freshly signed */
    'withinBudget(content, brief)', /* the budget */
    'registryOwner(content.agentChainId, content.agentTokenId)', /* ownership, from the registry at the time */
    'getAddress(bidder) === getAddress(owner)',
    'bidMessage({ ...content, chainId: brief.chainId, briefId: id, bidder, placedAt })', /* the request's chain, from the store */
    'signedByWallet(',
    'placeBid(bid)',
  ];
  const at = order.map((needle) => post.indexOf(needle));
  assert.ok(at.every((i) => i >= 0), `missing: ${order[at.findIndex((i) => i < 0)]}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'every check runs before the proposal is stored');
});
