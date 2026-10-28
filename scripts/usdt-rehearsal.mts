/**
 * A USDT hire on BNB Testnet, prepared to the last step before the wallet.
 *
 * Nothing here signs a transaction, asks for an approval or broadcasts.
 * It asks Pokter Evidence's own quote handler, on a local dev server started
 * with testnet USDT turned on (REHEARSAL_ORIGIN; see docs/release/hire-tokens.md)
 * and asks for a price in USDT through `preferred_currency`,
 * so the price is signed by the agent's registered wallet exactly as the live
 * endpoint would sign it once configured, then checks that price the way the
 * quote route does, and writes down the five calls the buyer's wallet would be
 * asked to sign — each read-only simulated against the live testnet where the
 * chain allows it before the job exists.
 *
 * Run, with that server up:
 *   BUYER=0x… npx tsx scripts/usdt-rehearsal.mts
 */
import { createPublicClient, decodeFunctionData, erc20Abi, formatUnits, getAddress, http, parseAbi, type Address, type Hex } from 'viem';
import { bscTestnet } from 'viem/chains';

/* This process decides as the flag-on build would. */
const USDT = getAddress('0x337610d27c682E347C9cD60BD4b3b107C9d34dDd');
process.env.NEXT_PUBLIC_HIRE_TOKENS = `97:${USDT}`;
process.env.NEXT_PUBLIC_ESCROW_CHAINS = '97';
const ORIGIN = process.env.REHEARSAL_ORIGIN ?? 'http://localhost:4318';

const BUYER = getAddress(process.env.BUYER ?? '0xdAb12cf15F4385188bE62bda9F00877AF4C1b32f');
const AGENT = { chainId: 97, tokenId: '2599' };
const TASK = 'Report what Pokter has measured about agent 97/2618 (Brinkwatch by Pokter) on BNB Chain Testnet: calls made, calls answered, and whether its signed price can be settled by the escrow, with the source of each number.';

const { settlementHint, escrowChainForCurrency } = await import('../src/lib/network/escrow');
const { preferredCurrency } = await import('../src/lib/network/currency-preference');
const { negotiationTermsBound, quoteUsableForEscrow, verifyNegotiationSignature } = await import('../src/lib/erc8183/negotiation');
const { buildTokenHireCalls, COMMERCE_TOKEN_ABI } = await import('../src/lib/erc8183/hire-calls');
const { checkPurchaseIntent } = await import('../src/lib/hire/purchase-intent');
const { jobLifetimeSeconds } = await import('../src/lib/erc8183/deadline');
const { encodePokterJobEnvelope } = await import('../src/lib/erc8183/job-envelope');

const read = createPublicClient({ chain: bscTestnet, transport: http('https://bsc-testnet-rpc.publicnode.com') });
/* The testnet deployment, as `erc8183Addresses(97)` in SDK 0.9 lists it (the SDK cannot load in this runner). */
const addresses = {
  commerce: getAddress('0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE'),
  router: getAddress('0xD7d36D66d2F1B608A0F943f722D27e3744f66F25'),
  policy: getAddress('0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA'),
  paymentToken: getAddress('0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565'),
};
const out: string[] = [];
const log = (s: string) => {
  out.push(s);
  console.log(s);
};

/*
 * 1. The quote, from the agent's own handler, asked the way Pokter asks: the
 * buyer's preferred currency rides in the settlement hint, and the agent signs
 * a fresh quote in it. Nothing converts a price after it is signed.
 */
const preference = preferredCurrency(97, USDT);
if (!preference) throw new Error('USDT is not offered on 97 in this process; check NEXT_PUBLIC_HIRE_TOKENS.');
const hint = settlementHint({ chain_id: 97 }, undefined, undefined, preference);
const reply = await fetch(new Request(`${ORIGIN}/api/evidence/a2a?chain=97`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'message/send', params: { message: { role: 'user', messageId: 'rehearsal', parts: [{ kind: 'data', data: { skill: 'negotiate', task_description: TASK, ...hint } }] } } }),
}));
const body = (await reply.json()) as { result?: Record<string, unknown>; error?: { message: string } };
if (!body.result) throw new Error(`The agent did not quote: ${body.error?.message ?? reply.status}`);
const envelope = (body.result.parts as Array<{ data?: Record<string, unknown> }> | undefined)?.find((p) => p.data)?.data ?? body.result;
const terms = ((envelope.response as Record<string, unknown>)?.terms ?? {}) as { price: string; currency: string };
log(`Quote: ${formatUnits(BigInt(terms.price), preference.decimals)} in ${terms.currency}, signed for escrow ${String(envelope.verifying_contract)} on chain ${String(envelope.chain_id)}`);

