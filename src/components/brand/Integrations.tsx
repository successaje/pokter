import Image from 'next/image';

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

export function Integrations() {
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
                <span className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
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
