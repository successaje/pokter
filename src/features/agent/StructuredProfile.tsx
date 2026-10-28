import Link from 'next/link';
import type { ReactNode } from 'react';

import { jobEvidencePath } from '@/lib/jobs/evidence-view';

import type { Said, StructuredProfile as Structured } from './structured';

const BY: Record<Said, string> = {
  operator: 'The operator’s words, not checked by Pokter',
  agent: 'The agent’s words',
  pokter: 'Measured by Pokter',
  buyer: 'A buyer’s brief',
};

function Row({ label, by, children }: { label: string; by?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 border-t border-rule px-5 py-4 first:border-t-0 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-5">
      <div className="flex flex-col gap-0.5">
        <span className="t-label">{label}</span>
        {by && <span className="text-[11.5px] text-ink-3">{by}</span>}
      </div>
      <div className="min-w-0 text-[14px] leading-relaxed">{children}</div>
    </div>
  );
}

const Missing = ({ children }: { children: ReactNode }) => <p className="text-ink-3">{children}</p>;

/**
 * The profile as five answers, each labelled with who gave it.
 *
 * Built by `structuredProfile` from the card and the deliveries; a section
 * with nothing behind it says so rather than being left out, so a reader
 * can tell "not published" from "not shown".
 */
export function StructuredProfile({ s, sampleAnchor, onChain }: { s: Structured; sampleAnchor: string; onChain?: { kind: 'acts' | 'claims' | 'advises'; text: string } | null }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-rule bg-raised">
      <Row label="What it does" by={s.does.text ? BY.operator : undefined}>
        {s.does.text ? <p className="whitespace-pre-line break-words text-ink-2">{s.does.text}</p> : <Missing>The operator has not published a description.</Missing>}
      </Row>

      {/* Whether it does the work or only advises on it: read from its own wallet, not taken from its description. */}
      <Row label="On chain" by={onChain ? BY.pokter : undefined}>
        {onChain ? (
          <p className={onChain.kind === 'acts' ? 'text-ok' : onChain.kind === 'claims' ? 'text-watch' : 'text-ink-2'}>{onChain.text}.</p>
        ) : (
          <Missing>Its wallet has not been read yet, so Pokter cannot say whether it acts on chain or only advises.</Missing>
        )}
      </Row>

      <Row label="What to send">
        {s.send.example || s.send.answered ? (
          <div className="flex flex-col gap-3">
            {s.send.example && (
              <div>
                <p className="text-[11.5px] text-ink-3">Example brief, from its card</p>
                <p className="mt-1 break-words rounded-[8px] bg-sunken px-3 py-2 text-[13.5px] text-ink-2">{s.send.example.text}</p>
              </div>
            )}
            {s.send.answered && (
              <div>
                <p className="text-[11.5px] text-ink-3">
                  A brief it answered, job <span className="t-readout">#{s.send.answered.jobId}</span>
                </p>
                <p className="mt-1 break-words rounded-[8px] bg-sunken px-3 py-2 text-[13.5px] text-ink-2">{s.send.answered.text}</p>
              </div>
            )}
          </div>
        ) : (
          <Missing>This agent publishes no example brief, and has not answered a paid brief through Pokter.</Missing>
        )}
      </Row>

      <Row label="What you get back" by={s.back.result ? BY.agent : undefined}>
        {s.back.result ? (
          <div className="flex flex-col gap-1.5">
            <p className="break-words text-ink-2">{s.back.result}</p>
            <p className="text-[12px] text-ink-3">
              From job <span className="t-readout">#{s.back.jobId}</span>
              {s.back.relayed ? ', carried to it by Pokter’s delivery agent and shown unchanged' : ''}.{' '}
              <a href={`#${sampleAnchor}`} className="font-medium text-ink-2 hover:text-ink hover:underline">
                See the whole delivery
              </a>
            </p>
          </div>
        ) : s.back.lifecycleOnly ? (
          <Missing>No answer yet. Its only delivery was a lifecycle demonstration, which Pokter&rsquo;s seller submitted, so it shows nothing about the agent&rsquo;s work.</Missing>
        ) : s.back.jobId ? (
          <Missing>
            It delivered job <span className="t-readout">#{s.back.jobId}</span>, but the file states no result Pokter can summarise.{' '}
            <a href={`#${sampleAnchor}`} className="font-medium text-ink-2 hover:text-ink hover:underline">
              See the delivery
            </a>
          </Missing>
        ) : s.back.delivered > 0 ? (
          /*
           * Delivered, but nothing Pokter may show: no sample is not no
           * delivery. Two reasons, both said: an outside buyer's answer is
           * shown only once the buyer publishes it (`answerIsPublic`), and
           * any answer only once it matches its hash. The newest delivery's
           * evidence is one click away either way.
           */
          <Missing>
            No published sample yet. It has delivered {s.back.delivered === 1 ? 'a paid job' : `${s.back.delivered} paid jobs`} through Pokter. An outside buyer&rsquo;s answer appears here only once the buyer publishes it, and any answer only once it matches its hash on chain.{' '}
            {s.back.latest && (
              <Link href={jobEvidencePath({ chainId: s.back.latest.chainId, jobId: s.back.latest.jobId })} className="font-medium text-ink-2 hover:text-ink hover:underline">
                The newest delivery&rsquo;s evidence
              </Link>
            )}
          </Missing>
        ) : (
          <Missing>It has not delivered a paid job through Pokter yet, so there is no real sample to show.</Missing>
        )}
      </Row>

      <Row label="Good for" by={s.goodFor.skills.length > 0 || s.goodFor.category?.declared ? 'Declared by the operator' : undefined}>
        {s.goodFor.skills.length > 0 || s.goodFor.category ? (
          <div className="flex flex-col gap-2">
            {s.goodFor.skills.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {s.goodFor.skills.map((name) => (
                  <li key={name} className="rounded-full border border-rule px-2.5 py-0.5 text-[12.5px] text-ink-2">
                    {name}
                  </li>
                ))}
              </ul>
            )}
            {s.goodFor.category && (
              <p className="text-[12.5px] text-ink-3">
                Listed under {s.goodFor.category.label.toLowerCase()}
                {s.goodFor.category.declared ? ', the category its operator declared.' : ', where Pokter placed it.'}
              </p>
            )}
          </div>
        ) : (
          <Missing>It declares no skills and sits in no category.</Missing>
        )}
      </Row>

      <Row label="Limits">
        {s.limits.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {s.limits.map((line) => (
              <li key={line.text} className="flex flex-col gap-0.5">
                <span className="break-words text-ink-2">{line.text}</span>
                <span className="text-[11.5px] text-ink-3">{BY[line.by]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Missing>The agent states no limits, and Pokter has recorded none. That is not the same as having none.</Missing>
        )}
      </Row>
    </div>
  );
}
