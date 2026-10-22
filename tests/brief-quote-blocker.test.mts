import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { readBriefQuote, writeBriefQuote } from '../src/lib/history/brief-quote-query';

import {
  BRIEF_QUOTE_HOLDS_MS,
  briefQuoteOutranksFailure,
  briefQuoteStillSpeaks,
  decideHireBlocker,
} from '../src/lib/hire/blocker';
import { buildAgentCard } from '../src/lib/mcp/agent-card';
import { QUOTE_FAILURE_CODES } from '../src/lib/hire/failure';

/*
 * Vitals (56:367904) answered the sweep's generic price question without a
 * price, because that question names no wallet or token, and its page said
 * it "answers negotiate, but not with a signed quote" while it was signing
 * quotes for real briefs. A signed brief quote now sets that aside.
 *
 * It may set aside nothing else. Overriding on recency alone hid every
 * newer failure behind a week-old price — a gated endpoint, a wrong signer,
 * a card with no negotiate skill, a token no escrow settles — and the last
 * of those can be the brief quote's own.
 */
const NOW = Date.parse('2026-10-22T12:30:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const DAY = 24 * 3_600_000;

const payableQuote = { quotedAt: ago(DAY), payable: true };

test('a signed quote for a buyer brief this week still speaks for the agent', () => {
  assert.equal(briefQuoteStillSpeaks({ quotedAt: ago(42_000), payable: true }, NOW), true);
  assert.equal(briefQuoteStillSpeaks({ quotedAt: ago(BRIEF_QUOTE_HOLDS_MS - 1), payable: true }, NOW), true);
  assert.equal(briefQuoteStillSpeaks({ quotedAt: ago(BRIEF_QUOTE_HOLDS_MS + 1), payable: true }, NOW), false, 'a week-old quote no longer speaks for it');
  assert.equal(briefQuoteStillSpeaks(null, NOW), false);
  assert.equal(briefQuoteStillSpeaks({ quotedAt: 'whenever', payable: true }, NOW), false);
  assert.equal(briefQuoteStillSpeaks({ quotedAt: '2027-01-01T00:00:00Z', payable: true }, NOW), false, 'a time from the future is not trusted');
  // A minute of clock skew between the writer and the reader is a clock, not a forgery.
  assert.equal(briefQuoteStillSpeaks({ quotedAt: new Date(NOW + 30_000).toISOString(), payable: true }, NOW), true);
});

test('a brief quote outranks the stale pricing failure, and only when it came after it', () => {
  const stale = (observedAt: string) => ({ code: 'no-quote', observedAt });
  assert.equal(briefQuoteOutranksFailure(stale(ago(2 * DAY)), payableQuote, NOW), true);
  assert.equal(briefQuoteOutranksFailure(stale(ago(DAY / 2)), payableQuote, NOW), false, 'the sweep asked again after the quote and still got no price');
  assert.equal(briefQuoteOutranksFailure({ code: 'no-quote', observedAt: null }, payableQuote, NOW), false, 'an undated failure cannot be shown to be older');
  assert.equal(briefQuoteOutranksFailure(stale(ago(2 * DAY)), { quotedAt: ago(BRIEF_QUOTE_HOLDS_MS + 1), payable: true }, NOW), false);
});

test('a security, structural, authentication or payment failure survives a newer signed quote', () => {
  /*
   * Every one of these is about whether a job can reach the agent or be
   * paid for at all. A price it signed afterwards says nothing about any of
   * them, so none may be overridden.
   *
   * What this guards is the override set: widening
   * `STALE_PRICING_FAILURES` fails here. A code added to
   * `QUOTE_FAILURE_CODES` alone still passes, and is non-overridable
   * because that set is an allowlist — a property of the code, not
   * something this assertion checks.
   */
  const overridable = QUOTE_FAILURE_CODES.filter((code) =>
    briefQuoteOutranksFailure({ code, observedAt: ago(2 * DAY) }, payableQuote, NOW),
  );
  assert.deepEqual(overridable, ['no-quote']);
});

test('a brief quote in money no escrow settles overrides nothing', () => {
  const unpayable = { quotedAt: ago(DAY), payable: false };
  assert.equal(briefQuoteOutranksFailure({ code: 'no-quote', observedAt: ago(2 * DAY) }, unpayable, NOW), false);
});

/* The order of precedence, with the store's reads handed over directly. */
const decide = (over: Partial<Parameters<typeof decideHireBlocker>[0]> = {}) =>
  decideHireBlocker({ quote: null, payable: null, failed: null, brief: null, card: null, now: NOW, protocols: ['a2a'], ...over });

test('the stale pricing claim goes when a newer payable brief quote disproves it', () => {
  const failed = { code: 'no-quote', observedAt: ago(2 * DAY) };
  assert.match(decide({ failed })?.reason ?? '', /not with a signed quote/);
  assert.equal(decide({ failed, brief: payableQuote }), null);
});

test('a newer auth failure is not hidden by a signed brief quote', () => {
  const failed = { code: 'auth-required', detail: 'HTTP 403', observedAt: ago(DAY / 2) };
  const blocker = decide({ failed, brief: payableQuote });
  assert.equal(blocker?.code, 'auth-required');
  assert.equal(blocker?.observedAt, failed.observedAt, 'dated to the failure, not to the quote');
});

test('each blocker names the evidence that produced it, and a buyer’s quote is not the sweep', () => {
  /*
   * `/api/v1/agents/:chain/:token` prints a sentence for this, and it is
   * the endpoint whose whole claim is the evidence behind every claim. With
   * the source inferred rather than returned, a quote a buyer asked for
   * minutes earlier was reported as "the latest sweep's read-only price
   * request to the agent", dated to when the buyer asked. Reachable for
   * exactly the agents these branches exist for: the sweep never asked, and
   * one trial quote came back in a currency no escrow settles.
   */
  const unpayable = { quotedAt: ago(DAY), payable: false };
  assert.equal(decide({ brief: unpayable })?.from, 'brief');
  assert.equal(decide({ failed: { code: 'no-quote', observedAt: ago(2 * DAY) } })?.from, 'sweep');
  assert.equal(decide({ quote: { quotedAt: ago(DAY) }, payable: false })?.from, 'sweep');
  assert.equal(decide({ card: { problem: 'card-unreadable', readAt: new Date(NOW).toISOString() } })?.from, 'card');
});

test('an agent that signed something unpayable is told so, not called hireable', () => {
  const unpayable = { quotedAt: ago(DAY), payable: false };
  // Nothing else on record: the signature alone used to clear the page.
  const alone = decide({ brief: unpayable });
  assert.equal(alone?.code, 'payment-incompatible');
  assert.match(alone?.reason ?? '', /no enabled escrow settles in/);
  assert.equal(alone?.observedAt, unpayable.quotedAt);
  // And with the stale failure it is allowed to replace, the payment problem is what is left.
  assert.equal(decide({ failed: { code: 'no-quote', observedAt: ago(2 * DAY) }, brief: unpayable })?.code, 'no-quote');
});

/*
 * The two branches merged. #260 added a blocker from the page's own card
 * read; #262 lets a buyer's signed quote set aside the sweep's stale pricing
 * failure. Both touch this decision, and the combination is the case neither
 * branch could see on its own.
 */
test('a stale pricing failure disproved by a newer quote, beside a card Pokter could not read', () => {
  const blocker = decide({
    failed: { code: 'no-quote', observedAt: ago(2 * DAY) },
    brief: payableQuote,
    card: { problem: 'card-unreadable', readAt: new Date(NOW).toISOString() },
  });
  // The claim the quote disproves is gone...
  assert.doesNotMatch(blocker?.reason ?? '', /not with a signed quote/);
  // ...and what is left is the failed check, as a failed check.
  assert.equal(blocker?.code, 'card-unreadable');
  assert.equal(blocker?.transient, true);
  assert.doesNotMatch(blocker?.reason ?? '', /names no service|without connecting a running agent/);
  assert.equal(blocker?.observedAt, new Date(NOW).toISOString());
});

test('a card read that found no interface outranks an older brief quote, because it is newer', () => {
  const blocker = decide({
    failed: { code: 'no-quote', observedAt: ago(2 * DAY) },
    brief: payableQuote,
    card: { problem: 'card-without-interface', readAt: new Date(NOW).toISOString() },
  });
  assert.equal(blocker?.code, 'no-endpoint');
  assert.equal(blocker?.transient, false);
});

test('a verified quote an escrow can pay still blocks nothing, and one it cannot still does', () => {
  const quote = { quotedAt: ago(3_600_000) };
  assert.equal(decide({ quote, payable: true, failed: { code: 'auth-required', observedAt: ago(DAY) } }), null);
  assert.equal(decide({ quote, payable: false })?.code, 'payment-incompatible');
});

/*
 * The MCP card draws the record it is given. It used to drop the record's
 * blocker whenever a quote sat beside it, which dropped the payment problem
 * belonging to that very quote.
 */
test('a card beside a fresh signed quote still shows the record’s blocker', () => {
  const detail = { name: 'Vitals', chainId: 56, tokenId: '367904', hireBlocker: { reason: 'It quotes in a token no enabled escrow settles in, so its price cannot be funded.', fix: 'https://pokter.xyz/build/integration#escrows' } };
  const quote = { priceRaw: '2000000000000000000', currency: '0x55d398326f99059fF775485246999027B3197955', signer: '0x15A97307cAA68C24E4b5a0b83D331A6AA1EA195F', termsBound: true };
  const card = buildAgentCard(detail, { origin: 'https://pokter.xyz', quote });
  assert.match(card.blocker?.reason ?? '', /no enabled escrow settles in/);
  // The quote is still shown, in its own money: the card says both things.
  assert.equal(card.quote?.price, '2 USDT');
});

test('a record with nothing blocking still shows nothing blocking', () => {
  const detail = { name: 'Vitals', chainId: 56, tokenId: '367904', hireBlocker: null };
  const quote = { priceRaw: '10000000000000000', currency: '0xcE24439F2D9C6a2289F741120FE202248B666666', signer: '0x15A97307cAA68C24E4b5a0b83D331A6AA1EA195F', termsBound: true };
  assert.equal(buildAgentCard(detail, { origin: 'https://pokter.xyz', quote }).blocker, null);
});

/*
 * The network beside a quote is the escrow that can settle it, which is a
 * deployment fact and not a property of the token. Read with
 * `settlementChainOf` instead, the card called a mainnet-$U quote "BNB
 * Chain · Mainnet · Real funds" with mainnet escrow off — the unset
 * default, and local development — while `/api/hire/quote` refused that
 * same quote 409 `payment-incompatible`. One-chain assumptions have cost
 * this project twice already.
 */
test('the card names mainnet beside a mainnet quote only where mainnet escrow is enabled', () => {
  const detail = { name: 'Vitals', chainId: 56, tokenId: '367904', hire: { escrowChainId: 97 } };
  const quote = { priceRaw: '10000000000000000', currency: '0xcE24439F2D9C6a2289F741120FE202248B666666', signer: '0x15A97307cAA68C24E4b5a0b83D331A6AA1EA195F', termsBound: true };
  const card = () => buildAgentCard(detail, { origin: 'https://pokter.xyz', quote });
  const enabled = process.env.NEXT_PUBLIC_ESCROW_CHAINS;
  try {
    // What production runs (`fly.toml`): mainnet settles this, so say so.
    process.env.NEXT_PUBLIC_ESCROW_CHAINS = '97,56';
    assert.equal(card().network?.real, true);
    assert.equal(card().network?.label, 'BNB Chain · Mainnet');

    // Testnet only, which is what an unset variable means.
    process.env.NEXT_PUBLIC_ESCROW_CHAINS = '97';
    assert.notEqual(card().network?.real, true, 'no escrow here can move real funds for this quote');
    assert.equal(card().network?.money, 'Test tokens', 'falls back to the record rather than inventing an escrow');
  } finally {
    if (enabled === undefined) delete process.env.NEXT_PUBLIC_ESCROW_CHAINS;
    else process.env.NEXT_PUBLIC_ESCROW_CHAINS = enabled;
  }
  // With no quote at all the stored record still speaks for itself.
  assert.equal(buildAgentCard(detail, { origin: 'https://pokter.xyz' }).network?.real, false);
});

test('a quote in a token no escrow settles does not relabel the network', () => {
  // Real BNB Chain USDT: a real token, and no ERC-8183 escrow settles it.
  const detail = { name: 'Someone', chainId: 56, tokenId: '1', hire: { escrowChainId: 97 } };
  const quote = { priceRaw: '2000000000000000000', currency: '0x55d398326f99059fF775485246999027B3197955', signer: '0x15A9', termsBound: true };
  const enabled = process.env.NEXT_PUBLIC_ESCROW_CHAINS;
  try {
    process.env.NEXT_PUBLIC_ESCROW_CHAINS = '97,56';
    const card = buildAgentCard(detail, { origin: 'https://pokter.xyz', quote });
    assert.equal(card.network?.real, false, 'mainnet is enabled, and it does not settle USDT');
    assert.equal(card.quote?.price, '2 USDT', 'the price is still named in its own money');
  } finally {
    if (enabled === undefined) delete process.env.NEXT_PUBLIC_ESCROW_CHAINS;
    else process.env.NEXT_PUBLIC_ESCROW_CHAINS = enabled;
  }
});

/*
 * The routes are `server-only`, so where the brief quote is recorded and in
 * what order the MCP card reads it back are pinned as source facts (the
 * house pattern; see `passkey-signature-verify.test.mts`).
 */
const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

for (const route of ['app/api/hire/quote/route.ts', 'app/api/trial/route.ts']) {
  test(`${route} records whether an escrow settles the quote it just verified`, () => {
    const src = withoutComments(source(route));
    assert.match(src, /noteBriefQuote\([^)]*payable:/, 'a brief quote with no payability would default to hireable');
    assert.match(src, /escrowChainForCurrency\(/, 'payability is decided by the one function that already decides it');
    assert.doesNotMatch(src, /noteBriefQuote\(chainId, tokenId\)\s*;/, 'recording it without payability is the defect');
  });
}

test('the public endpoint has a sentence for every source, keyed so none can fall through', () => {
  const route = withoutComments(source('app/api/v1/agents/[chainId]/[tokenId]/route.ts'));
  assert.match(route, /BLOCKER_SOURCE: Record<BlockerSource, string>/, 'a map, so a new source is a type error');
  assert.match(route, /source: BLOCKER_SOURCE\[blocker\.from\]/);
  for (const from of ['sweep:', 'brief:', 'card:']) assert.ok(route.includes(from), `no sentence for ${from}`);
  // The sweep sentence must not be the one a buyer's own quote gets.
  const brief = /brief: '([^']+)'/.exec(route)?.[1] ?? '';
  assert.doesNotMatch(brief, /sweep/i);
  assert.match(brief, /buyer/i);
});

