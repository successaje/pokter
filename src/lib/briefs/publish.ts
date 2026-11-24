import 'server-only';

import { createHash } from 'node:crypto';

import { notifyBuilderCustomRequest } from '@/lib/notifications/server';
import { verifiedOwnedAgents } from '@/lib/profiles/owned-agents';
import { getProfileStore } from '@/lib/profiles/store';
import { queuePublicRequestAlert } from '@/lib/telegram/request-alerts';

import type { Brief, BriefContent } from './model';

/**
 * Publishing a request, shared by the two ways one is posted: signed by its
 * poster's wallet (`POST /api/briefs`), or posted on PokterBoard from it
 * (`POST /api/briefs/board/record`). Either way it is the same request, with
 * the same id for the same text and the same checks before anyone sees it.
 */

/** A request's id: a UUID-shaped digest of its text, so the same text posted twice is one request. */
export function briefIdFor(message: string): string {
  const digest = createHash('sha256').update(message).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

/** Why a custom request cannot go to the builder it names, or null when it can (or names none). */
export async function targetBuilderProblem(content: Pick<BriefContent, 'targetBuilder'>): Promise<string | null> {
  if (!content.targetBuilder) return null;
  const target = getProfileStore().get(content.targetBuilder);
  if (!target?.published || !target.showBuilding) return 'This builder is no longer accepting public requests.';
  if ((await verifiedOwnedAgents(content.targetBuilder)).length === 0) return 'This builder has no currently owned agent that can propose. Nothing was posted.';
  return null;
}

/** Tell whoever should hear of a new request: the builder a custom one names, or the public alerts for any other. */
export async function announceRequest(brief: Brief): Promise<void> {
  if (brief.targetBuilder) {
    await notifyBuilderCustomRequest({ owner: brief.targetBuilder, requestId: brief.id, chainId: brief.chainId, title: brief.title }).catch(() => undefined);
    return;
  }
  try {
    queuePublicRequestAlert(brief);
  } catch {
    /* A bot alert cannot undo a posted request. */
  }
}
