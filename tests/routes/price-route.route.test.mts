import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { toAgentSummary } from '../../src/lib/api/v1';
import { buildTrackRecord } from '../../src/lib/history/record';

/*
 * The API and the agent page's pay-per-call line, which are server-only:
 * a price is labelled with its route ("escrow") beside every field it
 * already had, and a declared x402 endpoint is said as a declaration only.
 */

const U56 = '0xcE24439F2D9C6a2289F741120FE202248B666666';
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the API adds route "escrow" beside every existing price field, changing none', () => {
  const listing = {
    agent: { chain_id: 56, token_id: '374115', name: 'Touchstone', description: '', total_feedbacks: 0, image_url: null, owner_address: '0x1', agent_wallet: '0x2', created_at: '2026-01-01T00:00:00Z' },
    category: 'token-safety',
    confidence: 1,
    attestationCount: 0,
    quote: { priceU: 0.05, priceRaw: '50000000000000000', currency: U56, signer: '0x2', quotedAt: '2026-10-26T20:00:00Z', expiresAt: '2026-10-26T20:15:00Z' },
    quotePayable: true,
  };
  const summary = toAgentSummary(listing as never, buildTrackRecord([] as never, new Date()), 'unknown' as never, 'https://pokter.xyz') as unknown as { price: { value: Record<string, unknown> } };
  const price = summary.price.value;
  assert.equal(price.route, 'escrow');
  for (const field of ['priceRaw', 'currency', 'quotedAt', 'expiresAt', 'current', 'payable']) assert.ok(field in price, `${field} kept`);
  assert.equal(price.payable, true);
  assert.equal(price.current, false);

  assert.match(source('src/app/api/v1/agents/[chainId]/[tokenId]/route.ts'), /escrowChainId: payable === false \? null : escrowChain,\s*\/\*[^*]*\*\/\s*route: 'escrow',\s*provenance: 'attested',/);
  assert.match(source('src/app/api/mcp/route.ts'), /priceRoute: row\.priceU !== null \? 'escrow' : null,/);
});

test('pay-per-call is said as a declaration, only while x402 is off, and not as a working endpoint', async () => {
  const { PAY_PER_CALL_DECLARED } = await import('../../src/features/x402/PayPerCallDeclared');
  assert.equal(PAY_PER_CALL_DECLARED, 'Declares pay-per-call; payments not supported on Pokter.');
  const component = source('src/features/x402/PayPerCallDeclared.tsx');
  assert.match(component, /not that the endpoint works, or what it charges/);
  assert.doesNotMatch(component, /readX402Terms|fetch\(/, 'nothing is called');
  const page = source('src/app/(site)/agents/[chainId]/[tokenId]/page.tsx');
  assert.match(page, /\{!x402Enabled\(\) && p\.chainId === 56 && \(\s*<Suspense fallback=\{null\}>\s*<PayPerCallDeclared/);
  const declared = source('src/lib/x402/declared.ts');
  assert.match(declared, /x402EndpointFor\(chainId, tokenId\)/, 'the registration read, not the endpoint');
});
