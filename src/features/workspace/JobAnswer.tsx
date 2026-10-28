'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { DeliveredAnswerView } from '@/features/delivery/AnswerView';
import { briefText, type DeliveredAnswer } from '@/lib/delivery/answer';
import type { HiredJob } from '@/lib/erc8183/types';
import { utcWhen } from '@/lib/jobs/evidence-view';
import { Button } from '@/ui/Button';
import { Skeleton } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import type { ManifestMatch } from '@/lib/erc8183/manifest-match';
import { publicationMessage } from '@/lib/jobs/answer-publication';
import type { JobFunder } from '@/lib/jobs/evidence-view';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { Notice } from '@/ui/Feedback';

type AnswerResponse =
  | { delivered: false }
  | { delivered: true; readable: false; reason: string }
  | { delivered: true; readable: true; matchesChain: boolean; matchedBy?: ManifestMatch | null; manifestHash: string; answer: DeliveredAnswer; funder?: JobFunder; published?: boolean };

/**
 * The answer, first. The buyer hired an agent to answer a question, so
 * the page leads with the question, what came back, when the data was
 * read, where it came from and what it does not cover. The file and the
 * hash that prove it are one level down, always there.
 */
/** In UTC, like every other time on the job page; as written when it is not a date. */
function answerMoment(value: string): string {
  return utcWhen(value) ?? value;
}

export function JobAnswer({
  job,
  owned,
  deliverableUrl,
  verify,
}: {
  job: HiredJob;
  /** The connected wallet funded this job: it sees its own brief and answer, and decides whether the answer is published. */
  owned: boolean;
  deliverableUrl: string | null;
  verify: { run: () => void; busy: boolean; verified: boolean };
}) {
  const query = useQuery({
    queryKey: ['job-answer', job.chainId, job.jobId, job.status],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AnswerResponse> => {
      const response = await fetch(`/api/jobs/${job.jobId}/answer?chain=${job.chainId}`);
      const body = (await response.json().catch(() => ({}))) as AnswerResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'The answer could not be read.');
      return body;
    },
  });

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Reading the answer">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  const data = query.data;
  if (query.isError) {
    /*
     * The answer could not be read or formatted. The delivered file and the
     * on-chain check do not depend on that, so they stay one click away
     * rather than disappearing with the summary.
     */
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13.5px] text-ink-2">{(query.error as Error).message} The original file and its check against the chain are still available.</p>
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          {deliverableUrl ? (
            <a href={deliverableUrl} target="_blank" rel="noreferrer noopener nofollow" className="inline-flex items-center gap-1.5 font-medium link">
              Open the delivered file <Icon.ArrowUpRight size={14} />
            </a>
          ) : (
            <span className="text-ink-3">No readable link was published.</span>
          )}
          <Button size="s" intent={verify.verified ? 'ghost' : 'secondary'} onClick={verify.run} busy={verify.busy} disabled={verify.verified}>
            {verify.verified ? 'Checked: matches' : 'Check it against the chain'}
          </Button>
        </div>
      </div>
    );
  }
  if (!data || !data.delivered) {
    return <p className="text-[13.5px] text-ink-2">Nothing has been delivered yet.</p>;
  }

  /*
   * Anyone but the funding wallet sees what the public evidence page
   * shows: the answer once it is public, the brief only for Pokter's own
   * tests. The page is out of search, but an unpublished answer should not
   * be one link away on Pokter either.
   */
  const withheld = !owned && data.readable && data.published === false;
  const answer = data.readable && !withheld ? data.answer : null;
  const asked = owned || (data.readable && data.funder === 'team') ? (answer?.asked ?? briefText(job.task)) : null;
  return (
    <div className="flex flex-col gap-5">
      {asked && (
        <div className="flex flex-col gap-1">
          <span className="t-label">You asked</span>
          <p className="line-clamp-4 whitespace-pre-line text-[13.5px] text-ink-2">{asked}</p>
        </div>
      )}

      {!data.readable ? (
        <p className="text-[13.5px] text-ink-2">{data.reason}</p>
      ) : withheld ? (
        <p className="text-[13.5px] text-ink-2">Delivered. The buyer has not published the answer, so it is shown only to the wallet that funded the job.</p>
      ) : (
        <>
          <DeliveredAnswerView answer={answer!} chainId={job.chainId} when={answerMoment} />
          {owned && data.matchesChain && (data.funder === 'outside' || data.funder === 'unknown') && <AnswerPublication job={job} published={data.published === true} />}
        </>
      )}

      <details className="group rounded-[12px] border border-rule bg-paper">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13px] [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            {data.readable && data.matchesChain ? <Icon.Check size={14} className="text-ok" /> : <Icon.Info size={14} className="text-ink-3" />}
            {data.readable ? (data.matchesChain ? 'The delivered record matches its hash on chain' : 'The delivered record does not match its hash on chain') : 'The file and its on-chain proof'}
          </span>
          <span className="font-medium text-ink-2 group-open:hidden">Original file and proof</span>
          <span className="hidden font-medium text-ink-2 group-open:inline">Hide</span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-rule px-4 py-3 text-[13px]">
          {withheld ? (
            <span className="text-ink-3">The delivered file is linked for the wallet that funded the job.</span>
          ) : deliverableUrl ? (
            <a href={deliverableUrl} target="_blank" rel="noreferrer noopener nofollow" className="inline-flex items-center gap-1.5 self-start font-medium link">
              Open the delivered file <Icon.ArrowUpRight size={14} />
            </a>
          ) : (
            <span className="text-ink-3">No readable link was published.</span>
          )}
          {data.readable && <span className="t-readout break-all text-[12px] text-ink-3">keccak256 {data.manifestHash}</span>}
          {data.readable && data.matchedBy === 'sorted-keys' && (
            <span className="text-[12.5px] text-ink-3">
              The agent hashed this record with its keys in sorted order, so the hash above (of the file as served) differs from the one on chain. Sorted the same way, it matches: the content is what the agent committed.
            </span>
          )}
          {data.readable && data.matchedBy === 'sha256' && (
            <span className="text-[12.5px] text-ink-3">
              The agent hashed this file with SHA-256 rather than keccak256, so the hash above differs from the one on chain. Hashed with SHA-256, the file as served matches it byte for byte: it is what the agent committed.
            </span>
          )}
          {data.readable && data.matchedBy === 'canonical' && (
            <span className="text-[12.5px] text-ink-3">
              The agent hashed this record in the standard canonical form (keys sorted, accented and other non-ASCII characters escaped), so the hash above (of the file as served) differs from the one on chain. In that form it matches: the content is what the agent committed.
            </span>
          )}
          <span className="text-[12.5px] text-ink-3">The hash covers the bytes of the delivered record, not any file it links to, and says nothing about whether the answer is right.</span>
          <Button size="s" intent={verify.verified ? 'ghost' : 'secondary'} onClick={verify.run} busy={verify.busy} disabled={verify.verified} className="self-start">
            {verify.verified ? 'Checked: matches' : 'Check it against the chain'}
          </Button>
        </div>
      </details>
    </div>
  );
}

