import {
  CHAIN_ID,
  NETWORK_LABEL,
} from '@/lib/network/presentation';

import { shortAddress } from '@/lib/ui/format';
import {
  type PermissionSummary,
} from '@/lib/altana/permissions';

/**
 * §31 / §96. What the agent may do, what it may not, and what it costs you.
 *
 * The denied list is the effective policy: Pokter creates no delegated key.
 * Required integrations are shown only so the missing argument constraints are
 * inspectable rather than hidden behind a generic "coming soon" label.
 */
export function PermissionReview({
  summary,
  isTestnet,
}: {
  summary: PermissionSummary;
  isTestnet: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      {isTestnet && (
        /* §39. Never blur testnet and mainnet. */
        <p className="rounded-[var(--radius)] border border-[color:var(--info)]/30 bg-[color:var(--info-dim)] px-3 py-2 text-[11px] text-[color:var(--info)]">
          {NETWORK_LABEL} (chain {CHAIN_ID}). Real transactions and real on-chain
          escrow, no real money.
        </p>
      )}

      {/*
        FE-02. This used to sit below the controls, so a visitor configured a
        spend cap and an expiry and only then learned that nothing would be
        created. The notice now comes first and reframes everything under it
        as a preview rather than a form — the controls stay visible because
        what a session *would* grant is the most useful thing on the page,
        but they no longer look like a decision waiting to be made.
      */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-5">
        <h3 className="text-base font-medium text-[color:var(--caution)]">
          Delegated access is paused
        </h3>
        <p className="text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
          {summary.delegationBlockedReason} Nothing below can be granted right
          now. You can still commission escrowed work in step 2, which pays for
          a single job and never touches your wallet&apos;s standing authority.
        </p>
        <p className="w-fit rounded-full border border-[color:var(--caution)]/40 px-3 py-1.5 text-[11px] font-medium text-[color:var(--caution)]">
          No wallet permission will be created
        </p>
      </section>

      <p className="text-[11px] uppercase tracking-widest text-[color:var(--text-faint)]">
        Safety boundary
      </p>

      <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
        <h3 className="border-b border-[color:var(--border)] px-4 py-3 text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          Effective wallet boundary
        </h3>

        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-[color:var(--positive)]">
              Standing authority
            </p>
            {summary.readOnly ? (
              <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                None needed. This task monitors and reports without wallet
                authority.
              </p>
            ) : (
              <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                None granted. Commissioning creates one escrowed job; it does
                not authorize the agent to call from your wallet.
              </p>
            )}
          </div>

          {summary.requiredIntegrations.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-[color:var(--border)] pt-4">
              <p className="text-xs font-medium text-[color:var(--text-muted)]">
                Future adapter would need
              </p>
              <ul className="flex flex-col gap-2">
                {summary.requiredIntegrations.map((contract) => (
                  <li key={contract.address} className="flex flex-col gap-0.5">
                    <span className="flex flex-wrap items-baseline gap-2 text-[12px]">
                      <span aria-hidden className="text-[color:var(--positive)]">
                        ✓
                      </span>
                      {contract.label}
                      <span className="mono text-[10px] text-[color:var(--text-faint)]">
                        {shortAddress(contract.address)}
                      </span>
                      {/*
                        How far the grant reaches, said on the row rather than
                        left to be inferred from a method count. "Scoped"
                        because the allowlist names specific functions on
                        specific contracts — not "low risk", which is a
                        judgement about outcomes we are in no position to make
                        on the user's behalf.
                      */}
                      <span className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">
                        Not granted · {contract.methods.length}{' '}
                        {contract.methods.length === 1 ? 'call' : 'calls'}
                      </span>
                    </span>
                    <span className="pl-5 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                      {contract.capability}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-[color:var(--border)] pt-4">
            <p className="text-xs font-medium text-[color:var(--negative)]">
              Agent cannot
            </p>
            <ul className="flex flex-col gap-1">
              {summary.denied.map((item) => (
                <li
                  key={item}
                  className="flex items-baseline gap-2 text-[11px] text-[color:var(--text-muted)]"
                >
                  <span aria-hidden className="text-[color:var(--negative)]">
                    ✕
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

    </div>
  );
}
