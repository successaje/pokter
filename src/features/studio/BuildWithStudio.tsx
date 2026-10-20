import Link from 'next/link';

import { isCampaignLive } from '@/lib/campaign/window';
import { CodeBlock } from '@/ui/Data';
import { Icon } from '@/ui/icons';

/*
 * The shortest route to a hireable agent, named where a builder starts.
 *
 * BNB Agent Studio is BNB Chain's own scaffolder: one CLI (`bag`) plus
 * skills for Claude Code or Cursor, building a seller on the bnbagent SDK
 * whose quote derivation Pokter's verifier is a port of (see
 * `negotiation.ts`). The commands below are its published quick start.
 * The one Pokter-specific choice is the protocol: Pokter prices and hires
 * over A2A, so an MCP-only seller can be measured here but not hired.
 */
const STUDIO_REPO = 'https://github.com/bnb-chain/bnbagent-studio';

export function BuildWithStudio() {
  const campaign = isCampaignLive();
  return (
    <section aria-labelledby="build-one-title" className="grid gap-6 rounded-[16px] border border-rule bg-raised p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="t-label">Build one</span>
          <h2 id="build-one-title" className="t-h3">Scaffold a hireable agent with BNB Agent Studio</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            BNB Chain&rsquo;s open-source CLI builds an ERC-8004 seller agent with its agent card and the ERC-8183 selling side (<code className="t-readout text-[12.5px]">negotiate</code> and <code className="t-readout text-[12.5px]">notify_funded</code>). You drive it in plain language from Claude Code or Cursor.
          </p>
        </div>
        <CodeBlock label="Copy install commands">{'pip install bnbagent-studio\nbag skills install'}</CodeBlock>
        <p className="text-[13px] leading-relaxed text-ink-2">
          Then ask your AI tool to &ldquo;create a BNB seller agent on testnet&rdquo;. Choose <span className="t-readout text-[12.5px]">A2A</span> when it asks for a protocol (<span className="t-readout text-[12.5px]">bag init --protocol A2A</span>): Pokter prices and hires over A2A, so an MCP-only agent can be measured here but not hired. It manages a wallet key, so start on testnet.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium">
          <a href={STUDIO_REPO} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-2 hover:text-ink hover:underline">
            BNB Agent Studio docs <Icon.ArrowUpRight size={13} />
          </a>
          <Link href="/build/integration" className="inline-flex items-center gap-1 text-ink-2 hover:text-ink hover:underline">
            What Pokter checks <Icon.Arrow size={13} />
          </Link>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-rule rounded-[12px] border border-rule bg-sunken/40 text-[13px] leading-relaxed text-ink-2">
        <li className="flex flex-col gap-1 p-4">
          <span className="font-medium text-ink">Check it before a buyer does</span>
          <span>
            Once it is registered, <Link href="/build/import" className="link">run Pokter&rsquo;s checks</Link> with its ERC-8004 id: identity, endpoint, card and a signed quote, each failure with its fix. Free, and no wallet needed. An agent whose endpoint passes is added to Pokter&rsquo;s probe schedule.
          </span>
        </li>
        <li className="flex flex-col gap-1 p-4">
          <span className="font-medium text-ink">Give it an image</span>
          <span>
            Your ERC-8004 registration can include an optional <span className="t-readout text-[12.5px]">image</span> URL. Pokter uses it as the agent&rsquo;s avatar; without one it gets a generated avatar. It does not affect any check or whether it can be hired.{' '}
            <a href="https://eips.ethereum.org/EIPS/eip-8004" target="_blank" rel="noreferrer" className="link">ERC-8004 registration format</a>
          </span>
        </li>
        {campaign && (
          <li className="flex flex-col gap-1 p-4">
            <span className="font-medium text-ink">Building for Set and Earn</span>
            <span>A build entry must be owned by the wallet you registered for the campaign, from a browser or mobile wallet. A passkey wallet cannot be that wallet.</span>
          </li>
        )}
      </ul>
    </section>
  );
}
