import type { ReactNode } from 'react';

import type { BriefContent } from '@/lib/briefs/model';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { escrowMoney } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';

/**
 * A request's terms, laid out the way a builder reads them.
 *
 * One component for the request's own page and for the poster's preview
 * before publishing, so "this is exactly what builders will see" is true
 * by construction rather than by two layouts kept in step.
 */
export function RequestTerms({
  content,
  byline,
  heading: Heading = 'h1',
  className,
}: {
  content: BriefContent;
  byline?: ReactNode;
  /** h2 where the page already has its own title, as the poster's preview does. */
  heading?: 'h1' | 'h2';
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-8', className)}>
      <header className="flex flex-col gap-3">
        <Heading className="t-h1 break-words">{content.title || 'Untitled request'}</Heading>
        <RequestFacts content={content} />
        {byline && <p className="text-[13px] text-ink-3">{byline}</p>}
      </header>

      <section aria-labelledby="brief-title">
        <h2 id="brief-title" className="t-label mb-3">What is needed</h2>
        <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-ink-2">{content.brief}</p>
      </section>

      {content.acceptance.length > 0 && (
        <section aria-labelledby="accept-title">
          <h2 id="accept-title" className="t-label mb-3">Done when</h2>
          <ul className="ruled text-[14px]">
            {content.acceptance.map((line, i) => (
              <li key={`${i}:${line}`} className="flex gap-3 py-2.5">
                <Icon.Check size={15} className="mt-0.5 shrink-0 text-ok" />
                <span className="break-words">{line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.failSignals.length > 0 && (
        <section aria-labelledby="fail-title">
          {/* Kept apart from the criteria above: one says what to produce
              and the other what will be read as wrong. A delivery can
              meet every criterion and still trip one of these. */}
          <h2 id="fail-title" className="t-label mb-3">Rejected if</h2>
          <ul className="ruled text-[14px]">
            {content.failSignals.map((line, i) => (
              <li key={`${i}:${line}`} className="flex gap-3 py-2.5 text-ink-2">
                <Icon.Close size={15} className="mt-0.5 shrink-0 text-watch" />
                <span className="break-words">{line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Budget, delivery, network and closing date: the four things a builder prices against. */
export function RequestFacts({ content }: { content: Pick<BriefContent, 'budgetU' | 'deliverDays' | 'chainId' | 'closesAt'> }) {
  const money = escrowMoney(content.chainId);
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-rule bg-rule sm:grid-cols-4">
      <Fact label="Proposed budget">
        <span className="t-readout text-[15px] text-ink">{content.budgetU > 0 ? formatQuotedPrice(content.budgetU) : '—'}</span>
      </Fact>
      <Fact label="Delivery">{content.deliverDays === 1 ? '1 day after hiring' : `${content.deliverDays} days after hiring`}</Fact>
      <Fact label="Network">
        <span className="flex flex-col">
          <span>{money.network}</span>
          {money.money && <span className={cn('text-[12px]', money.real === false ? 'font-medium text-watch' : 'text-ink-3')}>{money.money}</span>}
        </span>
      </Fact>
      <Fact label="Proposals close">{content.closesAt ? closingDate(content.closesAt) : 'When one is chosen'}</Fact>
    </dl>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-raised px-4 py-3">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="text-[13.5px] font-medium text-ink">{children}</dd>
    </div>
  );
}

export function closingDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
