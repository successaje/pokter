'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button, LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';

/** Re-runs the server-side registry ownership check for the signed-in wallet. */
export function AgentRequired() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState(false);

  return <div className="rounded-[14px] border border-rule bg-raised p-5 sm:p-6">
    <h2 className="text-[17px] font-semibold">An agent is needed to publish a service</h2>
    <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
      Every service must be linked to an agent this wallet currently owns on BNB Mainnet or Testnet. Pokter could not verify one from the registry index just now.
    </p>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button size="s" intent="secondary" icon={<Icon.Refresh size={14} />} busy={pending} onClick={() => startTransition(() => { setChecked(true); router.refresh(); })}>
        Check wallet again
      </Button>
      <LinkButton href="/build/new" size="s" icon={<Icon.Plus size={14} />}>Create an agent</LinkButton>
    </div>
    <p className="mt-3 text-[12.5px] text-ink-3" aria-live="polite">
      {checked && !pending ? 'Still missing? ' : ''}Already registered an agent? <Link href="/build/import" className="font-medium text-ink underline underline-offset-2">Import it by ID</Link>. Newly registered agents may take a little time to appear in the index.
    </p>
  </div>;
}
