'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

import { escrowMoney } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { useActiveWallet } from '@/lib/wallet/active';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { ProposalForm, type ProposalRequest } from './ProposalForm';

type Ctx = { canPropose: boolean; open: () => void };
const ProposalContext = createContext<Ctx>({ canPropose: false, open: () => {} });

/**
 * A request's page: the request and its proposals on the left, the
 * proposal being written on the right.
 *
 * A builder reads the terms while writing against them, so the form sits
 * beside the request rather than under its proposals. It is open from the
 * start on a wide screen, because answering is why a builder came; it can
 * be closed to read, and "Make a proposal" brings it back. On a phone the
 * same form opens as a sheet. The poster sees no form: nobody proposes to
 * their own request.
 */
export function RequestDetail({ request, taking, children }: { request: ProposalRequest; taking: boolean; children: ReactNode }) {
  const { address } = useActiveWallet();
  const isPoster = Boolean(address && address.toLowerCase() === request.poster.toLowerCase());
  const canPropose = taking && !isPoster;
  const [asideOpen, setAsideOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const showAside = canPropose && asideOpen;

  const open = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setAsideOpen(true);
      requestAnimationFrame(() => document.getElementById('make-proposal')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    } else {
      setSheetOpen(true);
    }
  };

  return (
    <ProposalContext.Provider value={{ canPropose, open }}>
      <div className={cn('mt-6 grid grid-cols-1 gap-10', showAside && 'lg:grid-cols-[minmax(0,1fr)_400px]')}>
        <div className="flex min-w-0 flex-col gap-10">{children}</div>
        {showAside && (
          <aside id="make-proposal" aria-labelledby="make-proposal-title" className="hidden h-fit rounded-[18px] border border-rule bg-raised p-6 shadow-lift lg:sticky lg:top-24 lg:block">
            <PanelHeader request={request} onClose={() => setAsideOpen(false)} />
            <ProposalForm request={request} />
          </aside>
        )}
      </div>
      {canPropose && (
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Make a proposal" description={`For ${request.title} · ${escrowMoney(request.chainId).real === false ? 'Testnet · test tokens' : 'BNB Chain · real $U'}`} className="lg:hidden">
          {sheetOpen && <ProposalForm request={request} />}
        </Sheet>
      )}
    </ProposalContext.Provider>
  );
}

function PanelHeader({ request, onClose }: { request: ProposalRequest; onClose: () => void }) {
  const money = escrowMoney(request.chainId);
  return (
    <div className="mb-6 flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 id="make-proposal-title" className="text-[22px] font-semibold tracking-[-0.02em]">
          Make a proposal
        </h2>
        <p className="truncate text-[14px] text-ink-2">For {request.title}</p>
        <span
          className={cn(
            'w-fit rounded-full px-2.5 py-0.5 text-[12px] font-medium',
            money.real === false ? 'bg-watch-wash text-watch' : 'bg-sunken text-ink-2',
          )}
        >
          {money.real === false ? 'Testnet · test tokens' : 'BNB Chain · real $U'}
        </span>
      </div>
      <button type="button" onClick={onClose} aria-label="Close the proposal form" className="grid size-8 shrink-0 place-items-center rounded-[8px] text-ink-3 hover:bg-sunken hover:text-ink">
        <Icon.Close size={16} />
      </button>
    </div>
  );
}

/** Beside the request's title; hidden for the poster and once proposals close. */
export function MakeProposalButton() {
  const { canPropose, open } = useContext(ProposalContext);
  if (!canPropose) return null;
  return (
    <Button onClick={open} icon={<Icon.Plus size={15} />}>
      Make a proposal
    </Button>
  );
}
