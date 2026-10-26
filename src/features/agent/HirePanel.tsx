import Link from 'next/link';
import { DEFAULT_BUDGET_LABEL } from '@/lib/erc8183/pricing';
import { chainLabel, escrowMoney } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { NetworkRow } from '@/ui/Network';
import { PAYMENT_TERMS } from '@/lib/erc8183/payment-terms';
import type { AgentProfile } from './profile';
import { mainnetHireBlocked } from '@/lib/hire/mainnet-blocked';
import { defaultHireToken, escrowMoney as tokenMoney, paymentTokenAt } from '@/lib/network/tokens';

export function priceSummary(p: AgentProfile) {
  if (p.quote) return { headline: p.quote.label, caption: p.quote.current ? 'Signed by the agent' : 'Last signed price expired · a fresh quote is signed when you hire', signed: true };
  if (p.suggestion) return { headline: p.suggestion.label, caption: 'Suggested budget · it has not signed a price', signed: false };
  return { headline: DEFAULT_BUDGET_LABEL, caption: 'Default budget · it has not signed a price', signed: false };
}

/**
 * The money a hire from this panel is funded in, as one sentence.
 *
 * It read "Paid in real $U on BNB Chain" for every agent, including the one
 * that signs in USDT — a buyer holding only $U would learn otherwise at the
 * wallet. A hire is funded in the token the agent signed, so that is what
 * is named. $U is named only where it is true: no signed price, so the hire
 * is a $U budget the buyer sets. A price signed on another chain (the
 * testnet trial of a mainnet-priced agent) is not the money spent here, so
 * it is not named as if it were.
 */
export function hireMoneySentence(p: Pick<AgentProfile, 'quote' | 'escrow'>): string {
  const chainId = p.escrow.chainId;
  if (p.quote) {
    const token = p.quote.settlementChainId === chainId ? paymentTokenAt(chainId, p.quote.currency) : null;
    if (token) return `Paid in ${tokenMoney(chainId, token)}.`;
    return chainId === 97 ? 'Test tokens only.' : 'Its signed price is not in a token this escrow funds.';
  }
  const budget = defaultHireToken(chainId);
  return budget ? `Paid in ${tokenMoney(chainId, budget)}.` : 'Test tokens only.';
}

/*
 * Which money a hire spends sits with the price, as the network row
 * (`NetworkRow`): "0.10 $U" is a real cost on one chain and faucet
 * currency on the other, and the number looks identical either way.
 */

/**
 * The sticky decision panel. It answers, in order: what will it cost, what
 * protects me, what could go wrong, and then offers the one action. The
 * warnings sit above the button, not below it.
 */
