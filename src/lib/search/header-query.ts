import { jobHref } from '@/lib/jobs/href';
import { NAME_MATCH, nameMatch } from './names';

/**
 * What a person typed into the header search, read as the thing it names.
 *
 * The header is where someone goes with a reference already in hand: an
 * agent's name from a post, "56/367904" from a link, a job number from a
 * receipt, a builder's address from the explorer. Discover reads every
 * query as a description of work, so none of those found what they named.
 * This reads the reference first, and only falls back to Discover for words.
 */
export type HeaderQuery =
  | { kind: 'empty' }
  /** "56/367904", "97:2554", "agent 56/367904": one agent on one registry. */
  | { kind: 'agent-ref'; chainId: 56 | 97; tokenId: string }
  /** "#57012", "57012", "job 57012": an agent token or a job, on either network. */
  | { kind: 'number'; value: string; job: boolean }
  /** A 0x address: a builder, or an agent's wallet. */
  | { kind: 'address'; address: string }
  | { kind: 'text'; text: string };

export function parseHeaderQuery(raw: string): HeaderQuery {
  const q = raw.trim();
  if (!q) return { kind: 'empty' };

  const ref = /^(?:agent\s+)?(56|97)\s*[/:]\s*#?(\d{1,12})$/i.exec(q);
  if (ref) return { kind: 'agent-ref', chainId: Number(ref[1]) as 56 | 97, tokenId: String(BigInt(ref[2])) };

  const number = /^(job\s*)?#?\s*(\d{1,12})$/i.exec(q);
  if (number) return { kind: 'number', value: String(BigInt(number[2])), job: Boolean(number[1]) };

  if (/^0x[0-9a-fA-F]{40}$/.test(q)) return { kind: 'address', address: q.toLowerCase() };

  return { kind: 'text', text: q };
}

export interface HeaderSuggestion {
  kind: 'agent' | 'job' | 'builder' | 'discover';
  label: string;
  /** What the row is, in a few words: network, status, why it matched. */
  detail: string;
  href: string;
}

export interface SuggestAgent {
  chainId: number;
  tokenId: string;
  name: string;
  wallet: string | null;
  owner: string;
}

export interface SuggestJob {
  jobId: string;
  chainId: number;
  status: string;
  agentName: string | null;
}

const NETWORK: Record<number, string> = { 56: 'BNB Chain', 97: 'BNB Testnet' };
const network = (chainId: number) => NETWORK[chainId] ?? `chain ${chainId}`;
const agentHref = (a: { chainId: number; tokenId: string }) => `/agents/${a.chainId}/${a.tokenId}`;
const discoverHref = (text: string) => `/discover?q=${encodeURIComponent(text)}`;
const agentLabel = (a: SuggestAgent) => a.name.trim() || `Agent #${a.tokenId}`;

/** Most suggestions shown at once: enough to choose from, few enough to read. */
export const MAX_SUGGESTIONS = 6;

/**
 * The rows for one query, best first, from what Pokter already holds.
 *
 * Nothing is invented: an agent or job is offered only when it was found.
 * The last row for words is always a Discover search, so a name that
 * matches nothing still leads somewhere, and Enter on it does the same.
 */
export function headerSuggestions(
  query: HeaderQuery,
  agents: readonly SuggestAgent[],
  jobs: readonly SuggestJob[],
): HeaderSuggestion[] {
  const agentRow = (a: SuggestAgent, why: string): HeaderSuggestion => ({
    kind: 'agent',
    label: agentLabel(a),
    detail: `Agent ${a.chainId}/${a.tokenId} · ${network(a.chainId)}${why ? ` · ${why}` : ''}`,
    href: agentHref(a),
  });
  const jobRow = (j: SuggestJob): HeaderSuggestion => ({
    kind: 'job',
    label: `Job #${j.jobId}`,
    detail: `${network(j.chainId)} · ${j.status.toLowerCase().replace(/_/g, ' ')}${j.agentName ? ` · ${j.agentName}` : ''}`,
    href: jobHref(j),
  });

  switch (query.kind) {
    case 'empty':
      return [];
    case 'agent-ref': {
      const found = agents.find((a) => a.chainId === query.chainId && a.tokenId === query.tokenId);
      /* Linked even when the catalogue does not list it: the agent page reads the registry itself. */
      return [found ? agentRow(found, '') : { kind: 'agent', label: `Agent ${query.chainId}/${query.tokenId}`, detail: network(query.chainId), href: agentHref(query) }];
    }
    case 'number': {
      const jobRows = jobs.filter((j) => j.jobId === query.value).map(jobRow);
      const agentRows = agents.filter((a) => a.tokenId === query.value).map((a) => agentRow(a, ''));
      /* "job 57012" asked for a job; a bare number is an agent first only when it is one. */
      return (query.job ? [...jobRows, ...agentRows] : [...agentRows, ...jobRows]).slice(0, MAX_SUGGESTIONS);
    }
    case 'address': {
      const byWallet = agents.filter((a) => a.wallet?.toLowerCase() === query.address).map((a) => agentRow(a, 'its wallet'));
      const owns = agents.filter((a) => a.owner.toLowerCase() === query.address);
      const builder: HeaderSuggestion = {
        kind: 'builder',
        label: `Builder ${query.address.slice(0, 6)}…${query.address.slice(-4)}`,
        detail: owns.length > 0 ? `Owns ${owns.length} listed agent${owns.length === 1 ? '' : 's'}` : 'Agents registered by this address',
        href: `/builders/${query.address}`,
      };
      return [...byWallet, builder].slice(0, MAX_SUGGESTIONS);
    }
    case 'text': {
      const ranked = agents
        .map((a) => ({ a, rank: nameMatch(a.name, query.text) }))
        .filter((r) => r.rank > NAME_MATCH.none)
        .sort((x, y) => y.rank - x.rank || x.a.name.localeCompare(y.a.name))
        .slice(0, MAX_SUGGESTIONS - 1)
        .map(({ a }) => agentRow(a, ''));
      return [...ranked, { kind: 'discover', label: `Search “${query.text}”`, detail: 'Agents for this work, on Discover', href: discoverHref(query.text) }];
    }
  }
}

/**
 * Where Enter goes before any suggestion has loaded.
 *
 * Only to places that cannot be wrong: an exact agent reference, a builder
 * address, or Discover for words. A bare number could be an agent or a job
 * on either network, so it waits for the suggestions rather than guessing.
 */
export function directHref(query: HeaderQuery): string | null {
  switch (query.kind) {
    case 'agent-ref':
      return agentHref(query);
    case 'address':
      return `/builders/${query.address}`;
    case 'text':
      return discoverHref(query.text);
    default:
      return null;
  }
}
