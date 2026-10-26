import { NextResponse } from 'next/server';

import { nonDefaultHireToken } from '@/lib/erc8183/hire-token';
import { parseUnits } from 'viem';
import { getErc8183Job } from '@altananetwork/sdk';

import { POST as compileBriefRoute } from '@/app/api/hire/compile/route';
import { POST as quoteForBriefRoute } from '@/app/api/hire/quote/route';
import { classify } from '@/lib/agents/categories';
import { altanaNetworkFor } from '@/lib/altana/client';
import { originOf } from '@/lib/api/respond';
import { handsOverRequest, hireRequestKey, indexedJobForTerms, retryDecision } from '@/lib/assistant/idempotency';
import { prepareHire } from '@/lib/assistant/hire-request';
import { displayName } from '@/lib/assistant/mandate';
import { reconcileUncertainHire } from '@/lib/assistant/reconcile-hire';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { jobTaskFromDescription } from '@/lib/erc8183/job-envelope';
import { briefRefusalBody } from '@/lib/erc8183/skill-request';
import { getJobStore } from '@/lib/erc8183/store';
import { BUDGET_MAX, BUDGET_MIN } from '@/lib/hire/budget-limits';
import type { CompiledBrief } from '@/lib/hire/brief-compiler';
import { networkOf } from '@/lib/mcp/agent-card';
import { requireDecimals } from '@/lib/network/tokens';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 40;

