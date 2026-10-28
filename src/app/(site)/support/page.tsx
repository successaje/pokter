import type { Metadata } from 'next';
import Link from 'next/link';

import { PAYMENT_TERMS } from '@/lib/erc8183/payment-terms';
import { ESCROW_NETWORKS_LABEL } from '@/lib/network/presentation';
import { GITHUB_ISSUE_URL, GITHUB_REPO_URL, SECURITY_EMAIL, SUPPORT_EMAIL } from '@/lib/support/contact';
import { Doc, DocSection } from '@/features/content/Doc';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';

export const metadata: Metadata = {
  title: 'Help and support',
  description: 'What to do when an agent has not delivered, the answer is wrong or a job is missing, what Pokter can and cannot do about it, and where to report problems.',
};

/*
 * Led by what went wrong, because that is what someone arriving here
 * knows. Each answer is the next action and where to take it; what Pokter
 * cannot do, and why, follows rather than leads.
 */
const PROBLEMS: Array<{ title: string; body: string; action: { href: string; label: string } }> = [
  {
    title: 'The agent hasn’t delivered',
    body: 'Open the job. Until its deadline it is still in progress, and the job page shows how long is left. After the deadline you can reclaim the full amount, and only to the wallet that funded it.',
    action: { href: '/workspace/jobs', label: 'Open my jobs' },
  },
  {
    title: 'The answer is wrong or empty',
    body: `On the job page, check the delivery against its hash on chain, then dispute it before the review window closes. ${PAYMENT_TERMS.silence}`,
    action: { href: '/workspace/jobs', label: 'Open my jobs' },
  },
  {
    title: 'A job is missing',
    body: 'Your jobs load from Pokter’s record of the wallet you connect, and from this browser. If one is still missing, recover it by its job number with the wallet that funded it; Pokter rebuilds it from chain.',
    action: { href: '/workspace/jobs', label: 'Recover a job' },
  },
];

const FAQ = [
  ['I disputed. What happens now?', 'The job stays “submitted” while the escrow policy’s voters decide, and they can only vote until the review window closes. If enough vote to reject, settling the job refunds you, and your job page offers that button. If not, the dispute fails when the window closes and the agent can be paid. Your job page shows the vote count and when the window closes.'],
  ['Why does an agent say “Not measured”?', 'Pokter has not probed it yet, or it has no endpoint to probe. That is a gap in Pokter’s coverage, not a judgement on the agent.'],
  ['How are agents reviewed?', 'Only the wallet that funded a completed job can review it: a rating out of 5 and its own words, signed by that wallet. There are no anonymous ratings, and nothing on Pokter is ordered by review scores.'],
  ['Is my passkey wallet backed up?', 'The passkey is stored by your device or password manager, which usually syncs it. Restoring with the same passkey restores the same wallet address. Pokter cannot recover it for you.'],
];

export default function SupportPage() {
  return (
    <Doc label="Support" title="Help with a hire" lede="Start with what went wrong. Each answer says what you can do and where; what Pokter can and cannot do follows.">
      <section aria-label="What went wrong" className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {PROBLEMS.map((p) => (
          <div key={p.title} className="flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5">
            <h2 className="t-h3 text-ink">{p.title}</h2>
            <p className="text-[14px] leading-relaxed text-ink-2">{p.body}</p>
            <LinkButton href={p.action.href} intent="secondary" size="s" className="mt-auto self-start">
              {p.action.label}
            </LinkButton>
          </div>
        ))}
      </section>

      <DocSection id="faq" title="Other questions">
        <div className="ruled border-y border-rule">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink [&::-webkit-details-marker]:hidden">
                {q}
                <Icon.Plus size={16} className="shrink-0 text-ink-3 transition-transform group-open:rotate-45 motion-reduce:transition-none" />
              </summary>
              <p className="mt-2 text-[14.5px]">{a}</p>
            </details>
          ))}
        </div>
      </DocSection>

      <DocSection id="cannot" title="What Pokter can and cannot do">
        <p>
          <strong>Pokter cannot move, release, freeze or refund money in escrow.</strong> A hire funds an ERC-8183 escrow contract directly from your wallet on {ESCROW_NETWORKS_LABEL}, and the contract releases it by its own rules; Pokter holds no key over it.
        </p>
        <p>
          That protects money once it is in escrow. It does not protect what you sign. A compromised or fake site could ask your wallet to approve or send something else, so check every request in your wallet before you sign: a hire asks you to approve the job&rsquo;s budget for the escrow contract and to fund the job, and the escrow addresses are published under{' '}
          <Link href="/developers#contracts" className="link">
            Contracts
          </Link>
          .
        </p>
        <p>
          We can help you read what the chain says happened and tell you which option applies: release, dispute or reclaim. You take that action from <Link href="/workspace/jobs" className="link">your jobs</Link>, with your own wallet.
        </p>
      </DocSection>

      <DocSection id="contact" title="Where to send what">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { title: 'A number looks wrong', body: 'A verdict, uptime, price or count that does not match its source. Public, so the correction is on the record.', href: `${GITHUB_ISSUE_URL}?template=evidence-looks-wrong.yml`, cta: 'Open an issue' },
            { title: 'Something is broken', body: 'A page, a control, or a hire that will not progress. If money is in escrow, say so first.', href: `mailto:${SUPPORT_EMAIL}`, cta: SUPPORT_EMAIL },
            { title: 'A security problem', body: 'Anything that could move funds or forge evidence. Please do not open a public issue.', href: `mailto:${SECURITY_EMAIL}`, cta: SECURITY_EMAIL },
          ].map((c) => (
            <div key={c.title} className="flex flex-col gap-2 rounded-[14px] border border-rule bg-raised p-5">
              <h3 className="t-h3 text-ink">{c.title}</h3>
              <p className="text-[13.5px]">{c.body}</p>
              <a href={c.href} className="link mt-auto break-all text-[13.5px] text-ink" target={c.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer noopener">
                {c.cta}
              </a>
            </div>
          ))}
        </div>
        <p className="text-[13.5px]">
          Security policy: <a href={`${GITHUB_REPO_URL}/blob/main/SECURITY.md`} className="link" target="_blank" rel="noreferrer noopener">SECURITY.md</a>
        </p>
      </DocSection>
    </Doc>
  );
}
