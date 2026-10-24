import { getAddress, isAddress, recoverTypedDataAddress, type Address, type Hex } from 'viem';

import { ESCROW_PAYMENT_TOKEN } from '@/lib/network/escrow';

/**
 * Pay-per-call over x402, for exactly one combination: the `exact` scheme,
 * an EIP-3009 `TransferWithAuthorization`, in U, on BNB Chain mainnet.
 *
 * One combination on purpose. Both BNB Chain sellers that publish x402 on
 * 24 October 2026 (Mandate Guard-1, Brain on BNB) offer `exact` + EIP-3009
 * and settle it themselves; Brain on BNB offers it in U, Pokter's own
 * payment token. U implements EIP-3009 (`authorizationState` answers) and
 * its EIP-712 domain was checked against `DOMAIN_SEPARATOR()` on chain:
 * "United Stables", version "1". That domain is pinned here, never taken
 * from the seller's challenge: a seller that names another domain gets a
 * signature the token will not accept, or one for something else.
 *
 * Pure: parsing, choosing, comparing and building what the wallet signs.
 * Nothing here pays, signs or sends.
 */

export const X402_NETWORK = 'eip155:56';
export const X402_CHAIN_ID = 56;
export const X402_ASSET: Address = getAddress(ESCROW_PAYMENT_TOKEN[56]);
export const X402_DOMAIN = { name: 'United Stables', version: '1', chainId: X402_CHAIN_ID, verifyingContract: X402_ASSET } as const;
/** The longest a signed authorization stays valid, whatever the seller asks. */
export const X402_MAX_VALIDITY_SECONDS = 300;

/** What the buyer is shown and agrees to, and what a later challenge must still match. */
export interface X402Terms {
  /** The URL that is called. */
  endpoint: string;
  version: 1 | 2;
  network: typeof X402_NETWORK;
  asset: Address;
  payTo: Address;
  /** Raw token units, as the seller asked. */
  amountRaw: string;
  maxTimeoutSeconds: number;
  resource: string | null;
  description: string | null;
  /** The chosen requirement exactly as the seller sent it, echoed back in a v2 payload. */
  accepted: Record<string, unknown>;
}

export type X402Choice =
  | { ok: true; terms: X402Terms }
  | { ok: false; reason: string; offered: Array<{ network: string; asset: string; method: string }> };

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function methodOf(option: Record<string, unknown>): string {
  const extra = object(option.extra) ?? {};
  const method = extra.assetTransferMethod ?? extra.transferMethod;
  /* The spec's default when unnamed. */
  return typeof method === 'string' && method ? method : 'eip3009';
}

/** The one requirement Pokter can pay, from a seller's challenge, or why there is none. */
export function chooseX402Option(endpoint: string, challenge: unknown): X402Choice {
  const root = object(challenge);
  const version = root?.x402Version;
  const accepts = Array.isArray(root?.accepts) ? (root!.accepts as unknown[]).map(object).filter((o): o is Record<string, unknown> => o !== null) : [];
  const offered = accepts.map((o) => ({ network: String(o.network ?? ''), asset: String(o.asset ?? ''), method: methodOf(o) }));
  if (version !== 1 && version !== 2) return { ok: false, reason: 'The challenge does not name an x402 version Pokter reads (1 or 2).', offered };
  const option = accepts.find(
    (o) =>
      o.scheme === 'exact' &&
      o.network === X402_NETWORK &&
      typeof o.asset === 'string' &&
      isAddress(o.asset) &&
      getAddress(o.asset) === X402_ASSET &&
      methodOf(o) === 'eip3009',
  );
  if (!option) {
    return { ok: false, reason: 'This seller does not offer the one combination Pokter supports: the exact scheme, paid in U on BNB Chain by EIP-3009.', offered };
  }
  const extra = object(option.extra) ?? {};
  if ((extra.name !== undefined && extra.name !== X402_DOMAIN.name) || (extra.version !== undefined && String(extra.version) !== X402_DOMAIN.version)) {
    return { ok: false, reason: `The seller names a signing domain (“${String(extra.name)}”, version ${String(extra.version)}) that is not U’s on BNB Chain, so a signature would not be valid.`, offered };
  }
  const amount = option.amount ?? option.maxAmountRequired;
  const amountRaw = typeof amount === 'string' || typeof amount === 'number' ? String(amount) : '';
  if (!/^[1-9]\d{0,36}$/.test(amountRaw)) return { ok: false, reason: 'The seller states no positive whole amount.', offered };
  if (typeof option.payTo !== 'string' || !isAddress(option.payTo)) return { ok: false, reason: 'The seller names no valid recipient.', offered };
  const timeout = Number(option.maxTimeoutSeconds);
  const resource = typeof option.resource === 'string' ? option.resource : (object(root?.resource)?.url as string | undefined) ?? null;
  return {
    ok: true,
    terms: {
      endpoint,
      version,
      network: X402_NETWORK,
      asset: X402_ASSET,
      payTo: getAddress(option.payTo),
      amountRaw,
      maxTimeoutSeconds: Number.isFinite(timeout) && timeout > 0 ? Math.floor(timeout) : 60,
      resource,
      description: typeof option.description === 'string' ? option.description.slice(0, 500) : null,
      accepted: option,
    },
  };
}