test('get_quote reads the agent record after the quote has been recorded', () => {
  /*
   * The card's "it can be priced" comes from the record, not from the card
   * builder second-guessing it, so the trial's write has to land first.
   */
  const src = withoutComments(source('app/api/mcp/route.ts'));
  const quoteTool = src.slice(src.indexOf("name: 'get_quote'"), src.indexOf("name: 'hire_link'"));
  assert.ok(quoteTool.indexOf('await trial(') < quoteTool.indexOf('await detail('), 'the record must be read after the quote is noted');
});

/*
 * The write decides which payability verdict survives, and neither
 * typecheck nor lint can see it. Run against a real database, the way
 * `probe-stats-query` runs the totals that took the homepage down.
 */
function briefQuotes(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(
    `CREATE TABLE brief_quotes (
       chain_id  INTEGER NOT NULL,
       token_id  TEXT    NOT NULL,
       quoted_at TEXT    NOT NULL,
       payable   INTEGER NOT NULL,
       PRIMARY KEY (chain_id, token_id)
     )`,
  );
  return db;
}

test('the later quote wins, and its payability comes with it', () => {
  const db = briefQuotes();
  writeBriefQuote(db, 56, '367904', { quotedAt: '2026-10-22T12:00:00.000Z', payable: true });
  writeBriefQuote(db, 56, '367904', { quotedAt: '2026-10-22T12:00:01.000Z', payable: false });
  assert.deepEqual(readBriefQuote(db, 56, '367904'), { quotedAt: '2026-10-22T12:00:01.000Z', payable: false });
});

