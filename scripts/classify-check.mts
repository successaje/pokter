import { classify, scoreCategories } from '../src/lib/agents/categories.js';
import type { ScanAgentDetail } from '../src/lib/scan/types.js';

const IDS = ['302258', '302257', '304494', '310460', '292058'];

for (const tokenId of IDS) {
  const res = await fetch(`https://api.8004scan.io/api/v1/agents/56/${tokenId}`);
  if (!res.ok) continue;
  const agent = (await res.json()) as ScanAgentDetail;
  const top = scoreCategories(agent).slice(0, 2);
  console.log(`${agent.name.slice(0, 44).padEnd(45)} -> ${classify(agent)}`);
  for (const s of top) {
    console.log(`    ${s.category.padEnd(14)} ${s.confidence.toFixed(2)}  [${s.matched.join(', ')}]`);
  }
}
