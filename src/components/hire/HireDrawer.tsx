'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import { Drawer } from '@/components/ui/Drawer';
import { setHireOpen, useHireOpen } from './hire-open';
import { HireFlow } from './HireFlow';
import type { HireAgent, ProviderChoice } from './useHire';

/** The hire step, as a drawer over the agent page. `?hire=1` opens it on arrival. */
export function HireDrawer(props: { agent: HireAgent; providers: ProviderChoice[]; signedQuoteU: number | null; riskWarnings: string[] }) {
  const open = useHireOpen();
  const params = useSearchParams();
  useEffect(() => {
    if (params.get('hire') === '1') setHireOpen(true);
  }, [params]);
  useEffect(() => {
    if (open) document.body.setAttribute('data-flow-bar', '');
    else document.body.removeAttribute('data-flow-bar');
    return () => document.body.removeAttribute('data-flow-bar');
  }, [open]);
  return (
    <Drawer open={open} onClose={() => setHireOpen(false)} title={`Hire ${props.agent.name}`} description="One job, paid into escrow, released when you accept the work.">
      {open && <HireFlow {...props} onClose={() => setHireOpen(false)} />}
    </Drawer>
  );
}

/** Any button that opens the drawer. */
export function HireButton({ children, className, variant = 'primary', block = false, size }: { children: React.ReactNode; className?: string; variant?: 'primary' | 'secondary' | 'caution'; block?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const base = 'tap inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:opacity-50';
  const look = variant === 'primary' ? 'bg-brand text-brand-ink hover:bg-brand-hover' : variant === 'caution' ? 'border border-caution/45 bg-caution-dim text-caution' : 'border border-line-strong text-ink hover:bg-surface-hover';
  const sizing = size === 'sm' ? 'min-h-9 px-3 text-small' : size === 'lg' ? 'min-h-12 px-5 text-body-s' : 'min-h-10 px-4 text-body-s';
  return (
    <button type="button" onClick={() => setHireOpen(true)} className={[base, look, sizing, block ? 'w-full' : '', className ?? ''].join(' ')}>
      {children}
    </button>
  );
}
