import { listCategory } from '../src/lib/marketplace';
import { CATEGORIES } from '../src/lib/agents/categories';
import { getProbeStore } from '../src/lib/history/store';

const since = new Date(Date.now() - 30 * 86_400_000);

for (const { id, label } of CATEGORIES) {
  const listings = await listCategory(id, { limit: 12 });
  let probed = 0, totalProbes = 0, answered = 0, withAttest = 0;

  for (const l of listings) {
    const h = getProbeStore().historyFor(l.agent.chain_id, l.agent.token_id, since);
    if (h.length) probed += 1;
    totalProbes += h.length;
    answered += h.filter((p) => p.ok).length;
    if (l.attestationCount > 0) withAttest += 1;
  }

  console.log(
    `${label.padEnd(20)} agents=${String(listings.length).padStart(2)} ` +
    `probed=${String(probed).padStart(2)} probes=${String(totalProbes).padStart(4)} ` +
    `answered=${String(answered).padStart(4)} attested=${withAttest}`,
  );
}

console.log('\nGRID AGENTS:');
for (const l of await listCategory('grid-trading', { limit: 12 })) {
  const h = getProbeStore().historyFor(l.agent.chain_id, l.agent.token_id, since);
  const ok = h.filter((p) => p.ok).length;
  console.log(
    `  ${l.agent.name.slice(0, 40).padEnd(41)} probes=${String(h.length).padStart(3)} ok=${String(ok).padStart(3)} attest=${l.attestationCount}`,
  );
}
