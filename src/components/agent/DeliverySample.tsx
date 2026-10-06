'use client';

import { useQuery } from '@tanstack/react-query';
import { formatUnits } from 'viem';

import type { SampleDelivery } from '@/lib/agent/sample-delivery';
import { formatBudget } from '@/lib/erc8183/pricing';
import { shortHash } from '@/lib/ui/format';
import { Source } from '@/components/ui/Source';
import { CopyableId } from '@/components/ui/CopyableId';

function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-ink-faint">—</span>;
  if (typeof value === 'string') return <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{value}</span>;
  if (typeof value === 'number' || typeof value === 'boolean') return <span className="mono">{String(value)}</span>;
  if (Array.isArray(value)) {
    return (
      <ul className="flex flex-col gap-1">
        {value.map((item, index) => (
          <li key={index}>
            <Value value={item} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
      {Object.entries(value as Record<string, unknown>).map(([key, inner]) => (
        <div key={key} className="contents">
          <dt className="truncate text-ink-muted">{key.replace(/_/g, ' ')}</dt>
          <dd className="min-w-0 break-words [overflow-wrap:anywhere]">
            <Value value={inner} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * What you get: the last file this agent delivered, shown rather than
 * described, with the hash the chain committed to and a live check that
 * the bytes still match it.
 */
export function DeliverySample({ sample }: { sample: SampleDelivery }) {
  const check = useQuery({
    queryKey: ['receipt', sample.jobId, 'sample'],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const response = await fetch(`/api/deliverables/verify?jobId=${encodeURIComponent(sample.jobId)}`, { cache: 'no-store' });
      const result = (await response.json()) as { verified?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not check the receipt.');
      return Boolean(result.verified);
    },
  });
  const courier = sample.producer?.toLowerCase().includes('courier');
  const byPokter = !courier && (sample.producer?.toLowerCase().includes('pokter') || sample.providerLabel?.toLowerCase().includes('pokter'));

  return (
    <section aria-labelledby="sample-heading" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="sample-heading" className="font-sans text-title font-medium">
            What you get
          </h2>
          <Source kind="onchain" />
        </div>
        <div>
          <p className="text-body-s text-ink-muted">
            The last file delivered against this agent through Pokter, job #{sample.jobId}, {formatBudget(Number(formatUnits(BigInt(sample.budgetRaw), 18)))}.
            {courier && " Carried by Pokter's seller to the agent's own endpoint and delivered unchanged: the answer is the agent's."}
            {byPokter && " Produced by Pokter's seller standing in for the agent, so it shows the delivery path rather than the agent's own analysis."}
          </p>
        </div>
      </div>

      {sample.asked && (
        <div className="rounded-md border border-line bg-canvas-subtle p-3">
          <p className="text-meta text-ink-faint">The buyer asked</p>
          <p className="mt-1 text-body-s leading-relaxed text-ink-secondary">{sample.asked}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-md border border-line-strong p-4">
        {sample.title && <p className="font-serif text-title">{sample.title}</p>}
        {sample.raw ? (
          <pre className="overflow-x-auto whitespace-pre-wrap text-body-s leading-relaxed text-ink-secondary">{sample.raw.slice(0, 2000)}</pre>
        ) : (
          <dl className="flex flex-col gap-3 text-body-s">
            {sample.fields.map((field) => (
              <div key={field.label} className="flex flex-col gap-1">
                <dt className="text-meta font-medium uppercase tracking-wide text-ink-faint">{field.label}</dt>
                <dd className="text-ink-secondary">
                  <Value value={field.value} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-meta">
        <span className="flex items-center gap-1.5">
          <span className="text-ink-muted">Hash on chain</span>
          <CopyableId value={sample.manifestHash} label="Deliverable hash" display={shortHash(sample.manifestHash, 8)} />
        </span>
        <span role="status" className={check.data ? 'text-positive' : check.isError ? 'text-caution' : 'text-ink-faint'}>
          {check.isPending && 'Checking the bytes against the contract…'}
          {check.data === true && '✓ The bytes still match the hash the chain holds'}
          {check.data === false && 'The served bytes no longer match the chain'}
          {check.isError && (check.error instanceof Error ? check.error.message : 'Could not check against the chain')}
        </span>
        {sample.generatedAt && <span className="mono ml-auto text-ink-faint">{sample.generatedAt.slice(0, 16).replace('T', ' ')} UTC</span>}
      </div>
    </section>
  );
}