/* 2. Checked as the quote route checks it. */
const detail = (await fetch(`https://pokter.xyz/api/v1/agents/${AGENT.chainId}/${AGENT.tokenId}`).then((r) => r.json())) as Record<string, unknown>;
const registryWallet = JSON.stringify(detail).match(/"(?:agentWallet|wallet)"\s*:\s*\{?[^}]*?"value"\s*:\s*"(0x[0-9a-fA-F]{40})"/)?.[1] ?? '0x93847647d7eb72a69E162117df6a8697dF53EDda';
const signer = await verifyNegotiationSignature({ negotiationHash: String(envelope.negotiation_hash), providerSignature: String(envelope.provider_sig), expectedProvider: registryWallet });
log(`Signature recovers to the registered wallet ${signer}`);
if (!negotiationTermsBound(envelope, TASK)) throw new Error('The signed hash does not cover these terms.');
log('The hash covers this task, price, currency, expiry and escrow binding');
const escrowChainId = escrowChainForCurrency(terms.currency);
if (escrowChainId !== 97) throw new Error(`USDT on testnet should settle on 97, got ${escrowChainId}`);
const usable = quoteUsableForEscrow({ expiresAt: Number(envelope.quote_expires_at), domain: { chainId: Number(envelope.chain_id), verifyingContract: getAddress(String(envelope.verifying_contract)) } }, 97, new Date(), addresses.commerce);
if (!usable.usable) throw new Error(usable.reason);
log(`Usable on the testnet escrow until ${new Date(Number(envelope.quote_expires_at) * 1000).toISOString()}`);

/* 3. The escrow and the buyer, read-only. */
const supported = await read.readContract({ address: addresses.commerce as Address, abi: COMMERCE_TOKEN_ABI, functionName: 'isPaymentTokenSupported', args: [USDT] });
const [held, allowance, gas, counter] = await Promise.all([
  read.readContract({ address: USDT, abi: erc20Abi, functionName: 'balanceOf', args: [BUYER] }),
  read.readContract({ address: USDT, abi: erc20Abi, functionName: 'allowance', args: [BUYER, addresses.commerce as Address] }),
  read.getBalance({ address: BUYER }),
  read.readContract({ address: addresses.commerce as Address, abi: parseAbi(['function jobCounter() view returns (uint256)']), functionName: 'jobCounter' }),
]);
log(`Escrow accepts USDT: ${supported}`);
log(`Buyer ${BUYER}: ${formatUnits(held, 18)} USDT, allowance ${formatUnits(allowance, 18)}, ${formatUnits(gas, 18)} tBNB`);

/* 4. The exact calls, for exactly the signed amount. */
const disputeWindow = Number(await read.readContract({ address: addresses.policy as Address, abi: parseAbi(['function disputeWindow() view returns (uint64)']), functionName: 'disputeWindow' }));
const expiredAt = BigInt(Math.floor(Date.now() / 1000) + jobLifetimeSeconds(disputeWindow, 24 * 3600));
const description = encodePokterJobEnvelope({ identityChainId: 97, agentTokenId: AGENT.tokenId, agentName: 'Pokter Evidence', category: 'unclassified', provider: signer, task: TASK, quote: { negotiationHash: String(envelope.negotiation_hash), providerSignature: String(envelope.provider_sig), priceRaw: terms.price, expiresAt: Number(envelope.quote_expires_at), domain: { chainId: 97, verifyingContract: getAddress(String(envelope.verifying_contract)) } } as never });
const budget = BigInt(terms.price);
const intent = { provider: signer, task: TASK, amountRaw: terms.price, currency: getAddress(terms.currency), chainId: 97, verifyingContract: getAddress(String(envelope.verifying_contract)), expiresAt: Number(envelope.quote_expires_at), negotiationHash: String(envelope.negotiation_hash) };
const check = checkPurchaseIntent(intent, { provider: signer, task: TASK, chainId: 97, commerce: addresses.commerce, paymentToken: USDT, amountRaw: budget.toString() });
if (!check.ok) throw new Error(check.reason);
log('Purchase intent: the calls fund exactly the signed amount in the signed token');
const calls = buildTokenHireCalls({ chainId: 97, addresses: addresses as never, jobId: counter + 1n, provider: signer, description, budget, expiredAt, token: USDT });
const names = ['create the job in USDT', 'register it with the dispute policy', 'set the budget', 'approve exactly the budget in USDT', 'fund it'];
for (const [i, call] of calls.entries()) {
  const abi = i === 3 ? erc20Abi : i === 1 ? parseAbi(['function registerJob(uint256,address)']) : COMMERCE_TOKEN_ABI;
  const decoded = decodeFunctionData({ abi: abi as never, data: call.data }) as { functionName: string; args: readonly unknown[] };
  log(`  ${i + 1}. ${names[i]}: ${call.to} ${decoded.functionName}(${decoded.args.map((a) => (typeof a === 'string' && a.length > 80 ? `${a.slice(0, 40)}…` : String(a))).join(', ')})`);
}

/* 5. What can be simulated before the job exists: creating it, and the approval. */
for (const [i, call] of [[0, calls[0]], [3, calls[3]]] as const) {
  try {
    await read.call({ account: BUYER, to: call.to, data: call.data as Hex });
    log(`Simulated call ${i + 1} from the buyer against live testnet: it would succeed (nothing sent)`);
  } catch (error) {
    log(`Simulated call ${i + 1}: would revert — ${(error as Error).message.split('\n')[0]}`);
  }
}
log(held >= budget ? 'The buyer holds enough USDT for this hire.' : `The buyer needs ${formatUnits(budget - held, 18)} more testnet USDT before funding.`);
log('STOPPED before any approval, signature or broadcast.');
