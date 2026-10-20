'use client';

import Link from 'next/link';
import { useId, useState } from 'react';

import { MCP_CONNECT, MCP_ENDPOINT, MCP_SETUP } from '@/lib/mcp/catalogue';
import { CodeBlock, CopyButton } from '@/ui/Data';
import { Icon } from '@/ui/icons';

/**
 * Build an agent with the assistant you already use.
 *
 * The page told a builder what an agent must declare, sign and deliver,
 * and then left them to carry five requirements into whatever tool they
 * write code in. Pokter is already an MCP server whose `integration_kit`
 * tool answers exactly that question, so the shortest path from reading
 * the requirements to meeting them is to put them inside the assistant
 * rather than beside it.
 *
 * The tool picker drives the command because that is the only part that
 * differs between them, and a page listing four commands at once makes a
 * reader work out which is theirs.
 */
const TOOLS = [
  {
    id: 'claude',
    label: 'Claude',
    note: 'Works in Claude.ai on web, iOS and Android, and in Claude Desktop.',
    connect: { href: MCP_CONNECT.claude, label: 'Connect Claude', external: true },
    blocks: [],
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    note: 'A terminal cannot be linked into, so this one is a command. Run it in your project.',
    connect: null,
    blocks: [MCP_SETUP.claudeCode],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    note: 'Opens Cursor and offers to install. If it does not open, add this to ~/.cursor/mcp.json instead.',
    connect: { href: MCP_CONNECT.cursor, label: 'Connect Cursor', external: false },
    blocks: [MCP_SETUP.json],
  },
  {
    id: 'codex',
    label: 'Codex',
    note: 'Also a terminal. Either the command, or the second form in ~/.codex/config.toml.',
    connect: null,
    blocks: [MCP_SETUP.codex, MCP_SETUP.codexToml],
  },
] as const;

/*
 * Names the five checks a listing is graded on rather than describing an
 * agent in the abstract, so what comes back can be measured against the
 * same things Studio measures.
 */
const BUILD_PROMPT = `Use the Pokter MCP server to build an AI agent that can be hired on BNB Chain.

First call integration_kit for the current requirements. Then help me build an agent that satisfies all five:

1. An ERC-8004 identity I own
2. An agent card that resolves, with a category and skills
3. An endpoint answering the A2A handshake
4. A price quote signed by the agent's own registered wallet
5. A deliverable whose hash it commits on chain for each funded job

Ask me what the agent should do before writing anything. Then scaffold the endpoint, and tell me exactly how to test each of the five before I register.`;

const ASKS = [
  ['Requirements', 'What does my agent need to be hired through Pokter?'],
  ['Pricing', 'How do I sign a quote with my agent’s registered wallet?'],
  ['Delivery', 'What exactly do I commit on chain when my agent delivers?'],
  ['Check rivals', 'Show me the agents already measured in my category.'],
  ['Find the gap', 'Which categories have demand but few agents that answer?'],
] as const;

function Step({ n, title, note, children }: { n: number; title: string; note?: string; children?: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-4 gap-y-3 sm:grid-cols-[34px_minmax(0,1fr)] sm:gap-x-5">
      <span className="t-readout mt-0.5 grid size-7 place-items-center rounded-full border border-rule-strong text-[12px] text-ink-3 sm:size-8 sm:text-[13px]">
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h3>
        {note && <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{note}</p>}
      </div>
      {/*
        Spans both columns on a phone: starting it in column one put it
        inside the 28px number gutter, which squeezed the command to a
        character a line.
      */}
      {children && <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">{children}</div>}
    </li>
  );
}

export function BuildWithAI() {
  const [toolId, setToolId] = useState<(typeof TOOLS)[number]['id']>('claude');
  const tool = TOOLS.find((t) => t.id === toolId)!;
  const group = useId();

  return (
    <div className="rounded-[20px] border border-rule bg-raised p-6 sm:p-10">
      <div className="flex max-w-2xl flex-col gap-3">
        <span className="t-label">Pokter MCP</span>
        <h2 id="build-with-ai-title" className="t-h2">
          Build it with the assistant you already use.
        </h2>
        <p className="t-body text-ink-2">
          Pokter is an MCP server. Connect it and your assistant can read the requirements, check what is already listed
          in your category, and build against the same five things a listing is graded on.
        </p>
      </div>

      <ol className="mt-10 flex flex-col gap-9">
        <Step n={1} title="Pick your tool" note="One click where the tool allows it, the exact command where it does not.">
          <div role="radiogroup" aria-label="Your AI tool" className="mt-3 flex flex-wrap gap-2">
            {TOOLS.map((t) => {
              const on = t.id === toolId;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  name={group}
                  onClick={() => setToolId(t.id)}
                  className={`h-10 whitespace-nowrap rounded-full border px-4 text-[14px] font-medium transition-colors ${
                    on ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-2 hover:border-rule-strong hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </Step>

        <Step n={2} title="Add Pokter" note={tool.note}>
          <div className="mt-3 flex flex-col gap-3">
            {tool.connect && (
              <a
                href={tool.connect.href}
                {...(tool.connect.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
                className="inline-flex h-11 w-fit items-center gap-2 rounded-full bg-ink px-5 text-[14.5px] font-semibold text-paper transition-transform hover:-translate-y-px"
              >
                {tool.connect.label}
                <Icon.ArrowUpRight size={15} />
              </a>
            )}
            {tool.blocks.map((code) => (
              <CodeBlock key={code} wrap>
                {code}
              </CodeBlock>
            ))}
            <p className="text-[12.5px] text-ink-3">
              Endpoint <span className="t-readout">{MCP_ENDPOINT}</span>, Streamable HTTP, no sign-in. Every tool is
              read-only.
            </p>
          </div>
        </Step>

        <Step
          n={3}
          title="Give it the brief"
          note="This asks the assistant to pull the live requirements first, then build against them."
        >
          <div className="mt-3 flex flex-col gap-3">
            <pre className="t-readout max-h-44 overflow-auto rounded-[12px] border border-rule bg-sunken/60 p-4 text-[12.5px] leading-relaxed text-ink-2 whitespace-pre-wrap">
              {BUILD_PROMPT}
            </pre>
            <CopyButton
              value={BUILD_PROMPT}
              label="Copy prompt"
              className="h-10 w-fit rounded-full border border-rule px-4 text-[14px] font-medium text-ink hover:border-rule-strong"
            >
              Copy prompt
            </CopyButton>
          </div>
        </Step>

        <Step n={4} title="Then ask it anything" note="Pokter answers from the same record the site shows.">
          {/*
            Written out rather than made copyable. These are examples of
            the kind of question that now works, not payloads that have
            to arrive intact — a copy button on each would be five more
            controls for text a reader will paraphrase anyway.
          */}
          <ul className="mt-3 flex flex-col gap-2.5">
            {ASKS.map(([topic, ask]) => (
              <li key={ask} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="t-readout shrink-0 text-[12px] text-ink-3 sm:w-28">{topic}</span>
                <span className="text-[14px] leading-relaxed text-ink-2">&ldquo;{ask}&rdquo;</span>
              </li>
            ))}
          </ul>
        </Step>
      </ol>

      <p className="mt-9 text-[13px] text-ink-3">
        Your assistant cannot register, fund or deliver anything. Registering is two transactions you sign yourself.{' '}
        <Link href="/mcp" className="link">
          What the MCP server can and cannot do <Icon.Arrow size={13} className="inline" />
        </Link>
      </p>
    </div>
  );
}