test('an earlier quote arriving late never revives its verdict', () => {
  const db = briefQuotes();
  writeBriefQuote(db, 56, '367904', { quotedAt: '2026-10-22T12:00:01.000Z', payable: false });
  writeBriefQuote(db, 56, '367904', { quotedAt: '2026-10-22T12:00:00.000Z', payable: true });
  assert.deepEqual(readBriefQuote(db, 56, '367904'), { quotedAt: '2026-10-22T12:00:01.000Z', payable: false });
});

test('a quote in the same millisecond is still the later one', () => {
  /*
   * `>` dropped this write and kept the earlier verdict for a quote Pokter
   * had already replaced. Both routes write this row and ISO-8601 stops at
   * milliseconds, so the collision is reachable.
   */
  const db = briefQuotes();
  const at = '2026-10-22T12:00:00.000Z';
  writeBriefQuote(db, 56, '367904', { quotedAt: at, payable: true });
  writeBriefQuote(db, 56, '367904', { quotedAt: at, payable: false });
  assert.equal(readBriefQuote(db, 56, '367904')?.payable, false, 'the later write is the one to keep');
});

test('an agent with no recorded quote reads as none, and rows stay their own', () => {
  const db = briefQuotes();
  writeBriefQuote(db, 56, '367904', { quotedAt: '2026-10-22T12:00:00.000Z', payable: true });
  assert.equal(readBriefQuote(db, 56, '999'), null);
  assert.equal(readBriefQuote(db, 97, '367904'), null);
  assert.equal(readBriefQuote(db, 56, '367904')?.payable, true);
});
