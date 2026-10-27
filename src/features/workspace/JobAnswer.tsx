'use client';

import { useQuery } from '@tanstack/react-query';

import { DeliveredAnswerView } from '@/features/delivery/AnswerView';
import { briefText, type DeliveredAnswer } from '@/lib/delivery/answer';
import type { HiredJob } from '@/lib/erc8183/types';
import { Button } from '@/ui/Button';
import { Skeleton } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import type { ManifestMatch } from '@/lib/erc8183/manifest-match';

type AnswerResponse =
  | { delivered: false }
  | { delivered: true; readable: false; reason: string }
  | { delivered: true; readable: true; matchesChain: boolean; matchedBy?: ManifestMatch | null; manifestHash: string; answer: DeliveredAnswer };

/**
 * The answer, first. The buyer hired an agent to answer a question, so
 * the page leads with the question, what came back, when the data was
 * read, where it came from and what it does not cover. The file and the
 * hash that prove it are one level down, always there.
 */
/** A timestamp as written when it is not a date we can parse. */
function localMoment(value: string): string {
  const parsed = new Date(value);
  return parsed.toString() === 'Invalid Date' ? value : parsed.toLocaleString();
}

export function JobAnswer({
  job,
  deliverableUrl,
  verify,
}: {
  job: HiredJob;
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
  if (query.isError || !data || !data.delivered) {
    return <p className="text-[13.5px] text-ink-2">{query.isError ? `${(query.error as Error).message} The file and its proof are below.` : 'Nothing has been delivered yet.'}</p>;
  }

  const answer = data.readable ? data.answer : null;
  const asked = answer?.asked ?? briefText(job.task);
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
      ) : (
        <>
          <DeliveredAnswerView answer={answer!} chainId={job.chainId} when={localMoment} />
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
          {deliverableUrl ? (
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
