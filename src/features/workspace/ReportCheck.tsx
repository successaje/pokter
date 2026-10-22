'use client';

import { useQuery } from '@tanstack/react-query';

import type { CheckedValue, ReportVerdict, VenusReportVerification } from '@/lib/delivery/venus-report-check';
import type { HiredJob } from '@/lib/erc8183/types';
import { localMoment } from '@/lib/time/local-moment';
import { cn } from '@/lib/ui/cn';
import { Details } from '@/ui/Data';
import { Notice, Skeleton } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

/**
 * Pokter's own check of a delivered Venus health-factor report, for the
 * buyer holding it.
 *
 * The job page used to end the answer with "Pokter shows it as delivered
 * and has not checked that it is right", which was honest and useless: the
 * one question a buyer has at that moment is whether the number is true,
 * and the marketplace was declining to answer it while selling evidence as
 * its product. This answers it where it can and says so plainly where it
 * cannot.
 *
 * Three states and no fourth. Nothing here is a button: the check decides
 * nothing about the escrow, and the release and dispute controls further
 * down the page are untouched by it. What a match does and does not mean is
 * printed on the page rather than linked, because a verdict read as
 * "Pokter says this agent is fine" would do more harm than no verdict.
 */

type CheckResponse =
  | { applies: false; reason: string }
  | { applies: true; means: string[]; doesNotMean: string[]; verification: VenusReportVerification };

const TONE: Record<ReportVerdict, { wrap: string; text: string; icon: 'check' | 'alert' | 'info' }> = {
  matches: { wrap: 'border-[color-mix(in_oklab,var(--ok)_30%,transparent)] bg-ok-wash', text: 'text-ok', icon: 'check' },
  differs: { wrap: 'border-[color-mix(in_oklab,var(--bad)_30%,transparent)] bg-bad-wash', text: 'text-bad', icon: 'alert' },
  unverified: { wrap: 'border-rule bg-sunken', text: 'text-ink-3', icon: 'info' },
};

/**
 * Agreement as a shape as well as a colour, so the rows survive greyscale
 * and colour blindness — the same rule the evidence glyphs follow. A dash
 * is "not compared", which is a statement about the check and not about the
 * report, and must not read as a failure.
 */
function Agreement({ agrees }: { agrees: boolean | null }) {
  if (agrees === null) return <Icon.Dash size={14} className="shrink-0 text-ink-3" aria-label="not compared" />;
  return agrees ? <Icon.Check size={14} className="shrink-0 text-ok" aria-label="agrees" /> : <Icon.Cross size={14} className="shrink-0 text-bad" aria-label="does not agree" />;
}

/**
 * One checked figure, as a row on a desktop and a small stack on a phone.
 *
 * Values are printed as the verifier formatted them. The component never
 * serialises anything itself: a buyer deciding whether to release escrow
 * should not have to read JSON to find out what was compared.
 */
function ValueRow({ value }: { value: CheckedValue }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-baseline">
      <span className="text-[13px] font-medium text-ink">{value.label}</span>
      <span className="flex items-baseline gap-2 text-[13px] sm:block">
        <span className="t-label sm:hidden">The report</span>
        <span className="t-readout text-ink-2">{value.reported}</span>
      </span>
      <span className="flex items-baseline gap-2 text-[13px] sm:block">
        <span className="t-label sm:hidden">Venus</span>
        <span className="t-readout text-ink">{value.checked}</span>
      </span>
      <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3 sm:justify-end">
        <Agreement agrees={value.agrees} />
        <span className="sm:hidden">{value.agrees === null ? 'not compared' : value.agrees ? 'agrees' : 'does not agree'}</span>
      </span>
      {value.note && <p className="text-[12px] leading-snug text-ink-3 sm:col-span-4">{value.note}</p>}
    </div>
  );
}

function Lines({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Details summary={label}>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-ink-2">
        {items.map((item) => (
          <li key={item} className="break-words">
            {item}
          </li>
        ))}
      </ul>
    </Details>
  );
}

