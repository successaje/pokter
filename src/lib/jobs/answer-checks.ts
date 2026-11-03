import { checkDeliveredPlan, type PlanCheckReport } from '@/lib/delivery/plan-checks';
import type { ManifestMatch } from '@/lib/erc8183/manifest-match';
import { briefIsPublic, type JobFunder } from './evidence-view';

/** Checks shown by the buyer page. A public API may use a brief only for a team test. */
export function buyerDeliveryChecks(
  manifestText: string,
  matchedBy: ManifestMatch | null,
  funder: JobFunder,
  indexedTask: string | null,
): PlanCheckReport | null {
  if (!matchedBy) return null;
  return checkDeliveredPlan(manifestText, briefIsPublic(funder) ? indexedTask : null);
}
