import { DEFAULT_BUDGET_LABEL } from '@/lib/erc8183/pricing';
import { chainLabel, escrowMoney } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import type { AgentProfile } from './profile';

export function priceSummary(p: AgentProfile) {
  if (p.quote) return { headline: p.quote.label, caption: p.quote.current ? 'Signed by the agent' : 'Last signed price expired · a fresh quote is signed when you hire', signed: true };
  if (p.suggestion) return { headline: p.suggestion.label, caption: 'Suggested budget · it has not signed a price', signed: false };
  return { headline: DEFAULT_BUDGET_LABEL, caption: 'Default budget · it has not signed a price', signed: false };
}

/**
 * Which money a hire spends, where a reader cannot miss it.
 *
 * The network was stated once, in the third of three grey 13px lines
 * below the price — accurate and easy to read past. It is the most
 * consequential fact on the page: "0.10 $U" is a real cost on one chain
 * and faucet currency on the other, and the number looks identical
 * either way. So it sits with the price, in colour.
 */
export function MoneyBadge({ chainId, className }: { chainId: number; className?: string }) {
  const money = escrowMoney(chainId);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 self-start rounded-full border px-2 py-0.5 text-[12px] font-semibold',
        money.real === false
          ? 'border-watch/40 bg-watch-wash text-watch'
          : money.real === true
            ? 'border-rule-strong bg-sunken text-ink'
            : 'border-rule-strong bg-sunken text-ink-2',
        className,
      )}
    >
      <Icon.Lock size={12} aria-hidden />
      {money.note}
    </span>
  );
}

/**
 * The sticky decision panel. It answers, in order: what will it cost, what
 * protects me, what could go wrong, and then offers the one action. The
 * warnings sit above the button, not below it.
 */
export function HirePanel({ profile }: { profile: AgentProfile }) {
  const price = priceSummary(profile);
  const hireHref = `/hire/${profile.chainId}/${profile.tokenId}`;
  // The escrow this agent is hired on, chosen from its signed price.
  const testnet = profile.escrow.chainId === 97;
  return (
    <aside aria-label="Hire this agent" className="flex flex-col overflow-hidden rounded-[16px] border border-rule bg-raised shadow-lift">
      <div className="flex flex-col gap-1 px-5 pb-4 pt-5">
        <span className="t-label">Price per job</span>
        <span className="t-readout text-[1.75rem] leading-tight tracking-[-0.03em]">{price.headline}</span>
        <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
          {price.signed && <Icon.Shield size={13} className="text-ok" />}
          {price.caption}
        </span>
        <MoneyBadge chainId={profile.escrow.chainId} className="mt-1.5" />
      </div>
      <ul className="flex flex-col gap-2.5 border-t border-rule px-5 py-4 text-[13px] text-ink-2">
        <li className="flex gap-2.5">
          <Icon.Lock size={16} className="mt-px shrink-0 text-ink-3" />
          Held in escrow on {chainLabel(profile.escrow.chainId)} until it delivers and you accept, or the review window passes.
        </li>
        <li className="flex gap-2.5">
          <Icon.Refresh size={16} className="mt-px shrink-0 text-ink-3" />
          Nothing delivered by the deadline: you reclaim the full amount.
        </li>
        <li className="flex gap-2.5">
          <Icon.Key size={16} className="mt-px shrink-0 text-ink-3" />
          No standing access to your wallet. One payment, one job.
        </li>
      </ul>
      {profile.warnings.length > 0 && (
        <div className="border-t border-rule bg-watch-wash/60 px-5 py-3.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-watch">
            <Icon.Alert size={15} /> Before you hire
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[12.5px] leading-snug text-ink-2">
            {profile.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-rule p-5">
        {profile.hireable ? (
          <LinkButton href={hireHref} intent="primary" size="l" className="w-full" trailing={<Icon.Arrow size={16} />}>
            Hire {profile.name.length > 22 ? 'this agent' : profile.name}
          </LinkButton>
        ) : (
          <p className="text-[13px] text-ink-2">Pokter cannot route a paid job to this agent: no reachable provider wallet was found.</p>
        )}
        {profile.escrowOptions.length > 1 && profile.escrowOptions.includes(97) && profile.escrow.chainId !== 97 && (
          <a href={`${hireHref}?escrow=97`} className="text-center text-[13px] font-medium text-ink-2 hover:text-ink">
            Or hire free on testnet
          </a>
        )}
        {/* A plain anchor: native hash navigation fires hashchange, which the tabs listen for. */}
        {profile.trialAvailable && (
          <a href="#try" className="text-center text-[13px] font-medium text-ink-2 hover:text-ink">
            Try it free first
          </a>
        )}
        <p className="pt-1 text-center text-[11.5px] text-ink-3">
          You review everything before any wallet opens.{testnet ? ' Test tokens only.' : ' Paid in real $U on BNB Chain.'}
        </p>
      </div>
    </aside>
  );
}

/** Phones get the decision as a bar at the thumb, above the tab bar. */
export function MobileHireBar({ profile }: { profile: AgentProfile }) {
  const price = priceSummary(profile);
  const money = escrowMoney(profile.escrow.chainId);
  if (!profile.hireable) return null;
  return (
    <div className={cn('fixed inset-x-0 bottom-[calc(56px+max(12px,env(safe-area-inset-bottom)))] z-30 border-t border-rule bg-[color-mix(in_oklab,var(--raised)_94%,transparent)] px-4 py-3 backdrop-blur-md lg:hidden')}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="flex items-baseline gap-1.5">
            <span className="t-readout text-[15px]">{price.headline}</span>
            {/* The "~" is a suggested budget, which the desktop panel says in its caption; say it here too. */}
            {!price.signed && <span className="text-[11.5px] text-ink-3">suggested, no signed price</span>}
          </span>
          {/*
            The bar showed a bare number and "Escrowed until delivered", so
            on a phone — where this is the primary call to action and the
            panel above is off screen — nothing said whether the amount was
            real. The money comes first; the warning count follows.
          */}
          <span className="truncate text-[11.5px]">
            <span className={money.real === false ? 'font-semibold text-watch' : 'font-semibold text-ink-2'}>
              {money.money ?? money.network}
            </span>
            <span className="text-ink-3">
              {' · '}
              {profile.warnings.length > 0
                ? `${profile.warnings.length} thing${profile.warnings.length > 1 ? 's' : ''} to know first`
                : `escrowed on ${money.network}`}
            </span>
          </span>
        </div>
        <LinkButton href={`/hire/${profile.chainId}/${profile.tokenId}`} intent="primary">
          Hire
        </LinkButton>
      </div>
    </div>
  );
}
