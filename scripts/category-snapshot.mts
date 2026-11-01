/**
 * Take a snapshot of the public catalogue for the category dry run.
 *
 *   npx tsx scripts/category-snapshot.mts [--out FILE] [--site URL] [--indexer URL]
 *
 * The dry run (`scripts/category-dry-run.mts`) asks what a change to the
 * category rules would do to the agents people actually see, so it needs
 * those agents as the catalogue holds them, and the category each one is
 * shown under today. This writes that down once, so the dry run can be
 * repeated offline against the same agents and two runs can be compared.
 *
 * It reads public, read-only sources and nothing else:
 *
 *  - Pokter's public API, `GET /api/v1/agents`: every agent in the
 *    catalogue, and the category it is listed under right now.
 *  - The public ERC-8004 indexer the catalogue is built from: the same
 *    discovery searches each category listing runs (so the dry run knows
 *    whether an agent that moves category would be found by its new
 *    listing), and each listed agent's registry record, for the tags its
 *    publisher declared. List rows carry no tags; the record does.
 *
 * It never contacts an agent, never reads an agent card, never asks for a
 * quote and sends no key: anonymous indexer reads are limited to 30 a
 * minute, so the requests are paced and the run takes several minutes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { CATEGORIES, type Category, type Classification } from '../src/lib/agents/categories';

/**
 * The discovery reads each category listing makes, per chain.
 *
 * A copy of `DISCOVERY_QUERIES` and `KEYWORD_TERMS` in
 * `src/lib/marketplace.ts`, which are not exported. The dry-run test checks
 * that every term here still appears there, so the copy cannot drift
 * silently.
 */
export const DISCOVERY_QUERIES: Record<Category, string[]> = {
  rebalancing: ['portfolio rebalancing agent maintaining target allocation'],
  'grid-trading': ['grid trading bot buy low sell high ladder'],
  yield: ['yield optimiser moving capital to the best APY'],
  'health-factor': ['health factor monitor preventing loan liquidation'],
  'token-safety': ['token safety screen honeypot sellability contract risk'],
};

export const KEYWORD_TERMS: Record<Category, string[]> = {
  rebalancing: ['rebalanc', 'allocation'],
  'grid-trading': ['grid', 'ladder'],
  yield: ['yield', 'vault'],
  'health-factor': ['health factor', 'liquidation'],
  'token-safety': ['honeypot', 'token safety'],
};

const LISTED_CHAINS = [56, 97] as const;

/** One agent as the dry run reads it. */
export interface SnapshotAgent {
  chainId: number;
  tokenId: string;
  name: string;
  description: string | null;
  /** Publisher-declared tags from the registry record. Null when the record was not read. */
  tags: string[] | null;
  owner: string | null;
  /** In Pokter's public catalogue when the snapshot was taken. */
  listed: boolean;
  /** The category the catalogue showed it under. Null when not listed. */
  liveCategory: Classification | null;
  /** The catalogue reports a signed price for it. Null when not listed. */
  signedPrice: boolean | null;
  /** Categories whose discovery reads returned it, and so whose listing could hold it. */
  surfacedBy: Category[];
}

export interface Snapshot {
  schema: 'pokter.category-snapshot/v1';
  takenAt: string;
  sources: { catalogue: string; indexer: string };
  /** Per-category totals the catalogue reported, for checking the snapshot against the site. */
  liveCounts: Record<string, number>;
  agents: SnapshotAgent[];
  /** Reads that failed, so a partial snapshot says so. */
  failures: string[];
}

interface Flags {
  out: string;
  site: string;
  indexer: string;
}

function readFlags(argv: string[]): Flags {
  const value = (name: string) => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  return {
    out: value('--out') ?? join(tmpdir(), 'pokter-category-dry-run', `snapshot-${new Date().toISOString().slice(0, 10)}.json`),
    site: (value('--site') ?? 'https://pokter.xyz').replace(/\/+$/, ''),
    indexer: (value('--indexer') ?? 'https://api.8004scan.io/api/v1').replace(/\/+$/, ''),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Spacing that keeps anonymous indexer reads inside 30 a minute. */
const INDEXER_SPACING_MS = 2_100;
let lastIndexerRead = 0;

async function getJson(url: URL, { paced }: { paced: boolean }): Promise<unknown> {
  for (let attempt = 0; ; attempt += 1) {
    if (paced) {
      const wait = lastIndexerRead + INDEXER_SPACING_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastIndexerRead = Date.now();
    }
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'pokter-category-snapshot' },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) return response.json();
    if (response.status === 429 && attempt < 3) {
      const reset = Number(response.headers.get('x-ratelimit-reset'));
      await sleep(Math.min(Number.isFinite(reset) && reset > 0 ? (reset + 1) * 1000 : 30_000, 65_000));
      continue;
    }
    throw new Error(`${url.pathname} returned ${response.status}`);
  }
}

interface CatalogueItem {
  chainId: number;
  tokenId: string;
  name: string;
  description: { value: string | null } | null;
  owner: { value: string | null } | null;
  category: { value: Classification };
  price: { value: unknown } | null;
}