export function ReportCheck({ job }: { job: HiredJob }) {
  const query = useQuery({
    queryKey: ['report-check', job.chainId, job.jobId, job.status],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<CheckResponse> => {
      const response = await fetch(`/api/jobs/${job.jobId}/report-check?chain=${job.chainId}`);
      const body = (await response.json().catch(() => ({}))) as CheckResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'The check could not be run.');
      return body;
    },
  });

  if (query.isPending) {
    return (
      <section className="flex flex-col gap-3 rounded-[16px] border border-rule bg-raised p-5 sm:p-6" aria-busy="true" aria-label="Checking the report against the chain">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full" />
      </section>
    );
  }

  /*
   * Pokter failing to run its own check is "could not verify", in the same
   * words as every other way of not seeing. Rendering an error here as a
   * red box next to the delivery would put the appearance of a finding
   * against an agent that has done nothing wrong.
   */
  if (query.isError) {
    return (
      <section aria-labelledby="report-check-title" className="flex flex-col gap-3 rounded-[16px] border border-rule bg-raised p-5 sm:p-6">
        <h2 id="report-check-title" className="t-h3">
          Pokter’s check of these figures
        </h2>
        <Notice tone="neutral" title="Could not verify">
          {(query.error as Error).message} That is a gap in what Pokter could read, not a finding about the report.
        </Notice>
      </section>
    );
  }

  const data = query.data;
  if (!data || !data.applies) return null;

  const { verification: v, means, doesNotMean } = data;
  const tone = TONE[v.verdict];
  const Glyph = tone.icon === 'check' ? Icon.Check : tone.icon === 'alert' ? Icon.Alert : Icon.Info;

  return (
    <section aria-labelledby="report-check-title" className="flex flex-col gap-4 rounded-[16px] border border-rule bg-raised p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="report-check-title" className="t-h3">
          Pokter’s check of these figures
        </h2>
        <p className="text-[13px] text-ink-3">
          Recomputed from Venus’s own contracts on BNB Chain, at the block the report names. Advisory only — it changes nothing about your escrow.
        </p>
      </div>

      <div className={cn('flex flex-col gap-2 rounded-[12px] border px-4 py-3.5', tone.wrap)}>
        <p className={cn('flex items-center gap-2 text-[15px] font-semibold', tone.text)}>
          <Glyph size={16} className="shrink-0" />
          {v.headline}
        </p>
        <p className="text-[13.5px] leading-relaxed text-ink-2">{v.detail}</p>
        {v.block && (
          <p className="text-[12.5px] text-ink-3">
            Block <span className="t-readout">{v.block}</span>
            {/* `localMoment` takes epoch seconds; the check carries the block time as ISO text. */}
            {v.blockTime ? ` · mined ${localMoment(Date.parse(v.blockTime) / 1000)}` : ''}
          </p>
        )}
      </div>

      {v.values.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-rule pb-1.5 sm:grid">
            <span className="t-label">Figure</span>
            <span className="t-label">The report said</span>
            <span className="t-label">Venus says</span>
            <span className="t-label text-right">Agrees</span>
          </div>
          <div className="ruled">
            {v.values.map((value) => (
              <ValueRow key={value.label} value={value} />
            ))}
          </div>
        </div>
      )}

      {/*
        What the verdict means, printed and not linked.

        On a match this is the part most likely to be over-read, so it is
        open rather than behind a disclosure: a buyer should not be able to
        take "Matches checked facts" as Pokter vouching for the report, the
        agent or the trade.
      */}
      {v.verdict === 'matches' && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-rule bg-paper px-4 py-3">
          <span className="t-label">What this means, and what it does not</span>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-ink-2">
            {[...means, ...doesNotMean].map((line) => (
              <li key={line} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <Lines label="How the health factor was computed" items={v.method} />
        <Lines label="What counts as agreement" items={v.tolerance} />
        {v.evidence.length > 0 && <Lines label="Where the checked figures came from" items={v.evidence} />}
        <Lines label="What this check does not cover" items={v.limitations} />
        {v.verdict !== 'matches' && <Lines label="What a match would and would not mean" items={[...means, ...doesNotMean]} />}
      </div>
    </section>
  );
}
