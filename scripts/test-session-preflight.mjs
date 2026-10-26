#!/usr/bin/env node
/**
 * Pre-flight for the owner-led test session (docs/release/test-session.md):
 * a fresh signed quote from production for every currency to be paid, so no
 * agent is assumed to support a token from its listing.
 *
 * Read-only for money: `get_quote` is free and executes nothing, though the
 * agent is contacted and Pokter records the request, as for any quote.
 *
 *   node scripts/test-session-preflight.mjs <$U|USDT|USDC|USD1> [origin]   (default https://pokter.xyz)
 *
 * One currency at a time, as the session enables them one at a time.
 */
const ASK = { $U: '$U', USDT: 'Binance-Peg USDT', USDC: 'Binance-Peg USDC', USD1: 'USD1' }[process.argv[2] ?? ''];
if (!ASK) {
  console.error('Usage: node scripts/test-session-preflight.mjs <$U|USDT|USDC|USD1> [origin]');
  process.exit(2);
}
const origin = (process.argv[3] ?? 'https://pokter.xyz').replace(/\/$/, '');
const BRIEF = 'Check the BNB Chain token 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82 before a buy: is it safe to trade, and why.';
const TOUCHSTONE = { chainId: 56, tokenId: '374115', wallet: '0x071044a5A92F6C90cf9D08D5059921da734D19e7' };
const TOKENS = {
  $U: '0xcE24439F2D9C6a2289F741120FE202248B666666',
  'Binance-Peg USDT': '0x55d398326f99059fF775485246999027B3197955',
  'Binance-Peg USDC': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  USD1: '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d',
};
const EXPECT_RAW = '50000000000000000';

let id = 0;
const quote = async (agent, task, preferred) => {
  const response = await fetch(`${origin}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name: 'get_quote', arguments: { chain_id: agent.chainId, token_id: agent.tokenId, task, ...(preferred ? { preferred_currency: { escrow_chain_id: 56, token: preferred } } : {}) } } }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  const json = JSON.parse(text.startsWith('{') ? text : text.split('\n').find((l) => l.startsWith('data:'))?.slice(5) ?? '{}');
  const content = json.result?.structuredContent ?? JSON.parse(json.result?.content?.[0]?.text ?? '{}');
  return content;
};

const rows = [];
const same = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
for (const [name, token] of Object.entries(TOKENS).filter(([n]) => n === ASK)) {
  const q = await quote(TOUCHSTONE, BRIEF, name === '$U' ? null : token).catch((e) => ({ error: String(e) }));
  const terms = q.receipt?.response?.terms ?? {};
  const ok = same(terms.currency, token) && terms.price === EXPECT_RAW && same(q.verifiedSigner, TOUCHSTONE.wallet) && q.terms?.canBeFunded === true;
  rows.push({ agent: 'Touchstone 56/374115', currency: name, signed: `${terms.price ?? '—'} of ${terms.currency ?? '—'}`, signer: q.verifiedSigner ?? '—', fundable: q.terms?.canBeFunded ?? false, honoured: q.preference?.honoured ?? (name === '$U' ? 'n/a' : 'not reported'), verdict: ok ? 'READY' : 'PENDING (do not pay)', why: q.error ?? q.terms?.whyItCannotBeFunded ?? q.preference?.note ?? '' });
}
for (const r of rows) console.log(`${r.verdict.padEnd(22)} ${r.agent} · ${r.currency}: signed ${r.signed} by ${r.signer}; fundable ${r.fundable}; preference honoured ${r.honoured}${r.why ? ` — ${r.why}` : ''}`);
process.exitCode = rows.every((r) => r.verdict === 'READY') ? 0 : 1;
