import type { Metadata } from 'next';
import Link from 'next/link';

import { jobView, scenarioSpec } from '@/features/proofrun/run';
import { ProofRunResults } from '@/features/proofrun/ResultsView';
import { VENUS_COMPTROLLER, venusClient } from '@/lib/assay/venus';
import { loadDeliveredVenusReport, type DeliveredReportRefusal } from '@/lib/delivery/delivered-report';
import { readVenusFactsAt } from '@/lib/delivery/venus-facts';
import { checkDeliveredVenusReport } from '@/lib/delivery/venus-report-check';
import { manifestMatch } from '@/lib/erc8183/manifest-match';
import { jobChainParam } from '@/lib/jobs/href';
import { artifactHref } from '@/lib/proofrun/run';
import { proofRun } from '@/lib/proofrun/run';
import { EmptyState, Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';
export const maxDuration = 40;

export const metadata: Metadata = {
  title: 'ProofRun',
  description: 'What Pokter checked on a delivered report, check by check, with the receipt beside it.',
  /* Not indexed: one job's receipt is about one buyer's work, and a
     search result for it would be publishing that rather than serving it. */
  robots: { index: false, follow: false },
};

/**
 * One delivered job's ProofRun, as a page rather than as JSON.
 *
 * This is where `replayRef` points. It pointed at a page nobody had
 * written for six commits, and before that at nothing at all — so the
 * first thing this file is for is being the route that reference names.
 * `tests/proofrun-core.test.mts` resolves every link a result can emit
 * against the routes `src/app` defines, so the reference and the page
 * cannot drift apart again without the suite saying so.
 *
 * Recomputed per request, like the artifact endpoint it sits beside and
 * for the same reason: a run is a function of the job, the delivered
 * bytes and chain state at a named block, all of which are already stored
 * or already immutable. A fourth copy could only disagree with the other
 * three. It also means the page and the downloadable receipt are the same
 * object produced twice, rather than two things that might differ.
 *
 * **Nothing here may read as a fixture.** The provenance is `customer`,
 * set by this page and not settable by the view, and `ProvenanceChip`
 * draws it from the run rather than from any local flag. A real buyer's
 * work drawn as something Pokter wrote down would be the mislabelling
 * that matters most on this surface.
 */
export default async function JobProofRunPage({
  params,
}: {
  params: Promise<{ chainId: string; jobId: string }>;
}) {
  const { chainId: rawChain, jobId } = await params;
  const chainId = jobChainParam(rawChain);

  if (chainId === null || !/^\d{1,18}$/.test(jobId)) {
    return (
      <Frame>
        <EmptyState title="That is not a job Pokter can look up." tone="bad">
          A ProofRun is read by a job id and the chain it was funded on. This address has neither.
        </EmptyState>
      </Frame>
    );
  }

  const loaded = await loadDeliveredVenusReport({ chainId, jobId }).catch((error: unknown) => {
    /*
     * Reading the job means reading a chain, and that can fail for
     * reasons that are nothing to do with the report. Said as Pokter's
     * own failure rather than as a verdict, because an outage rendered as
     * "could not verify" reads as a finding against the agent.
     */
    return {
      ok: false as const,
      refusal: {
        code: 'deliverable-unreadable' as const,
        reason: `Pokter could not read this job: ${error instanceof Error ? error.message : 'the chain did not answer'}. That is Pokter’s failure to see, and it says nothing about the report.`,
      },
    };
  });

  if (!loaded.ok) {
    return (
      <Frame chainId={chainId} jobId={jobId}>
        <Refusal refusal={loaded.refusal} chainId={chainId} jobId={jobId} />
      </Frame>
    );
  }

  const { report } = loaded;
  /*
   * The block hash is captured where the state is read, because that is
   * the only place it exists, and from the same reading the figures came
   * from — so it cannot belong to a different read from the numbers it is
   * meant to pin.
   */
  const read: { blockHash: string | null } = { blockHash: null };
  const verification = await checkDeliveredVenusReport({
    subject: report.subject,
    manifestText: report.manifestText,
    manifestMatchesChain: report.committed === null ? null : manifestMatch(report.manifestText, report.committed) !== null,
    readFactsAt: async (at) => {
      const evidence = await readVenusFactsAt(venusClient(), at);
      /* A field on a holder rather than a reassigned binding: a server
         component may not reassign a captured variable, and the value has
         to come back from inside the reader because that is the only
         place the header exists. */
      if (evidence.available) read.blockHash = evidence.facts.blockHash;
      return evidence;
    },
  });

  const spec = scenarioSpec();
  const run = proofRun({
    job: { chainId, jobId },
    account: report.subject.account,
    deployment: VENUS_COMPTROLLER,
    chainId,
    verification,
    manifestText: report.manifestText,
    brief: report.brief,
    blockHash: read.blockHash,
    /* A real job for a real buyer. Not settable from the view. */
    provenance: 'customer',
    spec,
  });

  return (
    <Frame chainId={chainId} jobId={jobId}>
      <ProofRunResults view={jobView({ run, spec, job: { chainId, jobId } })} />
    </Frame>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function Frame({ children, chainId, jobId }: { children: React.ReactNode; chainId?: number; jobId?: string }) {
  return (
    <div className="frame pb-24 pt-10 sm:pt-16">
      <header className="mb-8 flex max-w-3xl flex-col gap-3">
        <span className="t-label flex items-center gap-2">
          <span className="tile" aria-hidden /> ProofRun
        </span>
        <h1 className="t-h1">
          {jobId ? <>What Pokter checked on job #{jobId}</> : <>What Pokter checked</>}
        </h1>
        <p className="t-lede">
          Each named check on its own: passed, failed, or not verified. There is no overall score, and a check that
          could not run is never counted as one that passed.
        </p>
        {chainId !== undefined && jobId !== undefined && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
            <Link href={`/proofrun`} className="link text-ink">
              What a ProofRun is
            </Link>
            <a href={artifactHref({ chainId, jobId })} className="link inline-flex items-center gap-1 text-ink" download>
              The receipt, as JSON <Icon.Download size={12} />
            </a>
          </p>
        )}
      </header>
      {children}
    </div>
  );
}

/**
 * Why there is no run, in the terms the refusal was raised in.
 *
 * Each code gets its own sentence and its own owner. Collapsing them into
 * "could not check" would lose the only part a reader can act on — and
 * three of these are about the brief or the job rather than about the
 * report, so a single message would also put a Pokter gap and a missing
 * delivery under the same words.
 */
function Refusal({ refusal, chainId, jobId }: { refusal: DeliveredReportRefusal; chainId: number; jobId: string }) {
  const notThisCheck = refusal.code === 'not-this-check';
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Notice tone={notThisCheck ? 'neutral' : 'watch'} title={TITLES[refusal.code]}>
        {refusal.reason}
      </Notice>
      {/*
        Said in every refusal: an absent run is not a finding. The page
        would otherwise read as a verdict on the agent to anyone who
        arrived here from a receipt link expecting one.
      */}
      <p className="text-[13px] leading-relaxed text-ink-3">
        Nothing here is a finding about the agent or the report. It is a statement about what Pokter can check, and
        this job is outside it.
      </p>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <Link href={`/workspace/jobs/${jobId}`} className="link text-ink">
          The job itself
        </Link>
        <span className="t-readout text-[12px] text-ink-3">
          chain {chainId} · job {jobId}
        </span>
      </p>
    </div>
  );
}

const TITLES: Readonly<Record<DeliveredReportRefusal['code'], string>> = {
  'not-this-check': 'This job did not ask for a Venus health factor.',
  'nothing-delivered': 'Nothing has been delivered for this job yet.',
  'no-subject': 'The brief names no wallet, so there is no position to read.',
  'ambiguous-subject': 'The brief names more than one wallet.',
  'no-deliverable-link': 'Pokter has no link to what was delivered.',
  'deliverable-unreadable': 'Pokter could not read what was delivered.',
};
