import type { Metadata } from 'next';
import Link from 'next/link';

import { AGENT_UNDER_TEST, ANNUALISATION_TRAP, EXPERIMENTS, MEASURED_AT } from '@/lib/experiments/agent-advantage';
import { Doc, DocSection } from '@/features/content/Doc';
import { cn } from '@/lib/ui/cn';

export const metadata: Metadata = {
  title: 'Does an agent beat doing it yourself?',
  description: 'Three DeFi tasks run by an agent and by hand against the same chain, timed and compared, including the one the agent lost.',
};

const WINNER = { agent: 'Agent', manual: 'By hand', tie: 'Tie' } as const;

export default function AgentAdvantage() {
  return (
    <Doc
      label="Research"
      title="Does an agent beat doing it yourself?"
      lede={`Three questions a DeFi user actually asks, answered once by an agent and once by reading the chain directly, then timed and checked against each other. Measured ${new Date(MEASURED_AT).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`}
      toc={[
        { id: 'setup', label: 'Setup' },
        ...EXPERIMENTS.map((e) => ({ id: e.id, label: e.title })),
        { id: 'trap', label: 'The annualisation trap' },
        { id: 'reading', label: 'How to read this' },
      ]}
    >
      <DocSection id="setup" title="Setup">
        <dl className="ruled border-y border-rule text-[14px]">
          {[
            ['Agent', AGENT_UNDER_TEST.name],
            ['Identities', AGENT_UNDER_TEST.agentIds],
            ['Endpoint', AGENT_UNDER_TEST.endpoint],
            ['Availability', AGENT_UNDER_TEST.availability],
            ['By hand', 'Direct contract reads over a public BNB Chain RPC, written for each question'],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)]">
              <dt className="text-ink-3">{k}</dt>
              <dd className={cn('break-words text-ink', k === 'Endpoint' && 't-readout text-[13px]')}>{v}</dd>
            </div>
          ))}
        </dl>
        <p>Timing is wall-clock for one run each. A single run says something about shape, not a distribution; nothing here is a benchmark.</p>
      </DocSection>

      {EXPERIMENTS.map((e) => (
        <DocSection key={e.id} id={e.id} title={e.title}>
          <p className="text-ink">{e.question}</p>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-rule bg-rule sm:grid-cols-2">
            {(['agent', 'manual'] as const).map((side) => {
              const run = e[side];
              const won = e.winner === side;
              return (
                <div key={side} className="flex flex-col gap-2 bg-raised p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="t-label">{side === 'agent' ? 'Agent' : 'By hand'}</span>
                    <span className={cn('t-readout text-[15px]', won ? 'font-semibold text-ink' : 'text-ink-3')}>{(run.ms / 1000).toFixed(2)} s</span>
                  </div>
                  <p className="t-readout text-[13px] text-ink">{run.output}</p>
                  <p className="text-[13px] text-ink-3">{run.note}</p>
                </div>
              );
            })}
          </div>
          <p>
            <strong>Quality.</strong> {e.quality}
          </p>
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="rounded-full border border-rule-strong px-2.5 py-0.5 text-[12.5px] font-medium text-ink">Winner: {WINNER[e.winner]}</span>
            <span>{e.verdict}</span>
          </p>
        </DocSection>
      ))}

      <DocSection id="trap" title="The annualisation trap">
        <p>
          Venus reports rates per block, and the conversion to a yearly figure depends on how many blocks BNB Chain produces in a year. That number has changed. At the measured {ANNUALISATION_TRAP.measuredBlockSeconds} s block time there are about {ANNUALISATION_TRAP.measuredBlocksPerYear.toLocaleString('en-US')} blocks a year. Code still using the older {ANNUALISATION_TRAP.legacyBlocksPerYear.toLocaleString('en-US')} reports {ANNUALISATION_TRAP.legacyApr} where the true figure is {ANNUALISATION_TRAP.correctApr}: off by {ANNUALISATION_TRAP.factor}.
        </p>
        <p>The agent answered {ANNUALISATION_TRAP.agentAnswer}. It did not fall in. A hand-written script easily does, which is a real point in the agent&rsquo;s favour that a stopwatch would not show.</p>
      </DocSection>

      <DocSection id="reading" title="How to read this">
        <p>An agent earns its fee where it saves setup, covers more ground, or avoids a mistake you would make. It does not, where the primitive exists and you know its name: there it adds latency and a party to trust. That is why one of the three goes to doing it by hand.</p>
        <p>
          This is one agent, one run per task, on one date. Pokter&rsquo;s ongoing evidence about any agent is on its page and in the <Link href="/methodology" className="link">methodology</Link>. The full write-up is in the{' '}
          <a href="https://github.com/successaje/pokter/blob/main/docs/termix-agent-advantage.md" className="link" target="_blank" rel="noreferrer noopener">
            repository
          </a>
          .
        </p>
      </DocSection>
    </Doc>
  );
}
