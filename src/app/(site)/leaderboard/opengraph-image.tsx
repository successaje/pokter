import { ImageResponse } from 'next/og';

import { Card, contentType, size } from '@/lib/og/card';
import { loadOutcomeBoard } from '@/lib/leaderboard/server';
import { MIN_RESPONSIVENESS_CHECKS, RESPONSIVENESS_WINDOW_DAYS } from '@/lib/leaderboard/responsiveness';

export const alt = 'Pokter leaderboard: settled escrow jobs from external buyers, by network';
/**
 * Revalidated rather than rendered per request. A share card is fetched by
 * crawlers, and the board read behind it costs the same as a page load on a
 * single CPU — but kept shorter than the catalogue card's half hour, because
 * the figures here move whenever a job settles.
 */
export const revalidate = 600;
export { contentType, size };

/**
 * The board's own card.
 *
 * Mainnet, because that is the board a reader arrives on and the one where
 * the figure means money. A count the index could not supply is drawn as an
 * em dash, never as 0 — `lib/og/card.tsx` states that rule and this is
 * exactly the page it matters on: a card reading "0 settled jobs" would
 * circulate as a claim about the marketplace that Pokter has not made.
 */
export default async function LeaderboardCard() {
  const board = await loadOutcomeBoard('mainnet', 'settled-jobs').catch(() => null);
  const ready = board?.state === 'ready' ? board.data : null;
  const settled = ready?.rows.reduce((sum, row) => sum + row.settledJobs, 0) ?? null;
  /* Across agents, so one wallet that paid two agents counts once. Rows with
     no recorded funder are dropped rather than folded into one empty key,
     which would add a buyer that does not exist. */
  const buyers =
    ready === null
      ? null
      : new Set(
          ready.rows.flatMap((row) =>
            row.settled.flatMap((job) => (job.client ? [job.client.toLowerCase()] : [])),
          ),
        ).size;

  return new ImageResponse(
    (
      <Card
        context="Leaderboard · pokter.xyz"
        title="Two boards. No overall score."
        lede="Settled escrow jobs from external buyers, with evidence the agent did the work — and separately, whether it answered Pokter's scheduled check. Mainnet and testnet are never merged."
        signalRule
        facts={[
          /*
           * Nought is drawn as an em dash here, where on the page it is drawn
           * as nought.
           *
           * The page can say what a nought means: it carries the sentence
           * naming the network and the period, the coverage block, and every
           * exclusion that produced it. A card carries none of that and
           * travels without it, so "Settled on BNB Chain: 0" arrives in a feed
           * as a claim about BNB Chain — which is the one claim this whole
           * board refuses to make, and it is not Pokter's to make from its own
           * index. `BUYER WALLETS` beside it already withheld its nought for
           * the same reason; the two now agree.
           */
          {
            label: 'SETTLED ON BNB CHAIN',
            value: settled === null || settled === 0 ? '—' : String(settled),
            note: 'external buyers, delivery evidence',
          },
          {
            label: 'BUYER WALLETS',
            value: buyers === null || buyers === 0 ? '—' : String(buyers),
            note: 'distinct, outside Pokter',
          },
          {
            label: 'ANSWER RATE',
            value: `${RESPONSIVENESS_WINDOW_DAYS}d`,
            note: `ranked at ${MIN_RESPONSIVENESS_CHECKS}+ checks`,
          },
        ]}
      />
    ),
    size,
  );
}