/**
 * The hire, written down in full and unsigned, for an owner to approve.
 *
 * This is the step an assistant could not take. It could search, read the
 * evidence, ask for a price and hand over a link; everything after the link
 * was somebody's hands on a keyboard. What was missing was not a way to
 * pay — there are two of those and a human stands in both — but a way to
 * state a hire completely enough that a human can approve it in one look:
 * chain, escrow contract, provider wallet and where that address came from,
 * token, amount, expiry, and the exact words the price was signed over.
 *
 * Three things it is not, each of them a thing this repo has been bitten by.
 *
 *  - **It is not a payment path.** No wallet is created, no calldata is
 *    built, no job is created, nothing is signed. The owner approves in
 *    their own wallet, where `hireFromExternalWallet` builds the five
 *    ERC-8183 calls through the SDK and `checkPurchaseIntent` tests these
 *    same terms one last time before the first signature. Adding a third
 *    funding path here would be the second payment engine this work was
 *    told not to build, and it would be the one with no human in it.
 *  - **It is not a second brief compiler or a second quote.** Both are
 *    reached by calling the routes that already answer them, with the
 *    caller's own headers, so the text an owner approves is the text
 *    `compileBrief` produced and the price is the one `/api/hire/quote`
 *    verified, under the same rate limits and refused in the same words.
 *  - **It is not a free retry.** A caller that asks twice for one purchase
 *    gets one request back, under one key, and once that key has a job the
 *    answer is the job. A caller that is unsure whether a funding landed is
 *    answered by the escrow before anything is offered again.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`hire-prepare:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many hire preparations. Wait a moment and try again.' },
      { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const chainId = Number(body.chainId) as ChainId;
  const tokenId = String(body.tokenId ?? '');
  const task = String(body.task ?? '').trim();
  if ((chainId !== 56 && chainId !== 97) || !/^\d+$/.test(tokenId)) {
    return NextResponse.json({ error: 'Invalid agent identifier.' }, { status: 400 });
  }
  if (!task || task.length > 2000) {
    return NextResponse.json({ error: 'The brief must be between 1 and 2000 characters.' }, { status: 400 });
  }

  /*
   * The escrow the owner authorised, required and never defaulted.
   *
   * This route used to take the escrow from the quote's own currency, which
   * handed the choice between real money and test tokens to the agent being
   * paid. An owner who said "hire 97/367904, at most 5" could be given a
   * prepared request for 5 **real** $U on chain 56, because the agent
   * answered in mainnet $U and every mandate field was then derived from
   * that same answer — so the comparison was the quote against itself and
   * no refusal was reachable. `escrow.ts` records this crossing happening
   * in the wild in the other direction.
   *
   * It also took the request key out of the owner's hands: chain, escrow
   * and token are in the key, so a counterparty could re-quote in the other
   * token and produce a different key for the same purchase, which is the
   * second job the key exists to prevent.
   *
   * Taken from the owner, then, and defaulting is not the lesser evil:
   * defaulting to the agent's registry chain would pick between real and
   * test money silently, which is the one choice that must never be made
   * on somebody's behalf.
   */
  const escrowChain = Number(body.escrowChainId);
  if (escrowChain !== 56 && escrowChain !== 97) {
    return NextResponse.json(
      {
        error:
          'escrowChainId is required: 56 to fund on BNB Chain with real $U, or 97 to fund on BNB Testnet with test tokens. The owner states it, because an agent registered on one network may quote in the other’s token, and Pokter will not pick between real and test money for them.',
        layer: 'input',
        code: 'no-owner-chain',
      },
      { status: 400 },
    );
  }

  /*
   * The owner's ceiling, required and never defaulted.
   *
   * A budget Pokter picked is a budget nobody approved, and `budget-default`
   * exists for a form where a human reads the number it filled in. There is
   * no human reading this response, so there is no default: a caller that
   * has not been told a limit by its owner cannot prepare a hire at all.
   *
   * Read as a number only when it arrived as one. `Number("5 U")` is NaN and
   * caught below, but `Number(["5"])` is 5 and `Number(true)` is 1: a budget
   * is a figure the owner said, not a value coerced out of whatever shape a
   * caller sent.
   */
  const maxBudget = typeof body.maxBudget === 'number' ? body.maxBudget : Number.NaN;
  if (!Number.isFinite(maxBudget) || maxBudget < BUDGET_MIN || maxBudget > BUDGET_MAX) {
    return NextResponse.json(
      {
        error: `maxBudget is required and must be a number: the most the owner has authorised for this job, between ${BUDGET_MIN} and ${BUDGET_MAX} in whole $U on chain ${escrowChain}${escrowChain === 56 ? ' (real funds)' : ' (test tokens)'}. Pokter sets no budget of its own.`,
        layer: 'input',
        code: 'no-owner-budget',
      },
      { status: 400 },
    );
  }

  /*
   * The wallet that will fund this hire, required and never defaulted.
   *
   * It was optional, and optional made the whole owner binding opt-in by a
   * field a caller may simply not pass. Omitted, both the key and the
   * attach gate lose the owner, and the behaviour is the finding this was
   * built to close: two owners asking for the same work collide on one key
   * and the second is handed the first one's job — a job they cannot
   * release, dispute or read. The index backstop is holed in exactly that
   * case too, because it also compares on the owner. A protection that is
   * skipped by omission is not a protection.
   *
   * Pokter cannot supply it: whose wallet is going to pay is a question for
   * the owner, and any value chosen here would be a wallet nobody named.
   * Public address only — a key or a seed has no business on this path, and
   * nothing on it ever asks for one.
   */
  const ownerAddress = typeof body.owner === 'string' && /^0x[0-9a-fA-F]{40}$/.test(body.owner) ? body.owner : null;
  /*
   * The money the owner authorised, when it is not $U: an address, never a
   * symbol. Only a USDT price needs it, and a USDT price without it is
   * refused below. `maxBudget` is then counted in this token.
   */
  const ownerToken = typeof body.paymentToken === 'string' && /^0x[0-9a-fA-F]{40}$/.test(body.paymentToken) ? body.paymentToken : null;
  if (!ownerAddress) {
    return NextResponse.json(
      {
        error:
          'owner is required: the public address of the wallet that will fund this hire. The prepared request is bound to it, so one owner is never handed another owner’s job and a payment can be checked against the request it answered. Ask the owner for it; Pokter cannot choose a wallet on their behalf. Never send a private key or seed phrase.',
        layer: 'input',
        code: 'no-owner-address',
      },
      { status: 400 },
    );
  }
  const mandateKey = typeof body.requestId === 'string' ? body.requestId.slice(0, 64) : null;
  const uncertainJobId = typeof body.possiblyFundedJobId === 'string' && /^\d{1,18}$/.test(body.possiblyFundedJobId) ? body.possiblyFundedJobId : null;

  const agent = await getAgent(chainId, tokenId).catch(() => null);
  if (!agent) return NextResponse.json({ error: 'No such agent.' }, { status: 404 });

  /*
   * Where escrow may pay, from the registry record and from nowhere else.
   *
   * `requestQuote` will not even ask an agent that lists no wallet, and it
   * verifies the signature against this address, so a quote that exists
   * implies this is present and that `quote.signer` equals it. Both are
   * asserted again below, at the point the money is described: the property
   * is what makes the provider in a prepared request trustworthy, and a
   * change to the quote path must not be able to redirect payment silently.
   */
  const providerFromRegistry = agent.agent_wallet;
  if (!providerFromRegistry) {
    return NextResponse.json(
      {
        error: `The ERC-8004 registry lists no agent wallet for ${agent.name || `Agent #${tokenId}`}, so there is no address this hire may pay. Nothing was prepared. An address an agent names in a reply is not one.`,
        layer: 'seller',
        code: 'no-registered-wallet',
      },
      { status: 409 },
    );
  }

  /* The caller's own headers, so the inner routes rate-limit and log the
     real client rather than this process. */
  const passed: Record<string, string> = Object.fromEntries(
    ['fly-client-ip', 'x-forwarded-for', 'user-agent', 'x-forwarded-host', 'x-forwarded-proto'].flatMap((header) =>
      request.headers.get(header) ? [[header, request.headers.get(header) as string]] : [],
    ),
  );
  const local = new URL(request.url).origin;
  const inner = (path: string, payload: unknown) =>
    new Request(new URL(path, local).href, {
      method: 'POST',
      headers: { ...passed, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

  /*
   * The brief, compiled by the compiler the review screen uses, with the
   * buyer's answers bound to the keys they were given for.
   */
  const compiled = await compileBriefRoute(inner('/api/hire/compile', { chainId, tokenId, task, answers: body.answers }));
  const compiledBody = (await compiled.json()) as { brief?: CompiledBrief; error?: string };
  if (!compiled.ok || !compiledBody.brief) {
    return NextResponse.json(compiledBody, { status: compiled.status });
  }
  const brief = compiledBody.brief;
  if (!brief.ok || brief.payload === null) {
    /*
     * The questions, as the refusal. In the hire form these are guidance
     * beside the brief and a prose brief may still be sent; here there is
     * nobody to read them on a screen, so a request that cannot be stated
     * completely is not prepared.
     */
    return NextResponse.json(
      {
        ...briefRefusalBody({
          message: `${agent.name || `Agent #${tokenId}`} declares inputs this brief does not supply. Answer these and prepare again; each answer is used for the field it was asked for.`,
          code: 'brief-incomplete',
          skill: brief.skill?.id ?? null,
          questions: brief.missing,
        }),
        brief,
      },
      { status: 400 },
    );
  }

  /* The exact text that will be quoted, committed on chain and delivered. */
  const payload = brief.payload;

  /*
   * The signed price, from the route that already verifies one: the
   * signature, that it is bound to this exact brief, that an enabled escrow
   * settles its token, and that its domain names that escrow's contract.
   * Its refusals are returned verbatim, so a caller hitting this surface
   * and the hire page is told the same thing in the same words.
   */
  /* Pokter's own classification, decided once: it goes to the quote so the
     acceptance criteria match the check, and into the job envelope below
     so the check reads back the same value. */
  const classified = classify(agent);
  const hireCategory = classified === 'unclassified' ? 'Uncategorised' : classified;

  /*
   * The category travels with the quote so the acceptance criteria the
   * route composes match the ones ProofRun will check against: it reads
   * the category from the job envelope, which is built from this same
   * value. Without it the brief alone decides, and a prepared hire could
   * be checked under criteria it was never quoted against.
   */
  const quoted = await quoteForBriefRoute(
    inner('/api/hire/quote', { chainId, tokenId, task: payload, category: hireCategory }),
  );
  const quotedBody = (await quoted.json()) as {
    quote?: { negotiationHash: string; priceRaw: string; currency: string; signer: string; expiresAt: string | null; domain: { chainId: number; verifyingContract: string } | null };
    escrowChainId?: number;
    error?: string;
  };
  if (!quoted.ok || !quotedBody.quote || typeof quotedBody.escrowChainId !== 'number') {
    return NextResponse.json(quotedBody, { status: quoted.ok ? 502 : quoted.status });
  }
  const quote = quotedBody.quote;

  /*
   * The agent answered in a currency that settles somewhere the owner did
   * not authorise. Refused here, before a key is derived, a row is written
   * or a request is built — so the counterparty cannot choose the network,
   * cannot cross test tokens into real money, and cannot move the key.
   *
   * Not retargeted, and not "helpfully" prepared on the chain it named: the
   * owner said which money this hire spends, and an agent quoting in the
   * other one has declined the hire the owner asked for.
   */
  if (quotedBody.escrowChainId !== escrowChain) {
    const real = (id: number) => (id === 56 ? 'real $U on BNB Chain' : 'test $U on BNB Testnet');
    return NextResponse.json(
      {
        error: `${agent.name || `Agent #${tokenId}`} signed a price that settles on chain ${quotedBody.escrowChainId} (${real(quotedBody.escrowChainId)}), and the owner authorised chain ${escrowChain} (${real(escrowChain)}). Nothing was prepared. Ask the owner for chain ${quotedBody.escrowChainId} explicitly if that is what they want.`,
        layer: 'payment',
        code: 'chain-not-in-mandate',
        retryable: false,
        ownerChainId: escrowChain,
        quotedChainId: quotedBody.escrowChainId,
      },
      { status: 409 },
    );
  }
  const escrowChainId = escrowChain;

  const addresses = correctedErc8183Addresses(escrowChainId);
  /*
   * The token is the one the seller signed. A $U price is prepared as it
   * always was. A USDT price is prepared only when USDT hiring is on and the
   * owner named exactly that token: otherwise the agent priced money the
   * owner did not authorise, which is refused, never prepared in $U.
   */
  let quotedToken: ReturnType<typeof nonDefaultHireToken>;
  try {
    quotedToken = nonDefaultHireToken(escrowChainId, quote.currency);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message, layer: 'payment', code: 'token-not-offered', retryable: false }, { status: 409 });
  }
  if (quotedToken && (!ownerToken || ownerToken.toLowerCase() !== quotedToken.address.toLowerCase())) {
    return NextResponse.json(
      {
        error: `${agent.name || `Agent #${tokenId}`} signed a price in ${quotedToken.symbol} (${quotedToken.address}), and the owner ${ownerToken ? `authorised ${ownerToken}` : 'named no token, which means $U'}. Nothing was prepared. Ask the owner whether to pay in ${quotedToken.symbol}, then pass payment_token ${quotedToken.address} with a ceiling in ${quotedToken.symbol}.`,
        layer: 'payment',
        code: 'token-not-in-mandate',
        retryable: false,
        quotedToken: quotedToken.address,
      },
      { status: 409 },
    );
  }
  if (!quotedToken && ownerToken && ownerToken.toLowerCase() !== addresses.paymentToken.toLowerCase()) {
    return NextResponse.json(
      { error: `The owner authorised ${ownerToken}, and ${agent.name || `Agent #${tokenId}`} signed a price in $U. Nothing was prepared.`, layer: 'payment', code: 'token-not-in-mandate', retryable: false },
      { status: 409 },
    );
  }
  const hireTokenAddress = (quotedToken?.address ?? addresses.paymentToken) as `0x${string}`;
  let decimals: number;
  try {
    decimals = requireDecimals(escrowChainId, hireTokenAddress);
  } catch (error) {
    /* A token Pokter has not verified has no safe scale, so no amount can be
       stated: `lib/network/tokens` refuses rather than assume eighteen. */
    return NextResponse.json({ error: (error as Error).message, layer: 'payment', code: 'unverified-token' }, { status: 409 });
  }

  /*
   * What identifies this purchase. The price is deliberately not part of
   * it — see `hireRequestKey` — because a retry asks the agent again and
   * may be answered with a different number, and a key that moved with the
   * price would offer a second hire of work that is already funded.
   */
  const terms = {
    agentChainId: chainId,
    agentTokenId: tokenId,
    chainId: escrowChainId,
    escrow: addresses.commerce,
    provider: quote.signer,
    /* Pokter's own token for the chain the owner named, not the agent's
       echo of it. The mandate below asserts the quoted currency is this
       token; the key must not be a string the counterparty spells. */
    token: hireTokenAddress,
    owner: ownerAddress,
    task: payload,
  };
  const requestKey = hireRequestKey(terms, mandateKey);
  const store = getJobStore();
  const recorded = store.preparedHire(requestKey);

  /*
   * A funding attempt the caller cannot account for is read back from the
   * escrow before anything else happens — the rule `funding-outcome` was
   * written for, applied at the start of a retry rather than at the end of
   * one.
   */
  let reconciled: ReturnType<typeof reconcileUncertainHire> | null = null;
  if (uncertainJobId) {
    /*
     * The owner is known here because the route will not proceed without
     * one: whose job the id holds is the field that decides whether this
     * payment is the owner's at all, and it used to be refused separately
     * at this point for a request prepared anonymously. There is no such
     * request now.
     */
    const onchain = await getErc8183Job(altanaNetworkFor(escrowChainId), BigInt(uncertainJobId)).catch(() => null);
    reconciled = reconcileUncertainHire({
      onchain: onchain
        ? {
            client: onchain.client,
            provider: onchain.provider,
            budget: onchain.budget,
            statusName: onchain.statusName,
            task: jobTaskFromDescription(onchain.description),
          }
        : null,
      /*
       * Against the owner's ceiling, not against this retry's price: the
       * owner funds the budget they chose in their own wallet, and a retry
       * re-quotes. See `reconcile-hire`.
       */
      expect: { owner: ownerAddress, provider: quote.signer, ceilingRaw: parseUnits(String(maxBudget), decimals).toString(), task: payload },
    });
    if (reconciled.outcome === 'funded') store.attachPreparedHireJob(requestKey, uncertainJobId);
  }

  const decision = retryDecision({
    recorded: recorded ? { jobId: recorded.jobId, chainId: recorded.chainId } : null,
    /* The index is everybody's — `byAgent` is every buyer's job for this
       agent — so the funding wallet travels with it. A brief is work, not a
       buyer, and two owners can send one byte for byte. */
    indexed: indexedJobForTerms(
      store.byAgent(chainId, tokenId).map((job) => ({
        jobId: job.jobId,
        chainId: job.chainId,
        agentChainId: job.agentChainId,
        agentTokenId: job.agentTokenId,
        provider: job.provider,
        task: job.task,
        client: job.client ?? null,
      })),
      terms,
      ownerAddress,
    ),
    ...(uncertainJobId && reconciled ? { uncertain: { jobId: uncertainJobId, outcome: reconciled.outcome } } : {}),
  });

  const origin = originOf(request);
  const approvalUrl = new URL(`/hire/${chainId}/${tokenId}`, origin);
  approvalUrl.searchParams.set('task', payload.slice(0, 2000));
  /*
   * The escrow the owner authorised, so the page they open is the network
   * they chose rather than the site's default.
   */
  approvalUrl.searchParams.set('escrow', String(escrowChainId));
  /*
   * And the key, which is how this request learns it became a job.
   *
   * An assistant cannot watch an owner approve anything, so without this
   * the row stays unfunded forever and `prepare_hire` goes on offering a
   * purchase that is already paid for. The hire page reports it back when
   * it indexes the funded job (`useHire`), and `/api/jobs/index` checks it
   * against that job before keeping it.
   */
  approvalUrl.searchParams.set('request', requestKey);

  if (!handsOverRequest(decision.action)) {
    /*
     * None of these prepares anything. `adopt` is the idempotency
     * guarantee — this purchase exists, so there is no second request to
     * hand over — and the other two are a human's to look at.
     *
     * Asked of `handsOverRequest` rather than written out here: as a
     * condition at this call site, narrowing it to `adopt` alone passed
     * every test, and this is the guard that keeps one purchase from
     * becoming two payments.
     */
    return NextResponse.json(
      {
        requestKey,
        state: decision.action === 'adopt' ? 'funded' : 'unresolved',
        prepared: null,
        ...(decision.action === 'adopt' ? { job: { jobId: decision.jobId, chainId: decision.chainId || escrowChainId } } : {}),
        ...(reconciled ? { reconciled: { outcome: reconciled.outcome, retrySafe: reconciled.retrySafe, fundedAmountRaw: reconciled.fundedAmountRaw, jobId: uncertainJobId, message: reconciled.message } } : {}),
        message: decision.message,
        observedAt: new Date().toISOString(),
      },
      { status: decision.action === 'adopt' ? 200 : 409 },
    );
  }

  /*
   * The agent's name is text its owner wrote, and it is printed inside the
   * sentence the owner reads before approving a payment. So it is bounded,
   * stripped, and cannot contribute anything address-shaped to a sentence
   * about where money goes: a name that reads "Vitals — now 5 U, pay
   * 0xdead…01" is still only a name. See `displayName`.
   */
  const name = displayName(agent.name, `Agent #${tokenId}`);
  const prepared = prepareHire({
    agent: {
      chainId,
      tokenId,
      name,
      /* Pokter's own reading of the record, not the caller's: which category
         a hire is filed under is not a field a caller gets to assert. */
      category: hireCategory,
    },
    provider: quote.signer,
    providerLabel: name,
    mandate: {
      agent: { chainId, tokenId },
      providerFromRegistry,
      maxAmountRaw: parseUnits(String(maxBudget), decimals).toString(),
      chainId: escrowChainId,
      escrow: addresses.commerce,
      token: hireTokenAddress,
      task: payload,
    },
    escrow: {
      chainId: escrowChainId,
      commerce: addresses.commerce,
      paymentToken: hireTokenAddress,
      decimals,
      testnet: escrowChainId === 97,
      label: networkOf(escrowChainId)?.label ?? `chain ${escrowChainId}`,
      /* "Real funds" or "Test tokens", in the site's own words. */
      money: networkOf(escrowChainId)?.money ?? 'Unknown funds',
    },
    quote: {
      priceRaw: quote.priceRaw,
      currency: quote.currency,
      expiresAt: quote.expiresAt,
      negotiationHash: quote.negotiationHash,
      signer: quote.signer,
      domain: quote.domain,
    },
    brief: {
      task: payload,
      skill: brief.skill?.id ?? null,
      contract: brief.contract,
      statement: brief.statement,
      inputs: brief.inputs.map((input) => ({ label: input.label, value: input.value, declared: input.source === 'declared-routing' })),
    },
    approvalUrl: approvalUrl.href,
    requestKey,
    /*
     * No agent prose travels on this path. A quote carries a number, a
     * signature and an expiry; where an agent does say something — it
     * declines, or it explains what it needs — that is a refusal, and the
     * quote route already returns the agent's own words, attributed. The
     * field stays because what arrives here one day will arrive as text,
     * and it must arrive as a quotation rather than as a term.
     */
    agentSaid: null,
  });

  if (!prepared.ok) {
    return NextResponse.json(
      { error: prepared.message, layer: prepared.code === 'quote-expired' ? 'protocol' : 'payment', code: prepared.code, retryable: prepared.code === 'quote-expired', requestKey },
      { status: 409 },
    );
  }

  /*
   * Recorded under the key, and the first row stands.
   *
   * What a retry must not do is become a second purchase, and the key is
   * what prevents that: it is derived from what the owner is buying —
   * agent, chain, escrow, provider, token, task — so a second call for the
   * same purchase cannot produce a second row, and once a row has a job no
   * further request is prepared for it at all.
   *
   * The response carries the current preparation rather than the stored
   * bytes, because a quote holds for minutes and handing back a stale
   * expiry would send an owner to approve a price that has lapsed. What
   * moves between two calls is therefore not only the signature: the price
   * is deliberately not part of the key (see `hireRequestKey`), so a retry
   * can be answered at a different number under the same key. That is the
   * point — a re-quote must not become a second purchase — but it means
   * "the same request" is a claim about the work and not about the amount.
   * So the first offer stays on the row and is reported beside the current
   * one, and an assistant that has already quoted a figure to a human can
   * see that the figure moved rather than be told it cannot have.
   */
  const write = store.recordPreparedHire({
    key: requestKey,
    agentChainId: chainId,
    agentTokenId: tokenId,
    chainId: escrowChainId,
    escrow: addresses.commerce,
    provider: quote.signer,
    token: quote.currency,
    amountRaw: quote.priceRaw,
    task: payload,
    request: JSON.stringify(prepared.prepared),
    /* Kept so the funding can be checked against it: a key reported back
       with somebody else's payment matches nothing. */
    owner: ownerAddress,
    at: new Date().toISOString(),
  });
  const held = write === 'kept' ? store.preparedHire(requestKey) : null;

  return NextResponse.json({
    requestKey,
    state: 'unsigned-awaiting-owner-approval',
    prepared: prepared.prepared,
    firstPrepared: write === 'recorded',
    /* When this purchase was first prepared, where it was prepared before,
       and what it was priced at then. The amount is reported because it is
       the one material term the key does not hold: a retry answered at a
       different number is still this purchase, and the owner has to be
       shown the number they are actually approving. */
    ...(held
      ? {
          firstPreparedAt: held.preparedAt,
          firstAmountRaw: held.amountRaw,
          priceChangedSinceFirstPrepared: held.amountRaw !== quote.priceRaw,
        }
      : {}),
    ...(reconciled ? { reconciled: { outcome: reconciled.outcome, retrySafe: reconciled.retrySafe, fundedAmountRaw: reconciled.fundedAmountRaw, jobId: uncertainJobId, message: reconciled.message } } : {}),
    owner: ownerAddress,
    message: decision.message,
    brief,
    observedAt: new Date().toISOString(),
  });
}
