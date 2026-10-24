import 'server-only';

import { assertPublicEndpoint, withPublicEndpoint } from '@/lib/proof/prober';
import { registryTokenUri } from '@/lib/registry/onchain';

import { x402EndpointFromRegistration, registrationFromDataUri } from './endpoint';
import { chooseX402Option, X402_CHAIN_ID, type X402Choice } from './exact';
import { X402NotSentError, type SentResponse } from './call';
import { X402_RESPONSE_LIMIT } from './receipts';

/*
 * Every request to a seller goes through the same guard probes use: https
 * only, DNS pinned, private networks refused, no redirects. A seller's
 * endpoint is whatever its owner registered, which is not Pokter's to trust.
 */

async function boundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > X402_RESPONSE_LIMIT) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The x402 endpoint the agent registered, on BNB Chain only; null when it registered none. */
export async function x402EndpointFor(chainId: number, tokenId: string): Promise<string | null> {
  if (chainId !== X402_CHAIN_ID || !/^\d+$/.test(tokenId)) return null;
  const uri = await registryTokenUri(chainId, tokenId);
  if (!uri) return null;
  const inline = registrationFromDataUri(uri);
  if (inline) return x402EndpointFromRegistration(inline);
  if (!uri.startsWith('https://')) return null;
  return withPublicEndpoint(uri, async (service) => {
    const response = await service.fetch({ headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    try {
      return x402EndpointFromRegistration(JSON.parse(await boundedText(response)));
    } catch {
      return null;
    }
  });
}

/**
 * Ask the seller what a call costs, without paying: the same POST the paid
 * call will make, with no payment, answered with 402. The same method on
 * purpose, so the terms shown are the terms of the call that is paid; a
 * seller that only takes payment some other way is reported, not guessed at.
 */
export async function readX402Terms(endpoint: string): Promise<X402Choice> {
  return withPublicEndpoint(endpoint, async (service) => {
    const response = await service.fetch({ method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: '{}', redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (response.status === 405) {
      await response.body?.cancel();
      return { ok: false, reason: 'This seller takes payment on a GET request, and Pokter only sends paid calls as POST.', offered: [] };
    }
    if (response.status !== 402) {
      await response.body?.cancel();
      return { ok: false, reason: `The endpoint did not ask for payment (HTTP ${response.status}).`, offered: [] };
    }
    const header = response.headers.get('payment-required');
    let challenge: unknown = null;
    if (header) {
      try {
        challenge = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
      } catch {
        challenge = null;
      }
    }
    const body = await boundedText(response);
    if (!challenge) {
      try {
        challenge = JSON.parse(body);
      } catch {
        return { ok: false, reason: 'The seller asked for payment but its terms could not be read.', offered: [] };
      }
    }
    return chooseX402Option(endpoint, challenge);
  });
}

/** Send the paid request once. Throws when no answer came back, which the caller records as unknown. */
export async function sendX402(endpoint: string, headers: Record<string, string>, body: string): Promise<SentResponse> {
  /* Resolved and checked before anything is sent; a refusal here means nothing left Pokter. */
  let service: Awaited<ReturnType<typeof assertPublicEndpoint>>;
  try {
    service = await assertPublicEndpoint(endpoint);
  } catch (error) {
    throw new X402NotSentError(error instanceof Error ? error.message.slice(0, 160) : 'the endpoint was refused');
  }
  try {
    const response = await service.fetch({ method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(60_000) });
    return { status: response.status, headers: response.headers, text: await boundedText(response) };
  } finally {
    await service.close();
  }
}
