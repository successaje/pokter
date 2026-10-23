'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { CompareRow } from '@/lib/hire/compare-quotes';
import { cn } from '@/lib/ui/cn';
import { formatDelivery } from '@/lib/ui/format';
import { Button, LinkButton } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

/**
 * One brief, the top few agents, one signed price from each, side by side.
 *
 * Opened by the buyer, never on its own: each row is a real request to that
 * agent's builder. A row shows a price only when the agent signed it over
 * this exact brief; otherwise what it needs or why it would not quote.
 */
export function ManyQuotes({ task, agents }: { task: string; agents: Array<{ chainId: number; tokenId: string; name: string }> }) {
  const [rows, setRows] = useState<CompareRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (agents.length < 2) return null;

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/hire/quotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task, agents: agents.map(({ chainId, tokenId }) => ({ chainId, tokenId })) }),
      });
      const body = (await response.json().catch(() => ({}))) as { rows?: CompareRow[]; error?: string };
      if (!response.ok || !body.rows) throw new Error(body.error ?? 'The comparison did not come back. Try again.');
      setRows(body.rows);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="many-quotes-title" className="mb-6 flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="many-quotes-title" className="text-[15px] font-semibold">
            Compare signed prices for this brief
          </h2>
          <p className="text-[13px] text-ink-3">
            Pokter sends “{task.length > 80 ? `${task.slice(0, 79)}…` : task}” to {agents.map((a) => a.name).join(', ')}. Free; nothing is funded.
          </p>
        </div>
        {!rows && (
          <Button size="s" onClick={() => void ask()} busy={busy}>
            Ask {agents.length === 3 ? 'all three' : `these ${agents.length}`}
          </Button>
        )}
      </div>
      {busy && <p className="text-[12.5px] text-ink-3">Asking each agent at once. The slowest takes up to twelve seconds.</p>}
      {error && <Notice tone="bad">{error}</Notice>}
      {rows && (
        <ul className="ruled">
          {rows.map((row) => (
            <li key={`${row.chainId}:${row.tokenId}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link href={`/agents/${row.chainId}/${row.tokenId}`} className="truncate text-[14px] font-medium hover:underline">
                  {row.name}
                </Link>
                {row.state === 'priced' && row.price ? (
                  <span className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-ink-3">
                    <span className="t-readout text-[16px] text-ink">{row.price.label}</span>
                    <span className={cn(row.price.real ? 'text-ink-3' : 'font-medium text-watch')}>{row.price.network}</span>
                    <span>· signed for this brief</span>
                    {row.deliveryMs !== null && <span>· delivers in about {formatDelivery(row.deliveryMs)}</span>}
                  </span>
                ) : row.state === 'needs-input' ? (
                  <span className="text-[12.5px] text-ink-2">Needs {row.missing.map((m) => m.label.toLowerCase()).join(', ')} before it can price this.</span>
                ) : (
                  <span className="text-[12.5px] text-ink-3">{row.reason}</span>
                )}
              </div>
              {row.state === 'priced' ? (
                <LinkButton href={row.hireUrl} size="s" className="shrink-0 self-start sm:self-auto" trailing={<Icon.Arrow size={14} />}>
                  Hire
                </LinkButton>
              ) : row.state === 'needs-input' ? (
                <LinkButton href={row.hireUrl} size="s" intent="secondary" className="shrink-0 self-start sm:self-auto">
                  Answer and hire
                </LinkButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
