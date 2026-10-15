/**
 * Whether an agent that says it takes x402 payments can be paid.
 *
 * `x402Support: true` is a bare boolean in the ERC-8004 registration file.
 * 79,907 agents on BNB Chain mainnet carry it. The schema has no field for
 * where to pay — the `services` array of a declaring agent holds MCP, A2A,
 * web, twitter, telegram, discord, OASF and nothing that takes money — so
 * the claim arrives with no address attached.
 *
 * x402 is an HTTP convention, so the remaining possibility is that one of
 * the endpoints an agent does publish answers `402` with its terms. Of 200
 * declaring agents sampled, 47 publish an https endpoint; all 47 answered,
 * and none asked to be paid.
 *
 * That is a statement about the endpoints these agents publish, which is
 * the whole of what they publish. There is no other door to try.
 *
 * Pokter has been repeating that flag to buyers as "x402 supported", which
 * is the same mistake it exists to catch everywhere else: a capability
 * asserted by the party selling it, forwarded untested. This checks it the
 * only way the protocol allows — call the endpoint and see whether payment
 * is actually demanded — and reports what came back, including that
 * nothing did.
 *
 * It never pays. Observing that a price is demanded is the measurement;
 * settling it is a different act with a different risk, and a marketplace
 * should not spend money to satisfy its own curiosity.
 *
 * An experiment, not an adapter: no route calls it yet, and Pokter neither
 * pays nor reads x402 payments. A 402 is a statement of terms, never proof
 * that anyone has paid or that paying buys useful work. Whoever wires it
 * into a route must pass the guarded, DNS-pinned fetcher (`fetchImpl` has
 * no default for that reason).
 */

export type X402Observation =
  /** Answered 402 and named at least one payment option. Payable in principle. */
  | 'demands-payment'
  /** Answered 402 with nothing a payer could act on. */
  | 'malformed-challenge'
  /** Answered, and never asked to be paid. */
  | 'no-payment-demanded'
  /** Declared x402 and published no endpoint to try. */
  | 'no-endpoint'
  /** The endpoint could not be reached. Not a finding about x402. */
  | 'unreachable';

export interface X402Result {
  observation: X402Observation;
  /** HTTP status seen, when there was one. */
  status: number | null;
  /** Payment options the challenge offered, when it was well formed. */
  options: number;
  /** One sentence a reader can act on. */
  detail: string;
}

/**
 * The payment options a payer could act on.
 *
 * Version 1 puts the challenge in the body; version 2 in a base64 JSON
 * `PAYMENT-REQUIRED` header, with the amount as `amount` rather than
 * `maxAmountRequired`. An option counts only with a scheme, a network,
 * an amount and somewhere to pay; a declared version other than 1 or 2 is
 * one this reader does not know, and nothing in it is counted.
 */
function paymentOptions(challenge: unknown): number {
  if (!challenge || typeof challenge !== 'object') return 0;
  const { x402Version, accepts } = challenge as { x402Version?: unknown; accepts?: unknown };
  if (x402Version !== undefined && x402Version !== 1 && x402Version !== 2) return 0;
  if (!Array.isArray(accepts)) return 0;
  return accepts.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const o = entry as Record<string, unknown>;
    const amount = o.amount ?? o.maxAmountRequired;
    return typeof o.scheme === 'string' && typeof o.network === 'string' && typeof o.payTo === 'string' && (typeof amount === 'string' || typeof amount === 'number');
  }).length;
}

/** A version 2 challenge, from its header. Null when absent or unreadable. */
export function challengeFromHeader(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export function readX402Response(status: number, body: unknown): X402Result {
  if (status !== 402) {
    return {
      observation: 'no-payment-demanded',
      status,
      options: 0,
      detail: `The endpoint answered ${status} and did not ask to be paid. An agent that takes x402 payments answers 402 with its terms.`,
    };
  }
  const options = paymentOptions(body);
  if (options === 0) {
    return {
      observation: 'malformed-challenge',
      status,
      options: 0,
      detail:
        'The endpoint answered 402 without a readable payment option (scheme, network, amount and payee, in a known x402 version), so there is nothing a payer could act on.',
    };
  }
  return {
    observation: 'demands-payment',
    status,
    options,
    detail: `The endpoint answered 402 and offered ${options} payment option${options === 1 ? '' : 's'}. That states its terms; it does not show that anyone has paid or what payment buys.`,
  };
}

export const NO_ENDPOINT: X402Result = {
  observation: 'no-endpoint',
  status: null,
  options: 0,
  detail:
    'This agent declares x402 support and publishes no endpoint that takes payment. The registration schema carries the flag but no address for it, so the claim cannot be acted on.',
};

export function unreachable(reason: string): X402Result {
  return {
    observation: 'unreachable',
    status: null,
    options: 0,
    detail: `Pokter could not reach the endpoint to check (${reason}). That is a gap in our measurement, not a finding about the agent.`,
  };
}

/** The claim, checked. Never pays; a 402 is the whole observation. */
export async function probeX402(
  endpoint: string | null,
  fetchImpl: typeof fetch,
  timeoutMs = 8_000,
): Promise<X402Result> {
  if (!endpoint || !endpoint.startsWith('https://')) return NO_ENDPOINT;
  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      // A redirect could lead anywhere; the guarded fetchers refuse them too.
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 402) {
      await response.body?.cancel().catch(() => undefined);
      return readX402Response(response.status, null);
    }
    const header = challengeFromHeader(response.headers.get('payment-required'));
    const body = header ?? (await response.json().catch(() => null));
    return readX402Response(response.status, body);
  } catch (reason) {
    return unreachable((reason as Error)?.name ?? 'no answer');
  }
}
