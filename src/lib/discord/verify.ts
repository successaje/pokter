import 'server-only';

import { createPublicKey, verify, type KeyObject } from 'node:crypto';

/**
 * Discord signs every interaction and expects an unsigned one to be refused.
 *
 * The endpoint is validated by Discord sending both a correctly signed ping and
 * deliberately broken requests; an endpoint that answers the broken ones is
 * rejected. So this fails closed on a missing key, a malformed header or a
 * stale timestamp, and the route returns 401 rather than an empty reply.
 */

/** Node accepts an Ed25519 public key only inside its SPKI wrapper. */
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const MAX_SKEW_SECONDS = 300;

let cached: { hex: string; key: KeyObject } | null = null;

function applicationKey(): KeyObject | null {
  const hex = process.env.POKTER_DISCORD_PUBLIC_KEY?.trim().toLowerCase();
  if (!hex || !/^[0-9a-f]{64}$/.test(hex)) return null;
  if (cached?.hex === hex) return cached.key;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(hex, 'hex')]), format: 'der', type: 'spki' });
    cached = { hex, key };
    return key;
  } catch { return null; }
}

/** The signature covers the timestamp and the raw body, so both arrive unparsed. */
export function verifyDiscordRequest(input: {
  body: string;
  signature: string | null;
  timestamp: string | null;
  now?: number;
}): boolean {
  const key = applicationKey();
  if (!key || !input.signature || !input.timestamp) return false;
  if (!/^[0-9a-fA-F]{128}$/.test(input.signature) || !/^\d{1,12}$/.test(input.timestamp)) return false;
  // A replayed interaction cannot pay or hire, but it can repeat a model call.
  if (Math.abs((input.now ?? Date.now()) / 1_000 - Number(input.timestamp)) > MAX_SKEW_SECONDS) return false;
  try {
    return verify(null, Buffer.from(input.timestamp + input.body, 'utf8'), key, Buffer.from(input.signature, 'hex'));
  } catch { return false; }
}