/**
 * What changed between the terms the buyer agreed to and a fresh
 * challenge, or null when nothing that matters did. A changed recipient,
 * price, token or network is never paid without the buyer seeing it again.
 */
export function changedTerms(agreed: X402Terms, fresh: X402Terms): string | null {
  if (fresh.payTo !== agreed.payTo) return `The recipient changed from ${agreed.payTo} to ${fresh.payTo}.`;
  if (fresh.amountRaw !== agreed.amountRaw) return `The price changed from ${agreed.amountRaw} to ${fresh.amountRaw} raw units.`;
  if (fresh.asset !== agreed.asset || fresh.network !== agreed.network) return 'The token or network changed.';
  if (fresh.endpoint !== agreed.endpoint) return 'The endpoint changed.';
  return null;
}

export interface X402Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

const TRANSFER_WITH_AUTHORIZATION = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
  { name: 'nonce', type: 'bytes32' },
] as const;

/**
 * What the buyer's own wallet signs: U's `TransferWithAuthorization`, to the
 * agreed recipient, for the agreed amount, valid for at most five minutes.
 * `authorization` is the same values as the header carries them (decimal
 * strings); `typedData` is what a wallet's `signTypedData` takes.
 */
export function authorizationTypedData(terms: X402Terms, from: Address, nowSeconds: number, nonce: Hex) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(nonce)) throw new Error('INVALID_NONCE');
  const validity = Math.min(terms.maxTimeoutSeconds, X402_MAX_VALIDITY_SECONDS);
  const authorization: X402Authorization = {
    from: getAddress(from),
    to: terms.payTo,
    value: terms.amountRaw,
    /* A little in the past, so a seller whose clock runs behind does not see it as not yet valid. */
    validAfter: String(Math.max(0, nowSeconds - 60)),
    validBefore: String(nowSeconds + validity),
    nonce,
  };
  return {
    authorization,
    typedData: {
      domain: X402_DOMAIN,
      types: { TransferWithAuthorization: TRANSFER_WITH_AUTHORIZATION },
      primaryType: 'TransferWithAuthorization' as const,
      message: {
        from: authorization.from,
        to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce,
      },
    },
  };
}

/** The request header carrying the signed authorization, in the version the seller spoke. */
export function paymentHeader(terms: X402Terms, signature: Hex, authorization: X402Authorization): { name: 'PAYMENT-SIGNATURE' | 'X-PAYMENT'; value: string } {
  const payload = { signature, authorization };
  const body =
    terms.version === 2
      ? { x402Version: 2, ...(terms.resource ? { resource: { url: terms.resource } } : {}), accepted: terms.accepted, payload }
      : { x402Version: 1, scheme: 'exact', network: terms.network, payload };
  return { name: terms.version === 2 ? 'PAYMENT-SIGNATURE' : 'X-PAYMENT', value: toBase64(JSON.stringify(body)) };
}

