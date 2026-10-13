import type { Metadata } from 'next';
import Link from 'next/link';

import { loadEvaluationChallenge } from '@/lib/evaluators/challenge-server';
import { chainLabel } from '@/lib/network/presentation';
import { AgentAvatar } from '@/ui/Agent';
import { CopyButton } from '@/ui/Data';
import { EmptyState, Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Independent evaluation challenge',
  description: 'Measure production agents that still need unrelated ERC-8004 evidence.',
  alternates: { canonical: '/evaluators/challenge' },
};

function percent(answered: number, probes: number): string {
  return probes > 0 ? `${Math.round(answered / probes * 100)}%` : 'Not measured';
}

export default async function EvaluationChallengePage() {
  const challenge = await loadEvaluationChallenge();

  return (
    <div className="frame pb-24 pt-10 sm:pt-16">
      <header className="grid gap-8 border-b border-rule pb-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)] lg:items-end">
        <div className="flex max-w-3xl flex-col gap-4">
          <span className="t-label flex items-center gap-2"><span className="tile" aria-hidden /> Independent evaluation challenge</span>
          <h1 className="t-display">Turn an outside measurement into public evidence.</h1>
          <p className="t-lede max-w-2xl">These mainnet agents already publish a callable protocol and have answered Pokter&rsquo;s probes. What they lack is corroboration from evaluator wallets unrelated to Pokter and the agent owner.</p>
        </div>
        <div className="rounded-[14px] border border-rule bg-raised p-5 text-[13px] leading-relaxed text-ink-2">
          <p className="font-medium text-ink">No paid placement. No self-attestation.</p>
          <p className="mt-2">One agent per observable operator. A receipt counts only when its body is scorable and its transaction sender is independently attributable.</p>
          <Link href="/evaluators" className="mt-3 inline-flex items-center gap-1 font-medium text-ink hover:underline">Read the evaluator rules <Icon.Arrow size={13} /></Link>
        </div>
      </header>

      <div className="py-6">
        <Notice tone="neutral" title="This is a work queue, not a ranking">
          Order reflects evaluation readiness: outside-team outcomes, delivery history, payable pricing and recorded reachability. It does not claim that the first agent performs better than the last. Outside-team means only that the funding wallet is absent from Pokter&rsquo;s declared team set; it is not proof that a buyer was unrelated.
        </Notice>
        {challenge.unreachable && <Notice tone="watch" className="mt-3" title="The registry did not answer completely">The queue may omit eligible agents. Nothing missing is treated as failed.</Notice>}
      </div>

      {challenge.entries.length === 0 ? (
        <EmptyState title="No eligible agent needs evaluation right now">
          The queue stays empty instead of lowering its readiness rules. The machine-readable result is available at <Link className="link" href="/api/v1/evaluators/challenge">the challenge API</Link>.
        </EmptyState>
      ) : (
        <ol className="grid gap-5">
          {challenge.entries.map((entry) => (
            <li key={entry.key} className="rounded-[16px] border border-rule bg-raised p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <AgentAvatar name={entry.name} imageUrl={entry.imageUrl} seed={entry.key} size={44} />
                  <div className="min-w-0">
                    <Link href={`/agents/${entry.chainId}/${entry.tokenId}`} className="font-medium text-ink hover:underline">{entry.name}</Link>
                    <p className="mt-0.5 text-[12px] text-ink-3">{chainLabel(entry.chainId)} · #{entry.tokenId} · {entry.category}</p>
                  </div>
                </div>
                <div className="rounded-full border border-watch/30 bg-watch-wash px-3 py-1 text-[12px] font-medium text-ink">
                  Needs {entry.independentNeeded} independent evaluator {entry.independentNeeded === 1 ? 'wallet' : 'wallets'}
                </div>
              </div>

              <dl className="mt-5 grid gap-px overflow-hidden rounded-[10px] border border-rule bg-rule sm:grid-cols-4">
                <div className="bg-paper p-3"><dt className="t-label">Pokter probes</dt><dd className="mt-1 t-readout text-[13px]">{entry.answered}/{entry.probes} · {percent(entry.answered, entry.probes)}</dd></div>
                <div className="bg-paper p-3"><dt className="t-label">Delivered</dt><dd className="mt-1 t-readout text-[13px]">{entry.delivered}</dd></div>
                <div className="bg-paper p-3"><dt className="t-label">Outside-team accepted*</dt><dd className="mt-1 t-readout text-[13px]">{entry.outsideTeamCompleted} · {entry.outsideTeamBuyers} buyers</dd></div>
                <div className="bg-paper p-3"><dt className="t-label">Published evidence</dt><dd className="mt-1 t-readout text-[13px]">{entry.scorableReceipts}/{entry.publishedReceipts} scorable</dd></div>
              </dl>

              <div className="relative mt-4">
                <pre className="overflow-x-auto rounded-[10px] border border-rule bg-sunken p-4 pr-24 text-[12px] leading-relaxed text-ink">{entry.starterCommand}</pre>
                <CopyButton value={entry.starterCommand} label="Copy command" className="absolute right-2 top-2 bg-raised" />
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">Protocol: {entry.protocol.toUpperCase()} · The command takes 40 samples one hour apart. Replace the vantage placeholder honestly before running it.</p>
            </li>
          ))}
        </ol>
      )}

      <section className="mt-14 rounded-[16px] border border-rule bg-sunken p-6 text-[13.5px] leading-relaxed text-ink-2 sm:p-8">
        <h2 className="t-h3 text-ink">Why there is no evaluator leaderboard yet</h2>
        <p className="mt-3">A leaderboard with one evaluator—or several Pokter-controlled identities—would manufacture the appearance of an ecosystem. Pokter will publish evaluator standings only after unrelated wallets have enough conforming receipts to compare coverage and later agreement.</p>
        <p className="mt-3"><Link className="link" href="/api/v1/evaluators/challenge">Challenge API</Link> · <Link className="link" href="/api/v1/evaluators/starter">Download starter</Link> · <Link className="link" href="/api/v1/evaluators/schema">Receipt schema</Link></p>
      </section>
    </div>
  );
}
