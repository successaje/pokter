import type { Metadata } from 'next';
import Link from 'next/link';

import { Doc, DocSection } from '@/features/content/Doc';
import { CORRECTIONS } from '@/lib/corrections/entries';
import { GITHUB_REPO_URL } from '@/lib/support/contact';

export const metadata: Metadata = {
  title: 'Where we were wrong',
  description: 'Every figure, label or rule Pokter published that turned out to be wrong: what it said, what was true, how it was found and what changed.',
};

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function CorrectionsPage() {
  return (
    <Doc
      label="Corrections"
      title="Where we were wrong"
      lede={
        <>
          A record of evidence is only worth trusting if its mistakes are on the record too. Every figure, label or rule Pokter published that turned out to be wrong is
          listed here: what it said, what was true, how it came to light and what changed. Newest first. If you find one we have not,{' '}
          <Link href="/support" className="link">tell us</Link>.
        </>
      }
    >
      <DocSection id="corrections" title={`${CORRECTIONS.length} corrections`}>
        <ol className="ruled border-y border-rule">
          {CORRECTIONS.map((c) => (
            <li key={`${c.date}-${c.title}`} className="flex flex-col gap-2 py-5 text-[14.5px]">
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span className="t-readout text-[12.5px] text-ink-3">{day(c.date)}</span>
                <span className="font-medium text-ink">{c.title}</span>
              </span>
              <p className="text-ink-2">
                <span className="text-ink-3">We said:</span> {c.said}
              </p>
              <p className="text-ink-2">
                <span className="text-ink-3">What was true:</span> {c.true}
              </p>
              <p className="text-[13px] text-ink-3">
                Found by: {c.found}
                {c.prs.length > 0 && (
                  <>
                    {' '}· Fixed in{' '}
                    {c.prs.map((n, i) => (
                      <span key={n}>
                        {i > 0 && ', '}
                        <a href={`${GITHUB_REPO_URL}/pull/${n}`} className="link" target="_blank" rel="noreferrer noopener">
                          #{n}
                        </a>
                      </span>
                    ))}
                  </>
                )}
              </p>
            </li>
          ))}
        </ol>
      </DocSection>
    </Doc>
  );
}
