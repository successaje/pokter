/**
 * Run one probe sweep and print the outcome.
 *
 *   npx tsx --conditions=react-server scripts/sweep.ts
 *
 * Intended to be driven by cron / launchd on a schedule. Each run appends to the
 * probe history; the track record is whatever those runs accumulate.
 */
import { runSweep, SWEEP_PER_CATEGORY } from '../src/lib/history/sweep';

async function main() {
  const startedAt = Date.now();
  const outcome = await runSweep({
    perCategory: Number(process.env.SWEEP_PER_CATEGORY ?? SWEEP_PER_CATEGORY),
    samples: Number(process.env.SWEEP_SAMPLES ?? 2),
  });

  const pct =
    outcome.probes === 0
      ? 'n/a'
      : `${((outcome.answered / outcome.probes) * 100).toFixed(1)}%`;

  console.log(
    [
      `swept ${outcome.agents} agent(s) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
      `  probes   : ${outcome.probes}`,
      `  answered : ${outcome.answered} (${pct})`,
      `  skipped  : ${outcome.skipped} (no probeable endpoint)`,
      `  failed   : ${outcome.failed} (could not look up)`,
      ...outcome.errors.map((e) => `             ${e}`),
    ].join('\n'),
  );

  // A sweep that measured nothing is a failed sweep, whatever the exit path.
  if (outcome.probes === 0 && outcome.agents > 0) {
    console.error('\nsweep recorded no probes — treating as a failure');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('sweep failed:', error);
  process.exit(1);
});
