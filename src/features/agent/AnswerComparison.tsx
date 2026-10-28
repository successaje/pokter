import Link from 'next/link';
import { Fragment } from 'react';

import type { Comparison, ComparisonRow, Tone } from '@/lib/assay/comparison';
import { explorerBaseFor } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { Icon } from '@/ui/icons';

const DOT: Record<Tone, string> = { ok: 'bg-ok', watch: 'bg-watch', bad: 'bg-bad', none: 'bg-rule-strong' };
const BADGE: Record<Tone, string> = { ok: 'bg-ok-wash text-ink', watch: 'bg-watch-wash text-ink', bad: 'bg-bad-wash text-ink', none: 'bg-sunken text-ink-2' };

export const utc = (at: string) => `${new Date(at).toUTCString().slice(5, 22)} UTC`;

function Subject({ row }: { row: ComparisonRow }) {
  return row.account ? (
    <a href={`${explorerBaseFor(56)}/address/${row.account}`} target="_blank" rel="noreferrer noopener" className="t-readout link">
      {shortAddress(row.account)}
    </a>
  ) : (
    <span className="t-readout">{row.subject}</span>
  );
}

/* Where the reference came from, for one row: its block, when it was read, and the job that paid for the answer. */
function Provenance({ row, agentKey, chainRead }: { row: ComparisonRow; agentKey?: string; chainRead: boolean }) {
  const parts = [
    /* A fixed scenario reads nothing from the chain, so it has no block to name. */
    !chainRead ? null : row.block ? <span key="block">Block <span className="t-readout">{Number(row.block).toLocaleString('en-US')}</span></span> : <span key="block">Block not recorded</span>,
    row.readAt ? <span key="at">{chainRead ? 'read' : 'graded'} {utc(row.readAt)}</span> : null,
    row.jobId
      ? agentKey
        ? <Link key="job" href={`/proof?agent=${encodeURIComponent(agentKey)}`} className="hover:text-ink hover:underline">paid job <span className="t-readout">#{row.jobId}</span></Link>
        : <span key="job">paid job <span className="t-readout">#{row.jobId}</span></span>
      : null,
  ].filter(Boolean);
  return <p className="flex flex-wrap gap-x-1.5 text-[11.5px] text-ink-3">{parts.flatMap((part, i) => (i === 0 ? [part] : [<span key={`dot-${i}`} aria-hidden>·</span>, part]))}</p>;
}

function Result({ row }: { row: ComparisonRow }) {
  return <span className={cn('inline-block shrink-0 whitespace-nowrap rounded-[5px] px-1.5 py-px text-[11.5px] font-medium', BADGE[row.result.tone])}>{row.result.label}</span>;
}

/**
 * Everything a graded check compared, row by row: Pokter's reference, the
 * agent's answer, the difference and the result, with the network,
 * reference, tolerance and time the comparison was made under.
 */
export function AnswerComparison({ comparison: c, agentKey }: { comparison: Comparison; agentKey?: string }) {
  const facts = [
    { label: 'Network', value: c.network },
    { label: 'Reference', value: c.referenceSource },
    { label: 'Tolerance', value: c.tolerance },
    { label: 'Checked', value: `${c.method}, ${utc(c.checkedAt)}` },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="flex items-start gap-2 text-[13.5px] text-ink">
          <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', DOT[c.summary.tone])} aria-hidden />
          <span>{c.summary.text}</span>
        </p>
        <p className="pl-3.5 text-[12.5px] text-ink-3">{c.scope}</p>
      </div>

      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-[12px] border border-rule bg-rule sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.label} className="flex flex-col gap-0.5 bg-raised px-4 py-3">
            <dt className="text-[11.5px] uppercase tracking-wide text-ink-3">{fact.label}</dt>
            <dd className="text-[13px] leading-snug text-ink-2">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {/* Phone: one card per row, the four values side by side in pairs. */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {c.rows.map((row) => (
          <li key={row.key} className="flex flex-col gap-3 rounded-[12px] border border-rule bg-raised p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Subject row={row} />
                {row.task && <span className="text-[12px] leading-snug text-ink-3 [overflow-wrap:anywhere]">{row.task}</span>}
              </div>
              <Result row={row} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <div><dt className="text-[11.5px] text-ink-3">{c.referenceLabel}</dt><dd className="t-readout break-words">{row.reference}</dd></div>
              <div><dt className="text-[11.5px] text-ink-3">Agent’s answer</dt><dd className="t-readout break-words">{row.answer}</dd></div>
              <div className="col-span-2"><dt className="text-[11.5px] text-ink-3">Difference</dt><dd className="t-readout break-words">{row.difference}</dd></div>
            </dl>
            <p className="text-[12px] leading-snug text-ink-3">{row.reason}</p>
            <Provenance row={row} agentKey={agentKey} chainRead={c.kind !== 'scenario'} />
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-[12px] border border-rule sm:block">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="bg-sunken/60 text-[11.5px] uppercase tracking-wide text-ink-3">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">{c.kind === 'scenario' ? 'Scenario' : c.kind === 'health-factor' ? 'Venus position' : 'Position'}</th>
              <th scope="col" className="px-4 py-2.5 font-medium">{c.referenceLabel}</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Agent’s answer</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Difference</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Result</th>
            </tr>
          </thead>
          <tbody className="[&>tr:nth-child(odd):not(:first-child)]:border-t [&>tr]:border-rule">
            {c.rows.map((row) => (
              <Fragment key={row.key}>
                <tr className="align-top">
                  <td className="max-w-56 px-4 pb-1.5 pt-3">
                    <Subject row={row} />
                    {row.task && <p className="mt-0.5 text-[12px] leading-snug text-ink-3 [overflow-wrap:anywhere]">{row.task}</p>}
                  </td>
                  <td className="t-readout max-w-48 break-words px-4 pb-1.5 pt-3">{row.reference}</td>
                  <td className="t-readout max-w-48 break-words px-4 pb-1.5 pt-3">{row.answer}</td>
                  <td className="t-readout max-w-40 break-words px-4 pb-1.5 pt-3">{row.difference}</td>
                  <td className="px-4 pb-1.5 pt-3">
                    <Result row={row} />
                    <p className="mt-1 max-w-xs text-[12px] leading-snug text-ink-3">{row.reason}</p>
                  </td>
                </tr>
                {/* Where the reference came from, across the row rather than squeezed into its first cell. */}
                <tr className="border-t-0">
                  <td colSpan={5} className="px-4 pb-3 pt-0"><Provenance row={row} agentKey={agentKey} chainRead={c.kind !== 'scenario'} /></td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The same check in two lines for the overview: the result, when and how it
 * was graded, what it covers, and the full comparison one click away.
 */
export function AnswerCheckSummary({ label, comparison: c }: { label: string; comparison: Comparison }) {
  return (
    <a href="#answer-check" className="group flex flex-col gap-2 rounded-[14px] border border-rule bg-raised p-5 transition-colors hover:border-rule-strong">
      <span className="t-label">{label}</span>
      <p className="flex items-start gap-2 text-[14px] font-medium text-ink">
        <span className={cn('mt-2 size-1.5 shrink-0 rounded-full', DOT[c.summary.tone])} aria-hidden />
        <span>{c.summary.text}</span>
      </p>
      <p className="text-[12.5px] leading-relaxed text-ink-3">{c.method}, {utc(c.checkedAt)}. {c.scope}</p>
      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-ink group-hover:underline">
        See the full comparison <Icon.Arrow size={14} />
      </span>
    </a>
  );
}