export function HirePanel({ profile }: { profile: AgentProfile }) {
  const price = priceSummary(profile);
  const hireHref = `/hire/${profile.chainId}/${profile.tokenId}`;
  const blocked = mainnetHireBlocked(profile);
  /*
   * Nowhere to send a brief at all: no endpoint, or a card naming no
   * interface. Neither a paid hire nor a testnet trial can reach it, since
   * the trial carries the brief to the same place, so no button leads
   * there. A missing negotiate skill is not this: a trial can still reach
   * a card that offers other skills. Nor is a card Pokter could not read
   * (`card-unreadable`), which is a failed check and not a fact about the
   * agent — withdrawing the buttons over one would hide a working agent.
   */
  const unreachable = profile.hireBlocker?.code === 'no-endpoint' && !profile.hireBlocker.transient;
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
      <NetworkRow chainId={profile.escrow.chainId} className="border-t border-rule px-5 py-3" />
      <ul className="flex flex-col gap-2.5 border-t border-rule px-5 py-4 text-[13px] text-ink-2">
        <li className="flex gap-2.5">
          <Icon.Lock size={16} className="mt-px shrink-0 text-ink-3" />
          On {chainLabel(profile.escrow.chainId)}. {PAYMENT_TERMS.held}
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
      {/*
        Why it cannot be priced, from the latest sweep: said where its owner
        looks, with the part of the integration kit that explains the fix.
      */}
      {profile.hireBlocker && (
        <div className="border-t border-rule px-5 py-3.5">
          {/* A check that did not run is not a price that failed, so it is not headed as one. */}
          <p className="mb-1 text-[13px] font-semibold text-ink">
            {profile.hireBlocker.code === 'card-unreadable'
              ? 'Pokter could not check this one'
              : profile.hireBlocker.transient
                ? 'Could not be priced at the last check'
                : 'Why it cannot be priced'}
          </p>
          <p className="text-[12.5px] leading-snug text-ink-2">{profile.hireBlocker.reason}</p>
          <p className="mt-1.5 text-[12px] text-ink-3">
            Is this your agent? <Link href={profile.hireBlocker.fix.href} className="link">{profile.hireBlocker.fix.label}</Link> explains the fix.
            {profile.hireBlocker.observedAt ? ` Checked ${new Date(profile.hireBlocker.observedAt).toUTCString().slice(5, 22)} UTC.` : ''}
          </p>
        </div>
      )}
      {profile.warnings.length > 0 && (
        /* Folded so the price and the hire button stay together; the
           heading keeps the count and the warning colour, so closing it
           never hides that there is something to read. */
        <details className="group border-t border-rule bg-watch-wash/60 px-5 py-3.5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-watch [&::-webkit-details-marker]:hidden">
            <Icon.Alert size={15} /> Before you hire
            <span className="font-normal text-ink-2">
              · {profile.warnings.length} {profile.warnings.length === 1 ? 'thing' : 'things'} to know
            </span>
            <Icon.ChevronRight size={14} className="ml-auto text-ink-3 transition-transform duration-200 group-open:rotate-90" />
          </summary>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[12.5px] leading-snug text-ink-2">
            {profile.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex flex-col gap-2 border-t border-rule p-5">
        {unreachable ? (
          /*
           * Said for all three `no-endpoint` cases, so it claims only what
           * they share. An MCP-only agent is one of them: it was told
           * "nothing can be sent to this agent" and that it becomes hireable
           * "when its operator connects a running agent", while Pokter was
           * probing it over MCP and this same page was listing its MCP tools.
           */
          <p className="text-[13px] text-ink-2">Both a paid hire and the free trial carry the brief over A2A, and there is nowhere to send it, so neither can complete. The reason above is what has to change.</p>
        ) : profile.hireable && blocked ? (
          /* A known reason the hire cannot complete: no purchase button that leads to it. */
          <p className="text-[13px] text-ink-2">A paid job on {chainLabel(56)} cannot complete until the reason above is fixed, because the escrow needs the agent&rsquo;s signed price.</p>
        ) : profile.hireable ? (
          <LinkButton href={hireHref} intent="primary" size="l" className="w-full" trailing={<Icon.Arrow size={16} />}>
            Hire {profile.name.length > 22 ? 'this agent' : profile.name}
          </LinkButton>
        ) : (
          <p className="text-[13px] text-ink-2">{profile.testnetRelay && profile.escrowOptions.length === 0 ? profile.testnetRelay.note : 'Pokter cannot route a paid job to this agent: no reachable provider wallet was found.'}</p>
        )}
        {!unreachable && profile.escrowOptions.length > 1 && profile.escrowOptions.includes(97) && profile.escrow.chainId !== 97 && (
          blocked ? (
            <LinkButton href={`${hireHref}?escrow=97`} intent="secondary" className="w-full">
              Try free on testnet instead
            </LinkButton>
          ) : (
            <a href={`${hireHref}?escrow=97`} className="text-center text-[13px] font-medium text-ink-2 hover:text-ink">
              Or hire free on testnet
            </a>
          )
        )}
        {profile.testnetRelay && profile.escrowOptions.length > 0 && (
          <p className="text-center text-[12px] leading-snug text-ink-3">
            {profile.testnetRelay.status === 'unknown' ? 'Testnet: Pokter is checking that this agent answers relayed briefs. Try again in a minute.' : 'Not offered on testnet: it does not answer a brief Pokter relays to it.'}
          </p>
        )}
        {/* A plain anchor: native hash navigation fires hashchange, which the tabs listen for. */}
        {!unreachable && profile.trialAvailable && (
          <a href="#try" className="text-center text-[13px] font-medium text-ink-2 hover:text-ink">
            Try it free first
          </a>
        )}
        <p className="pt-1 text-center text-[11.5px] text-ink-3">
          You review everything before any wallet opens. {hireMoneySentence(profile)}
        </p>
      </div>
    </aside>
  );
}

/** Phones get the decision as a bar at the thumb, above the tab bar. */
export function MobileHireBar({ profile }: { profile: AgentProfile }) {
  const price = priceSummary(profile);
  const money = escrowMoney(profile.escrow.chainId);
  if (!profile.hireable || mainnetHireBlocked(profile)) return null;
  return (
    <div data-hire-bar className={cn('fixed inset-x-0 bottom-[calc(56px+max(12px,env(safe-area-inset-bottom)))] z-30 border-t border-rule bg-[color-mix(in_oklab,var(--raised)_94%,transparent)] px-4 py-3 backdrop-blur-md lg:hidden')}>
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
