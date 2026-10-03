import Image from 'next/image';

import {
  CHAIN_ID,
  NETWORK_LABEL,
  chainLabel,
} from '@/lib/network/presentation';
import { LISTED_CHAINS } from '@/lib/marketplace';

/**
 * What the product is built on.
 *
 * Marks are the organisations' own, taken from their sites. Where one is not
 * published at a conventional path we render a typographic wordmark instead of
 * approximating a logo — an invented mark misrepresents a brand, and looks it.
 */
interface Integration {
  name: string;
  role: string;
  href: string;
  /** Path under /public, when the organisation publishes a mark. */
  mark?: string;
}

const INTEGRATIONS: Integration[] = [
  {
    name: 'BNB Chain',
    role: 'Chain and registry',
    href: 'https://www.bnbchain.org/',
    mark: '/integrations/bnbchain.ico',
  },
  {
    name: '8004scan',
    role: 'Agent discovery and reputation data',
    href: 'https://8004scan.io/',
    mark: '/integrations/scan8004.ico',
  },
  {
    name: 'Altana',
    role: 'Scoped wallet sessions',
    href: 'https://docs.altana.network/',
  },
  {
    name: 'TermiX',
    role: 'Agent performance benchmarking',
    href: 'https://app.termix.ai/',
  },
  {
    name: 'PancakeSwap',
    role: 'Allowlisted execution venue',
    href: 'https://pancakeswap.finance/',
    mark: '/integrations/pancakeswap.ico',
  },
];

/** "A (chain 56) and B (chain 97)", however many chains are listed. */
function listChains(): string {
  const named = LISTED_CHAINS.map((id) => `${chainLabel(id)} (chain ${id})`);
  if (named.length < 2) return named[0] ?? '';
  return `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
}

export function Integrations() {
  const registryChains = listChains();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          Built on
        </p>
        <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Every integration below is wired to something real. Where one has
          limits, they are written up with the errors they produced rather than
          quietly dropped.
        </p>
        {/*
          Every chain here is read rather than written out. Escrow's chain is
          set by ALTANA_NETWORK and the registry side comes from the same
          LISTED_CHAINS the catalogue is built from, so this paragraph cannot
          drift from what Pokter actually indexes — it said identities were
          read from mainnet alone for as long as chain 97 had been listed.
        */}
        <p className="max-w-2xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Identity is read from the ERC-8004 registry on {registryChains}.
          Escrow settles on {NETWORK_LABEL} (chain {CHAIN_ID}), so an agent
          registered away from that chain cannot see the job it was hired for
          and Pokter’s own seller delivers those. The mainnet registry is the
          real one; the money is not yet.
        </p>
      </div>

      <ul className="grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--border)] sm:grid-cols-2 lg:grid-cols-5">
        {INTEGRATIONS.map((integration) => (
          <li key={integration.name} className="bg-[color:var(--surface)]">
            <a
              href={integration.href}
              target="_blank"
              rel="noreferrer noopener"
              className="flex h-full flex-col gap-2.5 p-4 transition-colors hover:bg-[color:var(--surface-hover)]"
            >
              <span className="flex h-7 items-center">
                {integration.mark ? (
                  <Image
                    src={integration.mark}
                    alt=""
                    width={24}
                    height={24}
                    className="size-6 rounded"
                    unoptimized
                  />
                ) : (
                  <span className="flex size-6 items-center justify-center rounded border border-[color:var(--border-strong)] text-[11px] font-semibold">
                    {integration.name.charAt(0)}
                  </span>
                )}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium">{integration.name}</span>
                <span className="text-[12px] leading-relaxed text-[color:var(--text-faint)]">
                  {integration.role}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
