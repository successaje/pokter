'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { recallBrief } from '@/lib/hire/brief-memory';
import type { CurrencyEvidence } from '@/lib/hire/currency-choice';
import type { ProviderChoice } from '@/lib/hire/useHire';
import { deliversItself } from './delivery';
import { HireFlow, type HireFlowProps } from './HireFlow';

/** Everything about a hire that depends on which escrow funds it. */
export interface HireNetwork {
  chainId: number;
  escrow: HireFlowProps['escrow'];
  providers: ProviderChoice[];
  signedQuoteU: number | null;
  lastSignedU: number | null;
  /** The currency of the listing's last signed price, so the page can name its money before a fresh quote. */
  quoteCurrency?: string | null;
  /** The currencies Pokter has seen this agent quote or be funded in, on this network. */
  currencyEvidence?: CurrencyEvidence[];
  suggestedU: number | null;
  warnings: string[];
  /** The agent's own registration on this chain, hired there instead of through Pokter's relay. */
  handoff?: { chainId: number; tokenId: string };
}

type Shared = Omit<HireFlowProps, keyof Omit<HireNetwork, 'chainId'> | 'escrowOptions' | 'network'>;

/**
 * The hire form with its network switch, switched in place.
 *
 * The switch was a link to `?escrow=`. On the full page that reloaded the
 * route, slowly; in the sheet the intercepted route never re-rendered at
 * all, so the address said testnet while the button, the provider and the
 * price stayed on BNB Chain — and a refresh would have funded the other
 * network. Every network's terms are loaded with the page, so a switch
 * changes all of them in one render.
 *
 * The form is keyed on the network, so nothing chosen for one chain (a
 * provider, a signed quote) carries to the other. The brief does: it is
 * remembered per agent (`brief-memory`) and recalled when the form mounts.
 * The address is replaced, not pushed, so a refresh or a shared link opens
 * the same network and Back still closes the hire.
 */
export function HireNetworks({ networks, initialChainId, initialTask, ...shared }: Shared & { networks: HireNetwork[]; initialChainId: number }) {
  const [chainId, setChainId] = useState(initialChainId);
  /* The link's brief seeds the first form only; after a switch the form recalls the brief as the buyer left it. */
  const [linkTask, setLinkTask] = useState(initialTask ?? null);
  const router = useRouter();
  const current = networks.find((n) => n.chainId === chainId) ?? networks[0];
  /*
   * Handing over to another registration loads another page, which takes
   * seconds while its terms are read. It ran with no sign of it: the switch
   * stayed where it was until the page arrived, and a second click raced the
   * first. The target says it is switching, and nothing else is chosen meanwhile.
   */
  const [switching, startSwitch] = useTransition();
  const [target, setTarget] = useState<number | null>(null);

  const choose = (next: number) => {
    if (switching || next === current.chainId || !networks.some((n) => n.chainId === next)) return;
    const handoff = networks.find((n) => n.chainId === next)?.handoff;
    if (handoff) {
      /* Another registration is another page; the brief goes with the buyer. */
      const task = recallBrief(shared.agent)?.task ?? linkTask ?? '';
      setTarget(next);
      startSwitch(() => router.replace(`/hire/${handoff.chainId}/${handoff.tokenId}?escrow=${next}${task.trim() ? `&task=${encodeURIComponent(task)}` : ''}`));
      return;
    }
    setChainId(next);
    setLinkTask(null);
    const url = new URL(window.location.href);
    url.searchParams.set('escrow', String(next));
    window.history.replaceState(null, '', url);
  };

  return (
    <HireFlow
      key={current.chainId}
      {...shared}
      initialTask={linkTask}
      escrow={current.escrow}
      providers={current.providers}
      signedQuoteU={current.signedQuoteU}
      lastSignedU={current.lastSignedU}
      quoteCurrency={current.quoteCurrency ?? null}
      currencyEvidence={current.currencyEvidence ?? []}
      suggestedU={current.suggestedU}
      warnings={current.warnings}
      escrowOptions={networks.map((n) => n.chainId)}
      network={{
        options: networks.map((n) => ({ chainId: n.chainId, deliveredByAgent: Boolean(n.handoff) || deliversItself(n.providers) })),
        onChange: choose,
        switchingTo: switching ? target : null,
      }}
    />
  );
}
