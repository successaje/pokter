/**
 * A query parameter this API does not have is refused, not ignored.
 *
 * `/api/v1/agents` takes its filters in the query language, so `chainId=56`
 * is not a filter it supports — and it answered `200` with every chain in
 * the list anyway. A caller reading that gets a confident answer to a
 * question nobody asked: the list looked like mainnet, was mostly testnet,
 * and three agents were read as chain 56 when they were chain 97. Refusing
 * the parameter costs one request; believing it costs the conclusions drawn
 * from it.
 *
 * This is the same rule `parseQuery` already applies inside `q` — an
 * unrecognised term is reported rather than dropped — applied to the
 * parameters around it.
 */

/**
 * What a caller probably meant, for the guesses worth guiding.
 *
 * Only parameters someone would reasonably reach for, each pointing at the
 * thing that does work. A wrong guess answered with "no such parameter" and
 * nothing else leaves them to find `is:mainnet` by reading source.
 */
const HINTS: Record<string, string> = {
  chain: 'chain is a query term: q=is:mainnet or q=is:testnet.',
  chainid: 'chain is a query term: q=is:mainnet or q=is:testnet.',
  chain_id: 'chain is a query term: q=is:mainnet or q=is:testnet.',
  network: 'chain is a query term: q=is:mainnet or q=is:testnet.',
  testnet: 'chain is a query term: q=is:mainnet or q=is:testnet.',
  search: 'free text goes in q.',
  name: 'free text goes in q.',
  query: 'free text goes in q.',
  hireable: 'q=is:hireable.',
  live: 'q=is:live.',
  page: 'paging is offset and limit.',
  per_page: 'paging is offset and limit.',
  sort: 'the order is fixed, so that paging does not repeat or skip agents.',
};

export interface UnknownParams {
  names: string[];
  message: string;
}

/**
 * The parameters a request carries that this route does not accept.
 *
 * Null when there are none. Case-insensitive on the hint lookup only: the
 * name is reported back exactly as the caller spelled it, because that is
 * the string they have to find and change.
 */
export function unknownParams(
  supplied: Iterable<string>,
  known: readonly string[],
): UnknownParams | null {
  const accepted = new Set(known);
  const names: string[] = [];
  for (const name of supplied) {
    if (accepted.has(name) || names.includes(name)) continue;
    names.push(name);
  }
  if (names.length === 0) return null;

  const hints = [...new Set(names.map((n) => HINTS[n.toLowerCase()]).filter((h): h is string => Boolean(h)))];
  const listed = names.map((n) => `\`${n}\``).join(', ');
  return {
    names,
    message: [
      `${names.length === 1 ? 'Unknown parameter' : 'Unknown parameters'}: ${listed}.`,
      `This endpoint takes ${known.map((n) => `\`${n}\``).join(', ')}.`,
      ...hints,
    ].join(' '),
  };
}
