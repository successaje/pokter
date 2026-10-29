'use client';

import { useSyncExternalStore } from 'react';

import type { CampaignCheck } from '@/lib/campaign/check-state';
import { summarizeCampaignHires } from '@/lib/campaign/progress';
import { registrationKey, subscribeToRegistration, REGISTRATION_EVENT } from '@/lib/campaign/registration';
import { useMyJobs } from '@/features/workspace/hooks';
import { useActiveWallet } from '@/lib/wallet/active';
import { Notice } from '@/ui/Feedback';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { Button, LinkButton } from '@/ui/Button';
import { Checkbox } from '@/ui/Field';
import { Icon } from '@/ui/icons';
import { CheckMark, CheckWords } from './CheckMark';

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
  /* Registration is the participant's word, never a tick; hires here are read from the chain (`check-state.ts`). */
  const tasks: Array<{ state: CampaignCheck; label: string; note: string; toggle?: boolean }> = [
    {
      state: registered ? 'cannot-verify' : 'not-yet',
      label: 'Registered this wallet with BNB Chain',
      note: registered ? 'Marked by you. Pokter can’t see BNB Chain’s form, so it can’t verify this.' : 'You do this on BNB Chain’s campaign page. Pokter cannot see it.',
      toggle: true,
    },
    { state: s.distinctAgents >= 1 ? 'verified' : 'not-yet', label: 'Hired one agent through Pokter', note: `${s.distinctAgents} distinct agent${s.distinctAgents === 1 ? '' : 's'} hired here` },
    {
      state: s.distinctAgents >= 3 ? 'verified' : 'not-yet',
      label: 'Hired three different agents through Pokter',
      note: 'The hire track also needs a second marketplace. The tracker below checks every marketplace that uses BNB Chain’s escrow.',
    },
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
            <CheckMark state={t.state} className="mt-0.5" />
            <span className="flex flex-1 flex-col">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{t.label}</span>
                <CheckWords state={t.state} />
              </span>
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
      <div className="flex flex-wrap gap-2">
        <LinkButton href={`/quest?address=${address}`} size="s" trailing={<Icon.Arrow size={14} />}>
          Your hires across marketplaces
        </LinkButton>
        <LinkButton href="/discover?hireable=1" size="s" intent="secondary">
          Find a hireable agent
        </LinkButton>
      </div>
    </div>
  );
}
