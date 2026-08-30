/** Does the live BSC registry actually contain agents in our four categories? */
import { classify, scoreCategories } from '../src/lib/agents/categories';
import type { ScanAgent, ScanPage } from '../src/lib/scan/types';

const QUERIES: Record<string, string> = {
  rebalancing: 'portfolio rebalancing agent that maintains target allocation',
  'grid-trading': 'grid trading bot running a buy low sell high ladder',
  yield: 'yield optimisation agent that moves capital to best APY',
  'health-factor': 'health factor monitor that prevents loan liquidation',
};

async function get(url: string): Promise<ScanPage<ScanAgent>> {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return (await r.json()) as ScanPage<ScanAgent>;
}

async function main() {
  const base = 'https://api.8004scan.io/api/v1';
  const hits: Record<string, number> = {};

  for (const [cat, q] of Object.entries(QUERIES)) {
    const url = `${base}/agents/search/semantic?q=${encodeURIComponent(q)}&chain_id=56&limit=12`;
    try {
      const page = await get(url);
      console.log(`\n=== ${cat} === (semantic, ${page.items.length} results)`);
      for (const a of page.items.slice(0, 6)) {
        const cls = classify(a);
        const top = scoreCategories(a)[0];
        hits[cls] = (hits[cls] ?? 0) + 1;
        console.log(
          `  ${a.name.slice(0, 26).padEnd(27)} fb=${String(a.total_feedbacks).padStart(3)} -> ${cls}${top ? ` (${top.confidence.toFixed(2)})` : ''}`,
        );
        if (a.description) console.log(`     "${a.description.slice(0, 88)}"`);
      }
    } catch (e) {
      console.log(`\n=== ${cat} === SEARCH FAILED: ${(e as Error).message}`);
    }
  }
  console.log('\nclassification tally across all results:', hits);
}

main().catch((e) => { console.error(e); process.exit(1); });
