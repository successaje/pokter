'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { HiredJob } from '@/lib/erc8183/types';
import { rememberJob } from '@/lib/wallet/activity';
import { useActiveWallet } from '@/lib/wallet/active';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Input } from '@/ui/Field';

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
      const response = await fetch(`/api/jobs/${encodeURIComponent(id.trim())}`, { cache: 'no-store' });
      const body = (await response.json().catch(() => ({}))) as { job?: HiredJob; client?: string; error?: string };
      if (response.status === 404) throw new Error(`Job #${id} is not a Pokter job, or does not exist on this network.`);
      if (!response.ok || !body.job) throw new Error(body.error ?? 'The job could not be read from chain.');
      if (address && body.client && body.client.toLowerCase() !== address.toLowerCase()) {
        throw new Error(`Job #${id} was funded by a different wallet. Connect that wallet to manage it.`);
      }
      if (address) rememberJob(address, body.job);
      router.push(`/workspace/jobs/${body.job.jobId}`);
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
