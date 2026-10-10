import 'server-only';

import { createPublicClient, formatEther, http, isAddress, parseEther, parseUnits, type Address, type Hex } from 'viem';

import { ALTANA_NETWORK, IS_TESTNET, adminSigner, altanaClient, AltanaNotConfiguredError } from '@/lib/altana/client';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { consumeRateLimit } from '@/lib/security/rate-limit';

/**
 * Gas sponsorship: a hire is one passkey confirmation.
 *
 * The Altana relay pays gas up front and charges it back to the wallet in the
 * native token; neither relay accepts $U as a fee token (checked against
 * wallet_getCapabilities on 97 and 56 on 4 October 2026). So a passkey wallet
 * holding only $U could not fund an escrow without first visiting a BNB
 * faucet, which was the one step in the hire that was not a signature.
 *
 * Pokter now tops the wallet up itself, just before it signs, from its own
 * operator wallet. (The SDK's `fundNative` faucet was tried first: on 4
 * October 2026 the testnet relay answered it with a receipt for a zero-value
 * transaction to the zero address, and the target stayed empty, so it is not
 * used.) On mainnet the operator path opens only when 'gas-sponsor' has been
 * permitted by name. The top-up is small, rate-limited per wallet, per
 * client and in total, and refused unless the wallet already holds $U: a
 * wallet with nothing to spend has no hire to pay gas for, and the policy
 * should not be a drain.
 */

/** Enough for a hire batch and the settlement after it. */
export const GAS_TARGET = parseEther('0.004');
/** Below this, the next signature would fail on gas. Mirrors use-funding's MIN_GAS. */
export const GAS_FLOOR = parseEther('0.002');
/** The wallet must show intent: at least the smallest budget in $U. */
const INTENT_U = parseUnits('0.01', 18);

const DAY = 86_400_000;

export type SponsorOutcome =
  | { status: 'held'; balance: bigint }
  | { status: 'funded'; balance: bigint; amount: bigint; transactionHash: Hex | null }
  | { status: 'refused'; reason: string; retryAfterSeconds?: number };

/** Whether the configuration permits sponsorship at all on this network. */
export function sponsorshipConfigured(): boolean {
  if (!process.env.ALTANA_ADMIN_KEY) return false;
  if (IS_TESTNET) return true;
  return (process.env.ALTANA_MAINNET_OPERATOR_PURPOSES ?? '').split(',').map((s) => s.trim()).includes('gas-sponsor');
}

function publicClient() {
  return createPublicClient({ chain: ALTANA_NETWORK.chain, transport: http(ALTANA_NETWORK.publicRpcUrl) });
}

/**
 * The operator wallet's health, as the one question that matters: how many
 * more hires can it cover?
 *
 * Read at most once a minute. Sponsorship is offered only while the wallet
 * can pay for at least a handful more, so the readiness row never promises a
 * fee the wallet cannot meet; below LOW_WATERMARK every top-up also logs a
 * warning, which is what the operator sees first.
 */
export interface SponsorHealth {
  configured: boolean;
  available: boolean;
  chainId: number;
  address: Address | null;
  balance: bigint;
  topUpsLeft: number;
  low: boolean;
  checkedAt: string;
}

/** Fewer top-ups left than this and the wallet is reported as low. */
export const LOW_WATERMARK = 25;
/** Fewer than this and sponsorship is withdrawn rather than left to fail mid-hire. */
const RESERVE_TOP_UPS = 3;

let operatorAddress: Promise<Address> | null = null;
let healthCache: { at: number; value: SponsorHealth } | null = null;

async function operator(): Promise<Address> {
  operatorAddress ??= (async () => {
    const signer = adminSigner('gas-sponsor');
    const wallet = await altanaClient().createWallet({ signer });
    return wallet.address;
  })().catch((error) => {
    operatorAddress = null;
    throw error;
  });
  return operatorAddress;
}

