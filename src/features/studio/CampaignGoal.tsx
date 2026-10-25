import {
  BUILD_QUALIFICATION,
  CAMPAIGN_IS_SEPARATE,
  type QualificationVisibility,
} from '@/lib/campaign/build-qualification';
import { CAMPAIGN_RULES_URL } from '@/lib/campaign/window';
import { cn } from '@/lib/ui/cn';
import { Details } from '@/ui/Data';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

const SOURCE: Record<QualificationVisibility, { label: string; tone: string }> = {
  'pokter-verifies': { label: 'Pokter can check this', tone: 'text-ink-2' },
  'builder-declares': { label: 'Only you can confirm this', tone: 'text-ink-3' },
  'bnb-decides': { label: 'BNB Chain decides this', tone: 'text-ink-3' },
};

/**
 * Set and Earn as what it is: an optional extra goal, folded shut.
 *
 * It sits below readiness and is closed by default, because the common
 * case is a builder who wants an agent people hire and has no campaign
 * entry in mind — and a campaign checklist opened in their face reads as
 * part of the work. Opening it is the opt-in.
 *
 * Nothing in here feeds the readiness ladder, and the first thing it says
 * is why: a read-only reporting agent can finish every milestone, be
 * hired and be paid, and will never satisfy the campaign's on-chain
 * execution requirements. Telling such a builder to add trading so they
 * can enter would be Pokter selling them a risk it does not carry.
 */
export function CampaignGoal({ summary = 'I also want to enter Set and Earn' }: { summary?: string }) {
  return (
    <Details summary={summary}>
      <div className="flex flex-col gap-4">
        <Notice tone="neutral" icon={<Icon.Info size={15} />} title="A separate goal, not a higher bar">
          {CAMPAIGN_IS_SEPARATE}
        </Notice>

        <div className="flex flex-col gap-1">
          <p className="text-[13px] leading-relaxed text-ink-2">
            These are BNB Chain&rsquo;s requirements for a build entry, not Pokter&rsquo;s.{' '}
            <a href={CAMPAIGN_RULES_URL} target="_blank" rel="noreferrer noopener" className="link">
              Read the official rules
            </a>{' '}
            before relying on this list; BNB Chain&rsquo;s decision on qualification is final.
          </p>
        </div>

        <ol className="ruled rounded-[12px] border border-rule bg-raised px-4">
          {BUILD_QUALIFICATION.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border',
                  item.reachableByReadOnlyAgent ? 'border-rule-strong text-ink-3' : 'border-watch/50 text-watch',
                )}
              >
                {item.reachableByReadOnlyAgent ? <Icon.Dash size={11} /> : <Icon.Alert size={11} />}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-[13px] font-medium">{item.requirement}</p>
                <p className="text-[12.5px] leading-relaxed text-ink-3">{item.note}</p>
                <p className={cn('text-[11.5px]', SOURCE[item.visibility].tone)}>{SOURCE[item.visibility].label}</p>
                {!item.reachableByReadOnlyAgent && (
                  <p className="text-[11.5px] leading-relaxed text-watch">
                    An agent that only reads and reports cannot meet this one. That does not make it a worse agent.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>

        <p className="text-[12px] leading-relaxed text-ink-3">
          Pokter counts no hire it funds, no hire you fund, and none of its own lifecycle tests as independent customer
          activity — here or anywhere else it reports numbers. Adoption against the campaign&rsquo;s own targets is tracked
          under Adoption on this page.
        </p>
      </div>
    </Details>
  );
}
