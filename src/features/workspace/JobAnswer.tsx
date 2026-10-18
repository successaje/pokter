'use client';

import { useQuery } from '@tanstack/react-query';

import { briefText, flatText, type DeliveredAnswer } from '@/lib/delivery/answer';
import type { HiredJob } from '@/lib/erc8183/types';
import { chainLabel } from '@/lib/network/presentation';
import { Button } from '@/ui/Button';
import { Skeleton } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

type AnswerResponse =
  | { delivered: false }
  | { delivered: true; readable: false; reason: string }
  | { delivered: true; readable: true; matchesChain: boolean; manifestHash: string; answer: DeliveredAnswer };

/** A field value as text: short values inline, structures as indented text, nothing interpreted. */
function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-ink-3">—</span>;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return <span className="whitespace-pre-line break-words">{String(value)}</span>;
  const flat = flatText(value);
  if (flat) return <span className="break-words">{flat}</span>;
  const json = JSON.stringify(value, null, 2);
  if (json.length <= 160) return <span className="t-readout break-words text-[12.5px]">{JSON.stringify(value)}</span>;
  return (
    <details className="group">
      <summary className="cursor-pointer text-[12.5px] font-medium text-ink-2 hover:text-ink">Show {Array.isArray(value) ? `${value.length} items` : 'details'}</summary>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-[8px] bg-sunken p-3 text-[12px]">{json.slice(0, 6000)}</pre>
    </details>
  );
}

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
          <div className="flex flex-col gap-1.5">
            <span className="t-label">What came back</span>
            {answer!.title && <p className="text-[15px] font-semibold">{answer!.title}</p>}
            {answer!.result ? (
              <p className="whitespace-pre-line break-words text-[15px] leading-relaxed text-ink">{answer!.result}</p>
            ) : answer!.raw ? (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-[10px] bg-sunken p-4 text-[13px]">{answer!.raw.slice(0, 8000)}</pre>
            ) : (
              <p className="text-[13.5px] text-ink-3">The agent gave no summary; its fields are below.</p>
            )}
            <p className="text-[12px] text-ink-3">
              {/*
                Two facts, never one. When the report was written is not
                when its data was read, and printing the first under the
                second claimed a freshness nobody measured.
              */}
              {answer!.asOf?.time ? `Data read ${localMoment(answer!.asOf.time)}` : 'The agent did not say when it read the data'}
              {answer!.asOf?.block ? ` · block ${answer!.asOf.block}` : ''}
              {answer!.generatedAt ? ` · report generated ${localMoment(answer!.generatedAt)}` : ''}
              {` · paid on ${chainLabel(job.chainId)}`}
              {answer!.producer ? ` · produced by ${answer!.producer}` : ''}
            </p>
          </div>

          {answer!.fields.length > 0 && (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 rounded-[12px] border border-rule bg-paper p-4 text-[13.5px] sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
              {answer!.fields.slice(0, 14).map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-[12.5px] capitalize text-ink-3">{f.label}</dt>
                  <dd className="min-w-0 text-ink-2"><Value value={f.value} /></dd>
                </div>
              ))}
            </dl>
          )}

          {(answer!.limitations.length > 0 || answer!.sources.length > 0) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {answer!.limitations.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="t-label">What it does not cover</span>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
                    {answer!.limitations.slice(0, 8).map((l) => <li key={l} className="break-words">{l}</li>)}
                  </ul>
                </div>
              )}
              {answer!.sources.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="t-label">Where it came from</span>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-2">
                    {answer!.sources.slice(0, 8).map((s) => <li key={s} className="break-all">{s}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          <p className="text-[12px] text-ink-3">Written by the agent. Pokter shows it as delivered and has not checked that it is right.</p>
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
          <span className="text-[12.5px] text-ink-3">The hash covers the bytes of the delivered record, not any file it links to, and says nothing about whether the answer is right.</span>
          <Button size="s" intent={verify.verified ? 'ghost' : 'secondary'} onClick={verify.run} busy={verify.busy} disabled={verify.verified} className="self-start">
            {verify.verified ? 'Checked: matches' : 'Check it against the chain'}
          </Button>
        </div>
      </details>
    </div>
  );
}
