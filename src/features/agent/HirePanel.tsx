import { DEFAULT_BUDGET_LABEL } from '@/lib/erc8183/pricing';
import { IS_TESTNET, NETWORK_LABEL } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import type { AgentProfile } from './profile';

export function priceSummary(p: AgentProfile) {
  if (p.quote) return { headline: p.quote.label, caption: p.quote.current ? 'Signed by the agent' : 'Last signed price (expired)', signed: true };
  if (p.suggestion) return { headline: p.suggestion.label, caption: 'Suggested budget · it has not signed a price', signed: false };
  return { headline: DEFAULT_BUDGET_LABEL, caption: 'Default budget · it has not signed a price', signed: false };
}

/**
 * The sticky decision panel. It answers, in order: what will it cost, what
 * protects me, what could go wrong, and then offers the one action. The
 * warnings sit above the button, not below it.
 */
export function HirePanel({ profile }: { profile: AgentProfile }) {
  const price = priceSummary(profile);
  const hireHref = `/hire/${profile.chainId}/${profile.tokenId}`;
  return (
    <aside aria-label="Hire this agent" className="flex flex-col overflow-hidden rounded-[16px] border border-rule bg-raised shadow-lift">
      <div className="flex flex-col gap-1 px-5 pb-4 pt-5">
        <span className="t-label">Price per job</span>
        <span className="t-readout text-[1.75rem] leading-tight tracking-[-0.03em]">{price.headline}</span>
        <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
          {price.signed && <Icon.Shield size={13} className="text-ok" />}
          {price.caption}
        </span>
      </div>
      <ul className="flex flex-col gap-2.5 border-t border-rule px-5 py-4 text-[13px] text-ink-2">
        <li className="flex gap-2.5">
          <Icon.Lock size={16} className="mt-px shrink-0 text-ink-3" />
          Held in escrow on {NETWORK_LABEL}. The agent is paid only after it delivers and you accept, or the review window passes.
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
        {/* A plain anchor: native hash navigation fires hashchange, which the tabs listen for. */}
        {profile.trialAvailable && (
          <a href="#try" className="text-center text-[13px] font-medium text-ink-2 hover:text-ink">
            Try it free first
          </a>
        )}
        <p className="pt-1 text-center text-[11.5px] text-ink-3">
          You review everything before any wallet opens.{IS_TESTNET && ' Test tokens only.'}
        </p>
      </div>
    </aside>
  );
}

/** Phones get the decision as a bar at the thumb, above the tab bar. */
export function MobileHireBar({ profile }: { profile: AgentProfile }) {
  const price = priceSummary(profile);
  if (!profile.hireable) return null;
  return (
    <div className={cn('fixed inset-x-0 bottom-[calc(56px+max(12px,env(safe-area-inset-bottom)))] z-30 border-t border-rule bg-[color-mix(in_oklab,var(--raised)_94%,transparent)] px-4 py-3 backdrop-blur-md lg:hidden')}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="t-readout text-[15px]">{price.headline}</span>
          <span className="truncate text-[11.5px] text-ink-3">{profile.warnings.length > 0 ? `${profile.warnings.length} thing${profile.warnings.length > 1 ? 's' : ''} to know first` : 'Escrowed until delivered'}</span>
        </div>
        <LinkButton href={`/hire/${profile.chainId}/${profile.tokenId}`} intent="primary">
          Hire
        </LinkButton>
      </div>
    </div>
  );
}