export async function sponsorHealth(): Promise<SponsorHealth> {
  const now = Date.now();
  if (healthCache && now - healthCache.at < 60_000) return healthCache.value;
  const checkedAt = new Date(now).toISOString();
  const configured = sponsorshipConfigured();
  let value: SponsorHealth = { configured, available: false, chainId: ALTANA_NETWORK.chainId, address: null, balance: 0n, topUpsLeft: 0, low: true, checkedAt };
  if (configured) {
    try {
      const address = await operator();
      const balance = await publicClient().getBalance({ address });
      const topUpsLeft = Number(balance / GAS_TARGET);
      value = { configured, available: topUpsLeft >= RESERVE_TOP_UPS, chainId: ALTANA_NETWORK.chainId, address, balance, topUpsLeft, low: topUpsLeft < LOW_WATERMARK, checkedAt };
    } catch (error) {
      console.warn('[sponsor] could not read the operator wallet:', (error as Error).message);
    }
  }
  healthCache = { at: now, value };
  return value;
}

/** Whether a hire here can be one signature right now. */
export async function sponsorshipAvailable(): Promise<boolean> {
  return (await sponsorHealth()).available;
}

async function topUp(address: Address, amount: bigint): Promise<Hex | null> {
  const signer = adminSigner('gas-sponsor');
  const from = await operator();
  const result = await altanaClient().execute({ wallet: { address: from }, signer, calls: [{ to: address, value: amount }] });
  return (result as { transactionHash?: Hex }).transactionHash ?? null;
}

export async function sponsorGas(rawAddress: string, clientKey: string): Promise<SponsorOutcome> {
  if (!isAddress(rawAddress)) return { status: 'refused', reason: 'Not a wallet address.' };
  const address = rawAddress as Address;
  const health = await sponsorHealth();
  if (!health.configured) return { status: 'refused', reason: 'Gas sponsorship is not enabled on this network.' };
  if (!health.available) {
    console.warn(`[sponsor] operator wallet ${health.address} holds ${formatEther(health.balance)} BNB: sponsorship withdrawn.`);
    return { status: 'refused', reason: 'Pokter cannot cover the network fee right now.' };
  }

  const chain = publicClient();
  const balance = await chain.getBalance({ address });
  if (balance >= GAS_FLOOR) return { status: 'held', balance };

  /*
   * A new passkey wallet has no code yet: its EIP-7702 upgrade is
   * counterfactual and lands with its first transaction, which is exactly
   * the one sponsorship pays for. So no code is allowed, as is a 7702
   * delegation designator (0xef0100…). Any other contract code is refused:
   * a contract is never a buyer's passkey wallet. The $U holding rule and
   * persistent per-wallet, per-client and daily caps below remain the
   * abuse limits, and mainnet sponsorship stays off unless explicitly
   * enabled.
   */
  const code = await chain.getCode({ address }).catch(() => undefined);
  if (code && code !== '0x' && !code.toLowerCase().startsWith('0xef0100')) {
    return { status: 'refused', reason: 'Pokter covers gas for passkey wallets only.' };
  }

  const { paymentToken } = correctedErc8183Addresses(ALTANA_NETWORK.chainId);
  const balances = await altanaClient().balances({ wallet: address, tokens: [paymentToken] });
  const held = balances.tokens?.[0];
  if (!held?.ok || held.raw < INTENT_U) {
    return { status: 'refused', reason: 'Pokter covers gas for wallets that already hold $U for a job. Get some $U first.' };
  }

  for (const [key, limit] of [
    [`sponsor:wallet:${address.toLowerCase()}`, 2],
    [`sponsor:client:${clientKey}`, 6],
    ['sponsor:all', 400],
  ] as const) {
    const rate = consumeRateLimit(key, { limit, windowMs: DAY });
    if (!rate.allowed) {
      return { status: 'refused', reason: 'Gas sponsorship limit reached for today.', retryAfterSeconds: rate.retryAfterSeconds };
    }
  }

  const amount = GAS_TARGET - balance;
  try {
    const transactionHash = await topUp(address, amount);
    healthCache = null;
    if (health.low) {
      console.warn(`[sponsor] operator wallet ${health.address} is low: about ${health.topUpsLeft - 1} top-ups left (${formatEther(health.balance - amount)} BNB). Refill it.`);
    }
    return { status: 'funded', balance, amount, transactionHash };
  } catch (error) {
    if (error instanceof AltanaNotConfiguredError) return { status: 'refused', reason: error.message };
    return { status: 'refused', reason: 'The network fee could not be covered just now. You can still add BNB yourself.' };
  }
}
