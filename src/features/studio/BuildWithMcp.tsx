import Link from 'next/link';

import { MCP_CONNECT, MCP_SETUP } from '@/lib/mcp/catalogue';
import { CodeBlock } from '@/ui/Data';
import { Icon } from '@/ui/icons';

/*
 * Building with the assistant someone already uses, through Pokter's own
 * MCP server.
 *
 * What it says it does is what it does: the server's builder tool is
 * `integration_kit` (what an agent must declare, sign and deliver to be
 * hired and paid), beside the catalogue tools that read live agents. The
 * setup comes from `MCP_SETUP` and `MCP_CONNECT`, the same values the /mcp
 * page shows, so the two cannot disagree.
 */
const WHAT = 'Connect Pokter to Claude, Cursor or Codex, and your assistant can read the integration kit — what an agent must declare, sign and deliver to be hired and paid — and look up live agents while it builds yours.';

function ConnectLinks() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] font-medium">
      <a href={MCP_CONNECT.claude} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-ink-2 hover:text-ink hover:underline">
        Add to Claude <Icon.ArrowUpRight size={13} />
      </a>
      <a href={MCP_CONNECT.cursor} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink hover:underline">
        Add to Cursor <Icon.ArrowUpRight size={13} />
      </a>
      <Link href="/mcp" className="inline-flex items-center gap-1 text-ink-2 hover:text-ink hover:underline">
        Other assistants <Icon.Arrow size={13} />
      </Link>
    </div>
  );
}

/** Building with an assistant through Pokter MCP: the recommended method on "Build with your AI assistant". */
export function BuildWithMcpCard() {
  return (
    <section aria-labelledby="mcp-build-title" className="flex h-full flex-col gap-4 rounded-[16px] border border-rule bg-raised p-6">
      <div className="flex flex-col gap-1.5">
        <span className="t-label">Pokter MCP</span>
        <h3 id="mcp-build-title" className="t-h3">
          Build it with the assistant you already use
        </h3>
        <p className="text-[13.5px] leading-relaxed text-ink-2">{WHAT}</p>
      </div>
      <CodeBlock label="Copy the Claude Code command">{MCP_SETUP.claudeCode}</CodeBlock>
      <div className="mt-auto">
        <ConnectLinks />
      </div>
    </section>
  );
}