/*
 * UTF-8 base64 that runs the same in the browser and on the server: the
 * header is built in the buyer's browser, where `Buffer` is not guaranteed.
 */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): string {
  const binary = atob(value);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/** A payment header read back: what it authorises, and the envelope it came in, so the server checks both before sending anything. */
export function readPaymentHeader(value: string): { signature: Hex; authorization: X402Authorization; envelope: { x402Version: unknown; scheme: unknown; network: unknown; accepted: Record<string, unknown> | null } } | null {
  try {
    const parsed = object(JSON.parse(fromBase64(value)));
    const payload = object(parsed?.payload);
    const auth = object(payload?.authorization);
    const signature = payload?.signature;
    if (!auth || typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return null;
    const fields = ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce'] as const;
    if (fields.some((f) => typeof auth[f] !== 'string')) return null;
    if (!isAddress(auth.from as string) || !isAddress(auth.to as string) || !/^0x[0-9a-fA-F]{64}$/.test(auth.nonce as string)) return null;
    /* Whole numbers only: `Number('abc')` is NaN, and NaN passes every comparison by failing it. */
    if (!(['value', 'validAfter', 'validBefore'] as const).every((f) => /^\d{1,78}$/.test(auth[f] as string))) return null;
    return {
      envelope: { x402Version: parsed?.x402Version, scheme: parsed?.scheme, network: parsed?.network, accepted: object(parsed?.accepted) },
      signature: signature as Hex,
      authorization: {
        from: getAddress(auth.from as string),
        to: getAddress(auth.to as string),
        value: auth.value as string,
        validAfter: auth.validAfter as string,
        validBefore: auth.validBefore as string,
        nonce: auth.nonce as Hex,
      },
    };
  } catch {
    return null;
  }
}

/** Why a signed authorization must not be sent for these terms, or null when it matches them. */
export function authorizationMismatch(terms: X402Terms, authorization: X402Authorization, nowSeconds: number): string | null {
  if (authorization.to !== terms.payTo) return 'The authorization pays someone other than the agreed recipient.';
  if (authorization.value !== terms.amountRaw) return 'The authorization is for a different amount than agreed.';
  const before = BigInt(authorization.validBefore);
  const now = BigInt(nowSeconds);
  if (before <= now) return 'The authorization has expired. Nothing was sent; sign again.';
  if (before - now > BigInt(X402_MAX_VALIDITY_SECONDS + 5)) return 'The authorization stays valid longer than Pokter allows.';
  if (BigInt(authorization.validAfter) > now) return 'The authorization is not valid yet.';
  return null;
}

/**
 * Why a payment header must not be forwarded, or null when it is the
 * buyer's own signature over exactly these terms in the seller's envelope.
 * The signature is recovered under the pinned domain and must be `from`:
 * Pokter forwards nothing it has not verified, so it is never the relay
 * for junk signatures or for payments made up in someone else's name.
 */
export async function paymentHeaderProblem(
  terms: X402Terms,
  read: NonNullable<ReturnType<typeof readPaymentHeader>>,
  nowSeconds: number,
): Promise<string | null> {
  const mismatch = authorizationMismatch(terms, read.authorization, nowSeconds);
  if (mismatch) return mismatch;
  const { envelope } = read;
  if (envelope.x402Version !== terms.version) return 'The payment names a different x402 version than the seller asked for.';
  if (terms.version === 1 && (envelope.scheme !== 'exact' || envelope.network !== terms.network)) return 'The payment names a different scheme or network than the seller asked for.';
  if (terms.version === 2) {
    const accepted = envelope.accepted;
    if (!accepted || accepted.network !== terms.network || typeof accepted.asset !== 'string' || !isAddress(accepted.asset) || getAddress(accepted.asset) !== terms.asset || accepted.payTo !== terms.accepted.payTo) {
      return 'The payment names different terms than the seller asked for.';
    }
  }
  let signer: Address;
  try {
    const { typedData } = authorizationTypedData(terms, read.authorization.from, 0, read.authorization.nonce);
    signer = await recoverTypedDataAddress({
      ...typedData,
      message: {
        ...typedData.message,
        validAfter: BigInt(read.authorization.validAfter),
        validBefore: BigInt(read.authorization.validBefore),
      },
      signature: read.signature,
    });
  } catch {
    return 'The payment signature could not be checked.';
  }
  if (signer !== read.authorization.from) return 'The payment is not signed by the wallet it names.';
  return null;
}