interface IndexerRow {
  chain_id: number;
  token_id: string;
  name: string;
  description: string | null;
  owner_address: string | null;
  tags?: string[] | null;
}

export async function takeSnapshot(flags: Pick<Flags, 'site' | 'indexer'>, log: (line: string) => void = () => {}): Promise<Snapshot> {
  const failures: string[] = [];
  const key = (chainId: number, tokenId: string) => `${chainId}:${tokenId}`;
  const agents = new Map<string, SnapshotAgent>();

  /* The catalogue, page by page, exactly as any API reader sees it. */
  const catalogue: CatalogueItem[] = [];
  for (let offset = 0; ; offset += 100) {
    const url = new URL(`${flags.site}/api/v1/agents`);
    url.searchParams.set('limit', '100');
    url.searchParams.set('offset', String(offset));
    const page = (await getJson(url, { paced: false })) as { items: CatalogueItem[]; total: number };
    catalogue.push(...page.items);
    log(`catalogue: ${catalogue.length} of ${page.total}`);
    if (page.items.length === 0 || catalogue.length >= page.total) break;
  }
  for (const item of catalogue) {
    agents.set(key(item.chainId, item.tokenId), {
      chainId: item.chainId,
      tokenId: item.tokenId,
      name: item.name,
      description: item.description?.value ?? null,
      tags: null,
      owner: item.owner?.value ?? null,
      listed: true,
      liveCategory: item.category.value,
      signedPrice: item.price?.value !== null && item.price?.value !== undefined,
      surfacedBy: [],
    });
  }

  /* The discovery reads, with the parameters the category listings use. */
  for (const { id } of CATEGORIES) {
    for (const chainId of LISTED_CHAINS) {
      const reads: URL[] = [
        ...DISCOVERY_QUERIES[id].map((q) => {
          const url = new URL(`${flags.indexer}/agents/search/semantic`);
          url.searchParams.set('q', q);
          url.searchParams.set('chain_id', String(chainId));
          url.searchParams.set('limit', '12');
          return url;
        }),
        ...KEYWORD_TERMS[id].map((term) => {
          const url = new URL(`${flags.indexer}/agents`);
          url.searchParams.set('chain_id', String(chainId));
          url.searchParams.set('limit', '20');
          url.searchParams.set('offset', '0');
          url.searchParams.set('search', term);
          url.searchParams.set('sort_by', 'total_score');
          url.searchParams.set('sort_order', 'desc');
          return url;
        }),
      ];
      for (const url of reads) {
        try {
          const page = (await getJson(url, { paced: true })) as { items: IndexerRow[] };
          for (const row of page.items) {
            const k = key(row.chain_id, row.token_id);
            const known = agents.get(k) ?? {
              chainId: row.chain_id,
              tokenId: row.token_id,
              name: row.name,
              description: row.description,
              tags: null,
              owner: row.owner_address,
              listed: false,
              liveCategory: null,
              signedPrice: null,
              surfacedBy: [],
            };
            if (!known.surfacedBy.includes(id)) known.surfacedBy.push(id);
            agents.set(k, known);
          }
          log(`discovery ${id} on ${chainId}: ${page.items.length} rows`);
        } catch (error) {
          failures.push(`discovery ${id} on ${chainId} ${url.pathname}?${url.searchParams}: ${(error as Error).message}`);
        }
      }
    }
  }

  /* Declared tags, read from the registry record of each listed agent. */
  const listed = [...agents.values()].filter((a) => a.listed);
  for (const [index, agent] of listed.entries()) {
    try {
      const row = (await getJson(new URL(`${flags.indexer}/agents/${agent.chainId}/${agent.tokenId}`), { paced: true })) as IndexerRow;
      agent.tags = Array.isArray(row.tags) ? row.tags : [];
    } catch (error) {
      failures.push(`record ${agent.chainId}:${agent.tokenId}: ${(error as Error).message}`);
    }
    if ((index + 1) % 20 === 0) log(`records: ${index + 1} of ${listed.length}`);
  }

  const liveCounts: Record<string, number> = {};
  for (const item of catalogue) liveCounts[item.category.value] = (liveCounts[item.category.value] ?? 0) + 1;

  return {
    schema: 'pokter.category-snapshot/v1',
    takenAt: new Date().toISOString(),
    sources: { catalogue: `${flags.site}/api/v1/agents`, indexer: flags.indexer },
    liveCounts,
    agents: [...agents.values()].sort((a, b) => a.chainId - b.chainId || a.tokenId.localeCompare(b.tokenId, 'en', { numeric: true })),
    failures,
  };
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const flags = readFlags(process.argv.slice(2));
  const snapshot = await takeSnapshot(flags, (line) => process.stderr.write(`${line}\n`));
  mkdirSync(dirname(flags.out), { recursive: true });
  writeFileSync(flags.out, `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(`Wrote ${snapshot.agents.length} agents (${snapshot.agents.filter((a) => a.listed).length} listed) to ${flags.out}\n`);
  if (snapshot.failures.length > 0) {
    process.stdout.write(`${snapshot.failures.length} reads failed; the snapshot is partial:\n${snapshot.failures.map((f) => `  ${f}`).join('\n')}\n`);
    process.exitCode = 1;
  }
}
