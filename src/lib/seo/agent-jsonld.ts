import { paymentTokenAt, settlementChainOf } from '@/lib/network/tokens';

/**
 * Structured data for one agent's page.
 *
 * The site-level graph says Pokter exists; nothing said what any listing
 * is, so the pages carrying every measured figure were the ones machines
 * could read least. This emits a `Service` per agent, with its registry
 * identity, its signed price when an escrow can actually settle it, and
 * the probe record as named properties.
 *
 * Two things are deliberately absent.
 *
 * There is no `aggregateRating`. Probe replies are an availability
 * measurement, not opinions, and dressing them as stars would publish in a
 * machine-readable field exactly the conflation the rest of the product
 * refuses — a measurement restated as a verdict somebody else supposedly
 * gave.
 *
 * There is no `offers` without a payable quote. A price Pokter cannot
 * settle is not an offer: the agent may have signed it, but nothing here
 * can be paid against it, and `hireBlocker` on the detail endpoint is
 * where that distinction is explained rather than implied.
 */
export interface AgentJsonLdInput {
  name: string;
  summary: string;
  chainId: number;
  tokenId: string;
  owner: string;
  imageUrl: string | null;
  categoryLabel: string | null;
  /** Answered over total, from Pokter's scheduled probes. */
  record: { totalProbes: number; totalAnswered: number };
  /** Null when the agent has never signed one Pokter could read. */
  quote: { priceU: number; currency: string; expiresAt: string | null; payable: boolean | null } | null;
}

export function agentJsonLd(base: string, a: AgentJsonLdInput): Record<string, unknown> {
  const url = `${base}/agents/${a.chainId}/${a.tokenId}`;

  const properties: Array<Record<string, unknown>> = [
    { '@type': 'PropertyValue', name: 'Registry', value: `ERC-8004 #${a.tokenId} on chain ${a.chainId}` },
  ];
  if (a.record.totalProbes > 0) {
    properties.push({
      '@type': 'PropertyValue',
      name: 'Probes answered',
      value: `${a.record.totalAnswered} of ${a.record.totalProbes}`,
      description: 'Measured by Pokter on a schedule. Not a rating.',
    });
  }

  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${url}#agent`,
    name: a.name,
    description: a.summary,
    url,
    serviceType: a.categoryLabel ?? undefined,
    identifier: `erc8004:${a.chainId}:${a.tokenId}`,
    provider: {
      '@type': 'Organization',
      identifier: a.owner,
      url: `${base}/builders/${a.owner}`,
    },
    additionalProperty: properties,
  };

  if (a.imageUrl) node.image = a.imageUrl;

  /*
   * An expired quote still describes the price: the signature was real and
   * a hire asks for a fresh one. `priceValidUntil` is the honest way to say
   * so, rather than dropping the only price the agent has ever named.
   */
  /*
   * `priceCurrency` is the registry's symbol for the token, found on the
   * chain the currency belongs to. A token Pokter has not verified gets no
   * offer at all: its symbol would be the contract's own claim (or a
   * shortened address), and an offer in an unnamed currency is a price in
   * nothing a reader can check.
   */
  const settles = a.quote ? settlementChainOf(a.quote.currency) : null;
  const token = a.quote && settles !== null ? paymentTokenAt(settles, a.quote.currency) : null;
  if (a.quote && a.quote.payable === true && token) {
    const offer: Record<string, unknown> = {
      '@type': 'Offer',
      price: a.quote.priceU,
      priceCurrency: token.symbol,
      availability: 'https://schema.org/InStock',
      url,
    };
    if (a.quote.expiresAt) offer.priceValidUntil = a.quote.expiresAt.slice(0, 10);
    node.offers = offer;
  }

  return node;
}
