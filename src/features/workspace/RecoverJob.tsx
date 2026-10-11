'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { HiredJob } from '@/lib/erc8183/types';
import { rememberJob } from '@/lib/wallet/activity';
import { useActiveWallet } from '@/lib/wallet/active';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Input } from '@/ui/Field';
import { jobHref } from '@/lib/jobs/href';
import { enabledEscrowChains } from '@/lib/network/escrow';

/**
 * Local memory is a convenience, not the record. A job funded from another
 * device, or before this browser's storage was cleared, is rebuilt from
 * the chain by its number, and only kept if this wallet funded it.
 */
export function RecoverJob({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const { address } = useActiveWallet();
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recover = async () => {
    setBusy(true);
    setError(null);
    try {
      /*
       * The same number can be a job on each escrow, so every escrow hires
       * are funded on is asked. The one this wallet funded wins; otherwise
       * the first Pokter job found.
       */
      const results = await Promise.all(
        enabledEscrowChains().map(async (chainId) => {
          const response = await fetch(`/api/jobs/${encodeURIComponent(id.trim())}?chain=${chainId}`, { cache: 'no-store' });
          const body = (await response.json().catch(() => ({}))) as { job?: HiredJob; client?: string; error?: string };
          return { status: response.status, ok: response.ok, body };
        }),
      );
      const found = results.filter((r) => r.ok && r.body.job);
      const mine = address ? found.find((r) => r.body.client?.toLowerCase() === address.toLowerCase()) : undefined;
      const body = (mine ?? found[0])?.body;
      if (!body?.job) {
        if (results.every((r) => r.status === 404)) throw new Error(`Job #${id} is not a Pokter job, or does not exist on any network Pokter uses.`);
        throw new Error(results.find((r) => !r.ok && r.status !== 404)?.body.error ?? 'The job could not be read from chain.');
      }
      if (address && body.client && body.client.toLowerCase() !== address.toLowerCase()) {
        throw new Error(`Job #${id} was funded by a different wallet. Connect that wallet to manage it.`);
      }
      if (address) rememberJob(address, body.job);
      router.push(jobHref(body.job));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {!compact && <p className="text-sm font-medium">Recover a job by its number</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^\d+$/.test(id.trim())) void recover();
        }}
      >
        <label htmlFor="recover-id" className="sr-only">
          Job number
        </label>
        <Input id="recover-id" inputMode="numeric" placeholder="Job number, e.g. 1392" value={id} onChange={(e) => setId(e.target.value.replace(/[^\d]/g, ''))} className="h-10 max-w-48" />
        <Button type="submit" intent="secondary" busy={busy} disabled={!id}>
          Recover
        </Button>
      </form>
      {error && <Notice tone="watch">{error}</Notice>}
    </div>
  );
}
