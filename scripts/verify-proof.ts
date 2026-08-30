/** Smoke-test: run real 8004scan feedback through the decode + proof pipeline. */
import { toAttestation } from '../src/lib/proof/attestation';
import { summariseProof } from '../src/lib/proof/engine';
import type { ScanFeedback, ScanPage } from '../src/lib/scan/types';

async function main() {
  const res = await fetch(
    'https://api.8004scan.io/api/v1/feedbacks?chain_id=56&limit=60',
    { headers: { accept: 'application/json' } },
  );
  const page = (await res.json()) as ScanPage<ScanFeedback>;
  const attestations = page.items.map(toAttestation);

  const decoded = attestations.filter((a) => a.verified).length;
  console.log(`fetched ${page.items.length} feedbacks, decoded ${decoded}`);
  console.log('dimensions:', [...new Set(attestations.map((a) => a.dimension))]);
  console.log('measurers :', [...new Set(attestations.map((a) => a.measuredBy))]);

  // Group by agent so we exercise summariseProof the way the app will.
  const byAgent = new Map<string, typeof attestations>();
  for (const a of attestations) {
    byAgent.set(a.agentId, [...(byAgent.get(a.agentId) ?? []), a]);
  }

  console.log(`\n${byAgent.size} distinct agents in this page:\n`);
  let shown = 0;
  for (const [agentId, group] of byAgent) {
    if (shown++ >= 6) break;
    const s = summariseProof(group);
    const score = s.score === null ? '   n/a' : `${(s.score * 100).toFixed(1)}%`;
    console.log(
      `  ${agentId.slice(0, 8)}  ${s.verdict.padEnd(9)} ${score}  probes=${String(s.probes).padStart(4)}  hirable=${s.hirable}`,
    );
    console.log(`     ${s.rationale}`);
  }

  console.log('\nempty case ->', JSON.stringify(summariseProof([]), null, 0).slice(0, 180));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
