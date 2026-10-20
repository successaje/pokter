import type { Metadata } from 'next';
import Link from 'next/link';

import { PromptBuilder } from '@/features/build/PromptBuilder';
import { BuildWithMcpCard } from '@/features/studio/BuildWithMcp';
import { BuildWithStudio } from '@/features/studio/BuildWithStudio';
import { PageHeader } from '@/features/workspace/parts';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';

export const metadata: Metadata = { title: 'Build with your AI assistant', robots: { index: false } };

/*
 * One choice, three methods: connect Pokter MCP (recommended, because the
 * assistant then reads Pokter's rules as it works), paste a prompt into
 * any tool, or scaffold with BNB Agent Studio. All three produce code the
 * builder runs; none of them lists it. So the page ends where every route
 * meets — register it with the form, or import it if it is registered —
 * and nobody builds something they then cannot list.
 */
export default function BuildWithAssistant() {
  return (
    <>
      <div className="mb-6">
        <Link href="/build/new" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
          <Icon.ChevronLeft size={14} /> All ways to create
        </Link>
      </div>
      <PageHeader title="Build with your AI assistant" description="Your assistant writes the agent; you run it. Pick how it learns what Pokter needs, then come back to list it." />

      <section aria-labelledby="method-mcp" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 id="method-mcp" className="text-[19px] font-medium tracking-[-0.015em]">
            1. Connect Pokter MCP
          </h2>
          <span className="rounded-full border border-ok/30 bg-ok-wash px-2 py-0.5 text-[11.5px] font-medium text-ok">Recommended</span>
        </div>
        <BuildWithMcpCard />
      </section>

      <section aria-labelledby="method-prompt" className="mt-12 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="method-prompt" className="text-[19px] font-medium tracking-[-0.015em]">
            2. Or copy a build prompt
          </h2>
          <p className="text-[13.5px] text-ink-2">Works with any assistant and needs no setup. Add a few details to point it in a direction, or leave them blank and it will ask you.</p>
        </div>
        <div className="rounded-[16px] border border-rule bg-raised p-6">
          <PromptBuilder />
        </div>
      </section>

      <section aria-labelledby="method-studio" className="mt-12 flex flex-col gap-3">
        <h2 id="method-studio" className="text-[19px] font-medium tracking-[-0.015em]">
          3. Or scaffold it with BNB Agent Studio
        </h2>
        <BuildWithStudio compact />
      </section>

      <section aria-labelledby="then-title" className="mt-12 rounded-[16px] border border-dashed border-rule-strong p-6">
        <h2 id="then-title" className="text-[17px] font-semibold">
          When it is running
        </h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
          Bring it back here to be listed. Pokter checks its endpoint the way a buyer&rsquo;s hire would call it, then you register its identity, or prove you own it if it is already registered.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton href="/build/new/guided" size="s" trailing={<Icon.Arrow size={14} />}>
            List it with guided setup
          </LinkButton>
          <LinkButton href="/build/import" intent="secondary" size="s">
            Import a registered agent
          </LinkButton>
        </div>
      </section>
    </>
  );
}
