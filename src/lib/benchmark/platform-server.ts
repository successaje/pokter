import 'server-only';

import { isPromotableAgent } from '@/lib/agents/eligibility';
import { listSearchableWithStatus } from '@/lib/marketplace';
import { platformBenchmark, type PlatformBenchmark } from './platform';

/*
 * The benchmark for every profile, computed from the catalogue at most once
 * per `FRESH_MS` and served stale while it refreshes.
 *
 * The catalogue read is the one Discover makes, and a profile should not pay
 * for it on every view. A cold read that takes longer than `WAIT_MS` returns
 * nothing rather than holding the page: the profile then shows its own
 * figures without a comparison, which is true, and the next view has one.
 */
const FRESH_MS = 10 * 60_000;
const WAIT_MS = 4_000;

let cached: { at: number; value: PlatformBenchmark } | null = null;
let inflight: Promise<PlatformBenchmark> | null = null;

async function compute(): Promise<PlatformBenchmark> {
  const { entries } = await listSearchableWithStatus({ limit: 400 });
  // The agents Discover lists, so "typical on Pokter" means typical of what a buyer is shown.
  return platformBenchmark(entries.filter((entry) => isPromotableAgent(entry.listing.agent)));
}

export async function currentPlatformBenchmark(): Promise<PlatformBenchmark | null> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.value;
  inflight ??= compute()
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  if (cached) return cached.value;
  return Promise.race([inflight, new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS))]).catch(() => null);
}
