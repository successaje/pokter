'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { recallBrief } from '@/lib/hire/brief-memory';
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

  const choose = (next: number) => {
    if (next === current.chainId || !networks.some((n) => n.chainId === next)) return;
    const handoff = networks.find((n) => n.chainId === next)?.handoff;
    if (handoff) {
      /* Another registration is another page; the brief goes with the buyer. */
      const task = recallBrief(shared.agent)?.task ?? linkTask ?? '';
      router.replace(`/hire/${handoff.chainId}/${handoff.tokenId}?escrow=${next}${task.trim() ? `&task=${encodeURIComponent(task)}` : ''}`);
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
      suggestedU={current.suggestedU}
      warnings={current.warnings}
      escrowOptions={networks.map((n) => n.chainId)}
      network={{
        options: networks.map((n) => ({ chainId: n.chainId, deliveredByAgent: Boolean(n.handoff) || deliversItself(n.providers) })),
        onChange: choose,
      }}
    />
  );
}
