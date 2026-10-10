'use client';

import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';
import { shortAddress, shortHash } from '@/lib/ui/format';
import { explorerAddressUrl, explorerTxUrl } from '@/lib/network/presentation';
import { Icon } from './icons';

/**
 * A readout: a specimen label over a value. The value is monospace and
 * tabular so columns of them align.
 */
export function Readout({
  label,
  value,
  note,
  className,
  muted,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="t-label">{label}</span>
      <span className={cn('t-readout text-lg leading-tight', muted ? 'text-ink-3' : 'text-ink')}>{value}</span>
      {note && <span className="text-[12.5px] leading-snug text-ink-3">{note}</span>}
    </div>
  );
}

/** Copies a value and confirms in place, without a toast. */
export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          /* Clipboard denied: the value is still visible to select. */
        }
      }}
      className={cn('inline-grid size-7 place-items-center rounded-[6px] text-ink-3 transition-colors hover:bg-sunken hover:text-ink', className)}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
    >
      {copied ? <Icon.Check size={15} /> : <Icon.Copy size={15} />}
    </button>
  );
}

/** An address shown human-first: short form, copy, and an explorer link. */
export function Address({ address, chainExplorer = true, className }: { address: string; chainExplorer?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      <span className="t-readout text-[13px]" title={address}>
        {shortAddress(address)}
      </span>
      <CopyButton value={address} label="Copy address" />
      {chainExplorer && (
        <a
          href={explorerAddressUrl(address)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-grid size-7 place-items-center rounded-[6px] text-ink-3 hover:bg-sunken hover:text-ink"
          aria-label="Open address in block explorer"
        >
          <Icon.External size={14} />
        </a>
      )}
    </span>
  );
}

export function TxLink({ hash, label, className }: { hash: string; label?: string; className?: string }) {
  return (
    <a
      href={explorerTxUrl(hash)}
      target="_blank"
      rel="noreferrer noopener"
      className={cn('inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink', className)}
    >
      <span className="t-readout link">{label ?? shortHash(hash)}</span>
      <Icon.ArrowUpRight size={13} />
    </a>
  );
}

/** Progressive disclosure for technical detail: one interaction away. */
export function Details({ summary, children, className, defaultOpen }: { summary: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  return (
    <details className={cn('group', className)} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
        <Icon.ChevronRight size={14} className="transition-transform duration-200 group-open:rotate-90" />
        {summary}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

/** Key/value rows separated by hairlines. */
export function Facts({ rows, className }: { rows: Array<{ label: ReactNode; value: ReactNode; hint?: ReactNode }>; className?: string }) {
  return (
    <dl className={cn('ruled text-sm', className)}>
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] items-baseline gap-4 py-2.5">
          <dt className="text-ink-3">
            {row.label}
            {row.hint && <span className="mt-0.5 block text-[12px] leading-snug">{row.hint}</span>}
          </dt>
          <dd className="min-w-0 break-words text-right text-ink sm:text-left">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
