'use client';

import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';
import { shortAddress, shortHash } from '@/lib/ui/format';
import { explorerAddressUrl, explorerBaseFor, explorerTxUrl } from '@/lib/network/presentation';
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

/**
 * Copies a value and confirms in place, without a toast. A denied clipboard
 * says so (it used to do nothing), and the state is announced to screen
 * readers as well as shown.
 */
export function CopyButton({
  value,
  label = 'Copy',
  className,
  children,
}: {
  value: string;
  label?: string;
  className?: string;
  /**
   * Visible text beside the icon. Without it the button stays the square
   * icon every table row and code block uses, where a word would be five
   * more of them down a column; with it the button can carry its own
   * label where it is the step's only action and has room to say so.
   */
  children?: ReactNode;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const said = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed: select the text instead' : label;
  return (
    <button
      type="button"
      onClick={async () => {
        let ok = true;
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          ok = false;
        }
        setState(ok ? 'copied' : 'failed');
        window.setTimeout(() => setState('idle'), ok ? 1400 : 2400);
      }}
      className={cn(
        'rounded-[6px] text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink',
        children ? 'inline-flex items-center gap-2' : 'inline-grid size-7 place-items-center',
        state === 'failed' && 'text-watch',
        className,
      )}
      aria-label={children ? undefined : said}
      title={said}
    >
      {state === 'copied' ? <Icon.Check size={15} /> : state === 'failed' ? <Icon.Alert size={15} /> : <Icon.Copy size={15} />}
      {children && <span>{state === 'copied' ? 'Copied' : children}</span>}
      <span className="sr-only" aria-live="polite">{state === 'idle' ? '' : said}</span>
    </button>
  );
}

/** A code sample with a copy control. Copies exactly the text shown. */
export function CodeBlock({ children, wrap = false, label = 'Copy code' }: { children: string; wrap?: boolean; label?: string }) {
  return (
    <div className="relative">
      <pre className={cn(wrap ? 'whitespace-pre-wrap break-all' : 'overflow-x-auto', 'rounded-[10px] border border-rule bg-sunken p-4 pr-12 text-[12.5px] leading-relaxed text-ink')}>{children}</pre>
      <CopyButton value={children} label={label} className="absolute right-2 top-2 bg-sunken" />
    </div>
  );
}

/** An address shown human-first: short form, copy, and an explorer link. */
export function Address({ address, chainExplorer = true, className, chainId }: { address: string; chainExplorer?: boolean; className?: string; chainId?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      <span className="t-readout text-[13px]" title={address}>
        {shortAddress(address)}
      </span>
      <CopyButton value={address} label="Copy address" />
      {chainExplorer && (
        <a
          href={chainId === undefined ? explorerAddressUrl(address) : `${explorerBaseFor(chainId)}/address/${address}`}
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

/** `chainId` when the transaction is not on the site's default network, such as a job funded on another escrow. */
export function TxLink({ hash, label, className, chainId }: { hash: string; label?: string; className?: string; chainId?: number }) {
  return (
    <a
      href={chainId === undefined ? explorerTxUrl(hash) : `${explorerBaseFor(chainId)}/tx/${hash}`}
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
