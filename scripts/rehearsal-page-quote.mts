/**
 * A hire-page quote response built around a REAL quote from the local
 * Evidence handler, for the browser rehearsal in docs/release/hire-tokens.md
 * (section 8). Nothing is signed by a wallet, sent or paid.
 *
 * The hire page asks agents at their registered endpoint, which for Pokter
 * Evidence is production; this asks the local handler instead, in the token
 * given, and writes what `/api/hire/quote` would return for that quote.
 *
 *   npx tsx scripts/rehearsal-page-quote.mts "<brief>" out.json [token] [origin]
 */
import { writeFileSync } from 'node:fs';

const [task, outFile, tokenArg, originArg] = process.argv.slice(2);
if (!task || !outFile) throw new Error('usage: rehearsal-page-quote.mts "<brief>" out.json [token] [origin]');
const TOKEN = tokenArg ?? '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
const ORIGIN = originArg ?? 'http://localhost:4318';
process.env.NEXT_PUBLIC_HIRE_TOKENS = `97:${TOKEN}`;
process.env.NEXT_PUBLIC_ESCROW_CHAINS = '97';

const { settlementHint } = await import('../src/lib/network/escrow');
const { preferredCurrency } = await import('../src/lib/network/currency-preference');
const { negotiationContent } = await import('../src/lib/erc8183/negotiation');
const { paymentTokenAt } = await import('../src/lib/network/tokens');

type Json = Record<string, unknown>;
const post = async (path: string, body: unknown, headers: Record<string, string> = {}) =>
  (await fetch(new URL(path, ORIGIN), { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }).then((r) => r.json())) as Json;

/* The shape the page reads, from the route itself (its quote is replaced below). */
const template = await post('/api/hire/quote', { chainId: 97, tokenId: '2599', task });
const preferred = preferredCurrency(97, TOKEN);
const token = paymentTokenAt(97, TOKEN);
if (!preferred || !token) throw new Error(`${TOKEN} is not offered on 97 in this process.`);
const sent = String(template.task ?? task);
const reply = await post(
  '/api/evidence/a2a?chain=97',
  { jsonrpc: '2.0', id: 1, method: 'message/send', params: { message: { role: 'user', messageId: 'rehearsal', parts: [{ kind: 'data', data: { skill: 'negotiate', task_description: sent, ...settlementHint({ chain_id: 97 }, undefined, undefined, preferred) } }] } } },
  { 'x-forwarded-for': '127.0.0.1' },
);
const result = reply.result as Json;
const envelope = ((result.parts as Array<{ data?: Json }> | undefined)?.find((p) => p.data)?.data ?? result) as Json;
const terms = (envelope.response as { terms: { price: string; currency: string } }).terms;
const out = {
  ...template,
  token: { address: token.address, symbol: token.symbol, decimals: token.decimals, chainId: 97, disclosure: token.disclosure ?? null },
  preference: { asked: { token: token.address, symbol: token.symbol }, honoured: terms.currency.toLowerCase() === token.address.toLowerCase(), note: null },
  quote: {
    ...(template.quote as Json),
    negotiationHash: envelope.negotiation_hash,
    providerSignature: envelope.provider_sig,
    priceRaw: terms.price,
    priceU: Number(BigInt(terms.price)) / 10 ** token.decimals,
    currency: terms.currency,
    expiresAt: new Date(Number(envelope.quote_expires_at) * 1000).toISOString(),
    domain: { chainId: Number(envelope.chain_id), verifyingContract: envelope.verifying_contract },
    anchor: { ...negotiationContent(envelope, sent), negotiation_hash: envelope.negotiation_hash, provider_sig: envelope.provider_sig },
  },
};
writeFileSync(outFile, JSON.stringify(out));
console.log(`Wrote ${outFile}: ${terms.price} base units of ${terms.currency}, valid until ${out.quote.expiresAt}.`);
