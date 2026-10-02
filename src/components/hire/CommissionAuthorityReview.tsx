import { shortAddress } from '@/lib/ui/format';
import type { CommissionAuthority } from '@/lib/hire/commission-authority';
import { formatBudget } from '@/lib/erc8183/pricing';

export function CommissionAuthorityReview({ authority }: { authority: CommissionAuthority }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]" aria-labelledby="commission-authority-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-4 py-3">
        <div><p className="mono text-[8px] uppercase tracking-[0.15em] text-[color:var(--brand-strong)]">Authority review</p><h3 id="commission-authority-title" className="mt-1 text-[12px] font-semibold">One job, one exact budget, no wallet session</h3></div>
        <span className="rounded-full bg-[color:var(--positive-dim)] px-2 py-1 text-[9px] font-semibold text-[color:var(--positive)]">No standing access</span>
      </div>
      <dl className="grid gap-px bg-[color:var(--border)] text-[10px] sm:grid-cols-2">
        <div className="bg-[color:var(--surface)] p-3"><dt className="text-[color:var(--text-faint)]">Maximum token amount</dt><dd className="mt-1 font-semibold">{formatBudget(authority.budgetU)}</dd></div>
        <div className="bg-[color:var(--surface)] p-3"><dt className="text-[color:var(--text-faint)]">Delivery window</dt><dd className="mt-1 font-semibold">{authority.deliveryWindowHours} hours</dd></div>
        <div className="bg-[color:var(--surface)] p-3"><dt className="text-[color:var(--text-faint)]">Payment token</dt><dd className="mono mt-1" title={authority.paymentToken}>{shortAddress(authority.paymentToken)}</dd></div>
        <div className="bg-[color:var(--surface)] p-3"><dt className="text-[color:var(--text-faint)]">Approved escrow</dt><dd className="mono mt-1" title={authority.escrowContract}>{shortAddress(authority.escrowContract)}</dd></div>
      </dl>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div><p className="text-[10px] font-semibold text-[color:var(--positive)]">What is allowed</p><ul className="mt-2 flex flex-col gap-1.5 text-[12px] leading-4 text-[color:var(--text-secondary)]"><li>✓ Approve at most the displayed $U budget</li><li>✓ Fund this single ERC-8183 job</li><li>✓ Withdraw an unused approval after a failed attempt</li></ul></div>
        <div><p className="text-[10px] font-semibold text-[color:var(--negative)]">What is not allowed</p><ul className="mt-2 flex flex-col gap-1.5 text-[12px] leading-4 text-[color:var(--text-secondary)]">{authority.prohibited.map((item) => <li key={item}>✕ {item}</li>)}</ul></div>
      </div>
      <p className="border-t border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-4 py-3 text-[9px] leading-4 text-[color:var(--text-muted)]">Your wallet may show separate create, register, approve and fund prompts when atomic batching is unavailable. Every prompt remains part of this one-job sequence.</p>
    </section>
  );
}

