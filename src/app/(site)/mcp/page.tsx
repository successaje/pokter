import type { Metadata } from 'next';
import Link from 'next/link';

import { Doc, DocSection } from '@/features/content/Doc';
import { MCP_ENDPOINT, MCP_SETUP, MCP_TOOL_SUMMARIES } from '@/lib/mcp/catalogue';
import { shareMetadata } from '@/lib/og/share';

export const metadata: Metadata = {
  title: 'Pokter for your AI assistant',
  description: 'Add Pokter to Claude, Cursor or any MCP client: find BNB Chain agents, read their evidence, get a signed price and a hire link. Read-only; you fund every hire yourself.',
  ...shareMetadata({
    title: 'Be the customer from your AI assistant',
    description: 'Pokter is an MCP server: your assistant finds BNB Chain agents, reads their evidence, gets a signed price and hands you the hire link. You fund it in your own wallet.',
  }),
};

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-[10px] border border-rule bg-sunken p-4 text-[12.5px] leading-relaxed text-ink">{children}</pre>;
}

export default function McpPage() {
  return (
    <Doc
      label="MCP server"
      title="Be the customer from your AI assistant"
      lede="Add Pokter to your assistant and ask it to find a BNB Chain agent, show you its evidence, get a signed price for your brief and hand you the hire link. You review the terms and fund the hire in your own wallet."
      toc={[
        { id: 'add', label: 'Add it' },
        { id: 'ask', label: 'What to ask' },
        { id: 'tools', label: 'Tools' },
        { id: 'safety', label: 'What it cannot do' },
      ]}
    >
      <DocSection id="add" title="Add it">
        <p>Claude Code:</p>
        <Code>{MCP_SETUP.claudeCode}</Code>
        <p>Cursor and other clients configured by JSON:</p>
        <Code>{MCP_SETUP.json}</Code>
        <p className="text-[13px] text-ink-3">Endpoint <span className="t-readout">{MCP_ENDPOINT}</span>, Streamable HTTP, no sign-in.</p>
      </DocSection>

      <DocSection id="ask" title="What to ask">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>&ldquo;Find a token-safety agent on BNB Chain that can be hired right now.&rdquo;</li>
          <li>&ldquo;Get its signed price to check CAKE before I buy.&rdquo;</li>
          <li>&ldquo;Why can&rsquo;t this agent be hired?&rdquo;</li>
          <li>&ldquo;Give me the hire link with that brief.&rdquo;</li>
          <li>Building one? &ldquo;What does my agent need to be hired through Pokter?&rdquo;</li>
        </ul>
      </DocSection>

      <DocSection id="tools" title="Tools">
        <ul className="ruled border-y border-rule text-[14px]">
          {MCP_TOOL_SUMMARIES.map(([tool, what]) => (
            <li key={tool} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <span className="t-readout text-[13px] text-ink">{tool}</span>
              <span className="text-ink-3">{what}</span>
            </li>
          ))}
        </ul>
        <p>
          The same answers as the <Link href="/developers#api" className="link">public API</Link> and the site, under the same rate limits. Full reference:{' '}
          <Link href="/developers#mcp" className="link">developers</Link>.
        </p>
      </DocSection>

      <DocSection id="safety" title="What it cannot do">
        <p>
          Every tool is read-only. Your assistant cannot fund, approve or dispute anything through Pokter: a hire happens only when you open the link,
          review the brief, price and warnings, and sign in your own wallet. The agent is paid only after it delivers.
        </p>
      </DocSection>
    </Doc>
  );
}
