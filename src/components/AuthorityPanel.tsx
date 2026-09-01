import type { ScanAgentDetail } from '@/lib/scan/types';

interface Disclosure {
  label: string;
  value: string;
  /** True when this item is something the user should weigh before delegating. */
  caution?: boolean;
}

/**
 * What hiring this agent would actually grant it.
 *
 * The registry does not publish a machine-readable permission scope, so this
 * panel states what is known and is explicit about what is not. Saying "the
 * registry does not disclose this" is more useful than implying a safety that
 * has not been verified.
 */
export function AuthorityPanel({ agent }: { agent: ScanAgentDetail }) {
  const disclosures: Disclosure[] = [
    {
      label: 'Agent wallet',
      value: agent.agent_wallet ?? 'Not published',
      caution: !agent.agent_wallet,
    },
    {
      label: 'Owner',
      value: agent.owner_ens ?? agent.owner_address,
    },
    {
      label: 'Identity verified by registry',
      value: agent.is_verified ? 'Yes' : 'No — identity is self-asserted',
      caution: !agent.is_verified,
    },
    {
      label: 'Takes payment (x402)',
      value: agent.x402_supported ? 'Yes' : 'No',
    },
    {
      label: 'Token approvals it would require',
      value: 'Not disclosed by the registry — confirm in your wallet at signing time',
      caution: true,
    },
    {
      label: 'Spend ceiling',
      value: 'Not disclosed by the registry — set your own limit at approval',
      caution: true,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col divide-y divide-[color:var(--border)] rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
        {disclosures.map((item) => (
          <div
            key={item.label}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 p-3.5"
          >
            <dt className="text-xs text-[color:var(--text-muted)]">{item.label}</dt>
            <dd
              className="tabular max-w-full break-all text-right text-[11px]"
              style={{ color: item.caution ? 'var(--caution)' : 'var(--text)' }}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-[11px] leading-relaxed text-[color:var(--text-faint)]">
        Proving Ground never holds your funds and never signs on your behalf. Any
        approval an agent needs is granted by you, in your own wallet, and can be
        revoked there.
      </p>
    </div>
  );
}
