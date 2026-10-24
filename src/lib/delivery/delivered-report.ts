import 'server-only';

import { getErc8183Job } from '@altananetwork/sdk';

import { altanaNetworkFor } from '@/lib/altana/client';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { storedDeliveryText } from '@/lib/erc8183/deliverable-gate';
import { deliverableKey, readDeliverable } from '@/lib/erc8183/deliverables';
import { findDeliverableUrl } from '@/lib/erc8183/deliverable-url';
import { fetchDeliverableText } from '@/lib/erc8183/fetch-deliverable';
import { historyClient } from '@/lib/erc8183/history-client';
import { decodePokterJobEnvelope, jobTaskFromDescription } from '@/lib/erc8183/job-envelope';
import { getJobStore } from '@/lib/erc8183/store';
import { venusHealthJob, venusSubjectFromBrief, type VenusHealthSubject } from './venus-report-check';

/**
 * Everything a check needs about one delivered job, fetched once.
 *
 * Lifted out of `api/jobs/[jobId]/report-check` unchanged so ProofRun can
 * judge the same delivery the job page shows. Two routes each fetching
 * their own copy is how a verifier ends up checking a different document
 * from the one the buyer is reading, and the difference would be
 * invisible from either side.
 *
 * Every refusal below is a statement about what Pokter could see, never
 * about the report. They are kept apart from each other because the
 * buyer-facing sentence differs for each, and collapsing them into one
 * "could not check" would lose the only part a reader can act on.
 */

export type DeliveredReportRefusal =
  | { code: 'not-this-check'; reason: string }
  | { code: 'nothing-delivered'; reason: string }
  | { code: 'no-subject'; reason: string }
  | { code: 'ambiguous-subject'; reason: string; candidates: string[] }
  | { code: 'no-deliverable-link'; reason: string }
  | { code: 'deliverable-unreadable'; reason: string };

export interface DeliveredReport {
  chainId: number;
  jobId: string;
  brief: string;
  category: string | null;
  subject: VenusHealthSubject;
  manifestText: string;
  /**
   * The hash the agent committed on chain, or null when the job carries
   * none. Null rather than false on purpose: the verifier refuses
   * anything but `true`, and the distinction is what separates "this file
   * is not what was committed" from "Pokter could not confirm what was
   * committed".
   */
  committed: string | null;
  statusName: string;
  submittedAt: bigint | number | null;
}

export type DeliveredReportResult =
  | { ok: true; report: DeliveredReport }
  | { ok: false; refusal: DeliveredReportRefusal };

/** How long to wait for a deliverable URL read from chain history before giving up. */
const URL_READ_TIMEOUT_MS = 12_000;

export async function loadDeliveredVenusReport(input: {
  chainId: number;
  jobId: string;
}): Promise<DeliveredReportResult> {
  const network = altanaNetworkFor(input.chainId);
  const job = await getErc8183Job(network, BigInt(input.jobId));
  const brief = jobTaskFromDescription(job.description) ?? job.description;
  const category = decodePokterJobEnvelope(job.description)?.category ?? null;

  if (!venusHealthJob({ category, brief })) {
    return {
      ok: false,
      refusal: {
        code: 'not-this-check',
        reason: 'This job did not ask for a Venus health factor, so there is nothing here this check can recompute.',
      },
    };
  }
  if (!['SUBMITTED', 'COMPLETED', 'REJECTED'].includes(job.statusName)) {
    return {
      ok: false,
      refusal: { code: 'nothing-delivered', reason: 'Nothing has been delivered for this job yet, so there is no report to check.' },
    };
  }

  const subject = venusSubjectFromBrief(brief);
  if (!subject.ok) {
    return subject.code === 'none'
      ? {
          ok: false,
          refusal: {
            code: 'no-subject',
            reason:
              'The brief this job was funded with names no wallet address, so there is no position for Pokter to read independently. The account has to come from what the buyer asked for — taking it from the report would let the report choose its own subject.',
          },
        }
      : {
          ok: false,
          refusal: {
            code: 'ambiguous-subject',
            candidates: subject.candidates,
            reason: `The brief names more than one address (${subject.candidates.join(', ')}), so which position the report should be about is not decided by the brief. Pokter will not pick one on the buyer’s behalf.`,
          },
        };
  }

  /*
   * Pokter's own copy when it has one, else the URL the agent committed on
   * chain. Shared on purpose — a check that read a different copy of the
   * delivery from the one the buyer is shown would be checking a different
   * document.
   */
  /*
   * Pokter's stored copy only when it *is* the delivery.
   *
   * A builder can prepare one draft and submit different bytes. Read
   * without this guard, the stale draft is served and checked as if it
   * were the answer — so a report could be verified against a document
   * the agent never committed. `storedDeliveryText` returns it only when
   * a submit was recorded, or when the bytes hash to what the job
   * committed on chain; otherwise the committed URL is fetched below.
   *
   * Carried over from the answer route rather than reinvented here, and
   * it is the one thing the extraction of this loader had dropped: the
   * route it came from gained the guard on a different branch, so the
   * two only disagreed once they were combined.
   */
  let manifestText = storedDeliveryText(readDeliverable(deliverableKey(input.chainId, input.jobId)), job.deliverable);
  if (!manifestText) {
    const indexed = getJobStore().all().find((j) => j.chainId === input.chainId && j.jobId === input.jobId);
    const url =
      indexed?.deliverableUrl ??
      (await Promise.race([
        findDeliverableUrl(
          historyClient(input.chainId === 56 ? 56 : 97),
          correctedErc8183Addresses(input.chainId).policy,
          BigInt(input.jobId),
          job.submittedAt,
        ).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), URL_READ_TIMEOUT_MS)),
      ]));
    if (!url) {
      return {
        ok: false,
        refusal: {
          code: 'no-deliverable-link',
          reason:
            'Pokter could not retrieve the delivered file: no link for it could be read just now. That is a gap in what Pokter can see, not a finding about the report.',
        },
      };
    }
    manifestText = await fetchDeliverableText(url).catch(() => null);
    if (!manifestText) {
      return {
        ok: false,
        refusal: {
          code: 'deliverable-unreadable',
          reason: 'The delivered file could not be read from the link the agent published, so there is nothing to check.',
        },
      };
    }
  }

  return {
    ok: true,
    report: {
      chainId: input.chainId,
      jobId: input.jobId,
      brief,
      category,
      subject: subject.subject,
      manifestText,
      committed: /^0x0{64}$/.test(job.deliverable) ? null : job.deliverable,
      statusName: job.statusName,
      submittedAt: job.submittedAt ?? null,
    },
  };
}