/**
 * The funding wallet's choice to publish its answer on Pokter's public
 * pages, or to stop. Off until chosen (see answer-publication.ts): the
 * answer is the buyer's, and it can carry the task in it. One signature,
 * which moves nothing; the newest choice wins.
 */
function AnswerPublication({ job, published }: { job: HiredJob; published: boolean }) {
  const signer = useActiveSigner();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(publish: boolean) {
    setBusy(true);
    setError(null);
    try {
      const decidedAt = new Date().toISOString();
      const signature = await signer.sign(publicationMessage({ chainId: job.chainId, jobId: job.jobId, publish, decidedAt }));
      const response = await fetch(`/api/jobs/${job.jobId}/publication?chain=${job.chainId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publish, decidedAt, signature }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'The choice could not be recorded.');
      await queryClient.invalidateQueries({ queryKey: ['job-answer', job.chainId, job.jobId] });
    } catch (reason) {
      const message = (reason as Error)?.message ?? '';
      setError(/reject|denied|cancel|NotAllowed/i.test(message) ? 'You declined the signature. Nothing changed.' : message || 'The choice could not be recorded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-rule bg-paper px-4 py-3">
      <div className="flex flex-col gap-1">
        <span className="text-[13.5px] font-medium text-ink">{published ? 'Published on Pokter' : 'Only you see this answer on Pokter'}</span>
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          {published
            ? 'It is shown on this job’s public evidence page, and may appear as a sample on the agent’s page, with your wallet address taken out.'
            : 'Publishing it shows it on this job’s public evidence page, and possibly as a sample on the agent’s page, with your wallet address taken out. That helps other buyers judge the agent. The agent’s delivery link is recorded on chain whichever you choose.'}
        </p>
      </div>
      <Button size="s" intent="secondary" className="self-start" busy={busy} disabled={!signer.canSign} onClick={() => void decide(!published)}>
        {published ? 'Stop publishing it' : 'Publish this answer'}
      </Button>
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}
