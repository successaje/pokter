/** Do real BSC agents answer a live probe? */
import { probeAgent, probeTarget } from '../src/lib/proof/prober';
import { classify } from '../src/lib/agents/categories';
import type { ScanAgentDetail, ScanAgent, ScanPage } from '../src/lib/scan/types';

const BASE = 'https://api.8004scan.io/api/v1';

const QUERIES = [
  'health factor monitor liquidation protection Venus',
  'portfolio rebalancing target allocation',
  'yield optimizer best APY DeFi',
  'grid trading bot BNB',
];

async function main() {
  const seen = new Set<string>();
  const details: ScanAgentDetail[] = [];

  for (const q of QUERIES) {
    const r = await fetch(`${BASE}/agents/search/semantic?q=${encodeURIComponent(q)}&chain_id=56&limit=5`);
    const page = (await r.json()) as ScanPage<ScanAgent>;
    for (const a of page.items.slice(0, 3)) {
      if (seen.has(a.token_id)) continue;
      seen.add(a.token_id);
      const d = await fetch(`${BASE}/agents/56/${a.token_id}`);
      if (d.ok) details.push((await d.json()) as ScanAgentDetail);
    }
  }

  console.log(`resolved ${details.length} agent details\n`);
  const withTarget = details.filter((d) => probeTarget(d));
  console.log(`${withTarget.length}/${details.length} publish a probeable endpoint\n`);

  for (const agent of withTarget.slice(0, 8)) {
    const reading = await probeAgent(agent, { samples: 2 });
    const pct = reading.ratio === null ? 'n/a' : `${(reading.ratio * 100).toFixed(0)}%`;
    console.log(
      `${agent.name.slice(0, 30).padEnd(31)} [${classify(agent).padEnd(13)}] ${reading.protocol} ${pct} median=${reading.medianMs ?? '-'}ms`,
    );
    console.log(`   ${reading.endpoint}`);
    console.log(`   ${reading.probes[0]?.detail ?? 'no probes'}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
