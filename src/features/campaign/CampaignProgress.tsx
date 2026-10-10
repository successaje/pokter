'use client';

import { useSyncExternalStore } from 'react';

import { summarizeCampaignHires } from '@/lib/campaign/progress';
import { registrationKey, subscribeToRegistration, REGISTRATION_EVENT } from '@/lib/campaign/registration';
import { useMyJobs } from '@/features/workspace/hooks';
import { useActiveWallet } from '@/lib/wallet/active';
import { Notice } from '@/ui/Feedback';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { cn } from '@/lib/ui/cn';
import { Button, LinkButton } from '@/ui/Button';
import { Checkbox } from '@/ui/Field';
import { Icon } from '@/ui/icons';

/**
 * The part of the hire track Pokter can see: hires funded through Pokter
 * from this wallet. The other marketplace and BNB Chain's own registration
 * are outside Pokter's view, so they are asked about, not asserted.
 */
export function CampaignProgress() {
  const { jobs, address } = useMyJobs();
  const { openConnect } = useConnect();
  const { mode } = useActiveWallet();
  const registered = useSyncExternalStore(
    subscribeToRegistration,
    () => (address ? window.localStorage.getItem(registrationKey(address)) === 'yes' : false),
    () => false,
  );
  if (!address) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[14px] border border-rule bg-raised p-5">
        <p className="text-sm text-ink-2">Connect the wallet you registered for the campaign to see your hires through Pokter.</p>
        <Button onClick={() => openConnect('to see your campaign progress')} size="s">
          Connect a wallet
        </Button>
      </div>
    );
  }
  const s = summarizeCampaignHires(jobs);
  const tasks = [
    { done: registered, label: 'Registered this wallet with BNB Chain', note: 'You do this on BNB Chain’s campaign page. Pokter cannot see it.', toggle: true },
    { done: s.distinctAgents >= 1, label: 'Hired one agent through Pokter', note: `${s.distinctAgents} distinct agent${s.distinctAgents === 1 ? '' : 's'} hired here` },
    { done: s.distinctAgents >= 3, label: 'Hired three different agents', note: 'Across at least two shortlisted marketplaces; Pokter counts its own.' },
  ];
  return (
    <div className="flex flex-col gap-4 rounded-[14px] border border-rule bg-raised p-5">
      {mode === 'passkey' && (
        <Notice tone="watch" title="This is a passkey wallet">
          It only works on Pokter, so it cannot be your campaign wallet across two marketplaces. Connect the browser or mobile wallet you registered.
        </Notice>
      )}
      <ul className="ruled">
        {tasks.map((t) => (
          <li key={t.label} className="flex items-start gap-3 py-3">
            <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full', t.done ? 'bg-ok text-paper' : 'border border-rule-strong text-ink-3')}>{t.done ? <Icon.Check size={13} /> : <Icon.Dash size={12} />}</span>
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-medium">{t.label}</span>
              <span className="text-[12.5px] text-ink-3">{t.note}</span>
              {t.toggle && (
                <Checkbox
                  className="mt-2"
                  checked={registered}
                  onChange={(e) => {
                    try {
                      window.localStorage.setItem(registrationKey(address), e.target.checked ? 'yes' : 'no');
                      window.dispatchEvent(new Event(REGISTRATION_EVENT));
                    } catch {
                      /* Remembered for this page only. */
                    }
                  }}
                  label="I have registered"
                />
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-ink-3">A hire counts once its escrow is funded on chain. BNB Chain decides eligibility after the campaign closes, from on-chain data only.</p>
      <LinkButton href="/discover?hireable=1" size="s" className="self-start" trailing={<Icon.Arrow size={14} />}>
        Find a hireable agent
      </LinkButton>
    </div>
  );
}
