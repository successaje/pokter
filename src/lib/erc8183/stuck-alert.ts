import 'server-only';

import { getErc8183Job } from '@altananetwork/sdk';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { getJobStore } from '@/lib/erc8183/store';
import { sendOperatorAlert } from '@/lib/alerts/operator';
import { alertChannels } from '@/lib/alerts/channels';
import {
  describeDuration,
  stuckJobsNeedingAlert,
  type StuckCandidate,
} from './stuck-jobs';

/** Where the ids we have already raised are kept between sweeps. */
const CURSOR = 'stuck-jobs-alerted';

/**
 * How many ids to remember.
 *
 * Only needed to stop one stuck job sending a message every two hours. Once
 * a job has expired it can never be raised again regardless, so the memory
 * only has to outlive a single twenty-four hour window — a few dozen ids is
 * generous, and capping it keeps the cursor row small.
 */
const REMEMBER = 60;

export interface StuckAlertOutcome {
  checked: number;
  stuck: number;
  alerted: boolean;
  jobIds: string[];
  channels: ReturnType<typeof alertChannels>;
}

/**
 * Tell the operator about escrow that has been paid and has not moved.
 *
 * The retry tries to rescue these on the same sweep. This runs after it,
 * because what matters is the jobs still stuck once the automatic attempt
 * has had its go — trying is not succeeding, and the failure mode this
 * exists for is silence: four escrows have already reached expiry
 * undelivered with nobody told until the chain was read days later.
 *
 * Never throws. An alert that takes the sweep down costs more than the
 * alert is worth, and the sweep reports the outcome so a dead channel shows
 * up as `alerted: false` beside the count rather than as success.
 */
export async function alertStuckJobs(): Promise<StuckAlertOutcome> {
  const store = getJobStore();
  const channels = alertChannels();

  const indexed = store
    .all()
    .filter((job) => job.chainId === ALTANA_NETWORK.chainId && job.status === 'FUNDED');

  const candidates: StuckCandidate[] = [];
  for (const job of indexed) {
    try {
      /*
       * Read from chain, not the index. The index is what the sweep is in
       * the middle of refreshing, and raising an alarm about a job that was
       * delivered ten minutes ago is how a channel loses its reader.
       */
      const onchain = await getErc8183Job(ALTANA_NETWORK, BigInt(job.jobId));
      const expiresAtMs = Number(onchain.expiredAt) * 1000;
      const hired = Date.parse(job.hiredAt);
      candidates.push({
        jobId: job.jobId,
        agentName: job.agentName,
        /*
         * The chain records when a job expires, not when it was funded, so
         * the index's own timestamp is used where it parses. Where it does
         * not, the expiry minus the fixed 24h window is the same instant.
         */
        fundedAtMs: Number.isFinite(hired)
          ? hired
          : expiresAtMs - 24 * 60 * 60 * 1000,
        expiresAtMs,
        statusName: onchain.statusName,
      });
    } catch {
      /* A job that cannot be read this sweep is left for the next one. */
    }
  }

  const alertedBefore = new Set(
    (store.readCursor(CURSOR) ?? '').split(',').filter(Boolean),
  );
  const stuck = stuckJobsNeedingAlert(candidates, Date.now(), alertedBefore);

  if (stuck.length === 0) {
    return { checked: candidates.length, stuck: 0, alerted: false, jobIds: [], channels };
  }

  const lines = stuck
    .map(
      (job) =>
        `#${job.jobId} · ${job.agentName}\n` +
        `funded ${describeDuration(job.stuckForMs)} ago, not delivered\n` +
        `${describeDuration(job.remainingMs)} left before the buyer must reclaim`,
    )
    .join('\n\n');

  const delivery = await sendOperatorAlert({
    subject: `Pokter: ${stuck.length} funded job${stuck.length === 1 ? '' : 's'} not delivered`,
    body:
      `${lines}\n\n` +
      'Escrow is funded and nothing has been submitted. The sweep retries ' +
      'these automatically; they are still unmoved after that attempt, so ' +
      'they need a look before the window closes.',
  });

  const alerted = delivery.telegram === 'sent' || delivery.email === 'sent';

  /*
   * Only recorded when it actually went somewhere. Marking a job as raised
   * after a failed send would make the first miss permanent — the one case
   * where the reader most needs the second attempt.
   */
  if (alerted) {
    const remembered = [...alertedBefore, ...stuck.map((job) => job.jobId)].slice(
      -REMEMBER,
    );
    store.writeCursor(CURSOR, remembered.join(','));
  }

  return {
    checked: candidates.length,
    stuck: stuck.length,
    alerted,
    jobIds: stuck.map((job) => job.jobId),
    channels,
  };
}
