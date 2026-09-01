import Link from 'next/link';

import { DIMENSION_WEIGHTS, DIMENSION_LABELS, SCORE_VERSION } from '@/lib/score/types';
import {
  FAILING_MAX_SCORE,
  PROVEN_MIN_MEASURERS,
  PROVEN_MIN_PROBES,
  PROVEN_MIN_SCORE,
  PROVEN_MIN_WINDOW_DAYS,
} from '@/lib/proof/engine';
import { MIN_PROBES, MIN_UPTIME } from '@/lib/recommend/thresholds';
import { getEcosystemStats } from '@/lib/marketplace';
import { formatCompact, formatCount } from '@/lib/ui/format';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Methodology — Pokter',
  description:
    'How Pokter scores, verifies, measures and ranks agents — and what it cannot tell you.',
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-4">
      <h2 className="border-b border-[color:var(--border)] pb-2 text-lg font-medium tracking-tight">
        {title}
      </h2>
      <div className="flex max-w-3xl flex-col gap-4 text-sm leading-relaxed text-[color:var(--text-secondary)]">
        {children}
      </div>
    </section>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[13px] leading-relaxed">
      <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-[color:var(--text-faint)]" />
      <span>{children}</span>
    </li>
  );
}

const CONTENTS = [
  ['score', 'How we score'],
  ['verify', 'How we verify'],
  ['measure', 'How we measure'],
  ['rank', 'How we rank'],
  ['unknown', 'What we don’t know'],
  ['limits', 'Known limitations'],
] as const;

/**
 * §82 / §83. The methodology.
 *
 * Every threshold here is imported from the module that enforces it, so the
 * page cannot describe a rule the product does not follow. A methodology page
 * that restates its numbers by hand is wrong the first time either changes,
 * and a wrong methodology page is worse than none — it converts an honest
 * system into a misleading claim.
 */
export default async function MethodologyPage() {
  const stats = await getEcosystemStats();

  return (
    <div className="flex flex-col gap-12 pt-6">
      <header className="flex max-w-3xl flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Methodology
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          The Pokter Score is not objective truth. It is a transparent framework
          applied to whatever evidence exists, and the evidence is thin — of the{' '}
          {stats.registered === null ? 'hundreds of thousands of' : formatCompact(stats.registered)}{' '}
          agents in the registry, Pokter has measured{' '}
          {formatCount(stats.agentsMonitored)}. This page states the rules so you
          can disagree with them.
        </p>

        <nav aria-label="Contents" className="flex flex-wrap gap-2 pt-1">
          {CONTENTS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-[var(--radius)] border border-[color:var(--border)] px-2.5 py-1 text-[11px] text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <Section id="score" title="How we score">
        <p>
          The Pokter Score has five weighted dimensions summing to 100. It is
          versioned — currently <span className="mono">v{SCORE_VERSION}</span> —
          so a ranking stays reproducible and two scores from different formula
          versions are never silently compared.
        </p>

        <dl className="grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--border)] sm:grid-cols-5">
          {(Object.keys(DIMENSION_WEIGHTS) as (keyof typeof DIMENSION_WEIGHTS)[]).map(
            (dimension) => (
              <div
                key={dimension}
                className="flex flex-col gap-1 bg-[color:var(--surface)] p-3"
              >
                <dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                  {DIMENSION_LABELS[dimension]}
                </dt>
                <dd className="tabular text-lg">{DIMENSION_WEIGHTS[dimension]}</dd>
              </div>
            ),
          )}
        </dl>

        <p>
          Two of those five — Performance and Risk — are currently{' '}
          <span className="font-medium text-[color:var(--text)]">never scored</span>,
          because no agent in this registry publishes realised returns or
          drawdown and no measurer attests to them. Rather than approximate them
          from something else, the score is rescaled across the dimensions that
          carried real data, and its coverage travels with it everywhere it is
          displayed.
        </p>

        <p className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-[13px]">
          A score of 90 measured on three dimensions is not the same claim as 90
          measured on five, and Pokter never lets one pass for the other.
        </p>
      </Section>

      <Section id="verify" title="How we verify">
        <p>
          Every agent gets one of four evidence states. The bar for{' '}
          <span className="font-medium text-[color:var(--text)]">Proven</span> is
          independence rather than volume — probing an agent more often does not
          make a single measurer more trustworthy:
        </p>

        <ul className="flex flex-col gap-2">
          <Rule>
            <span className="font-medium text-[color:var(--text)]">Proven</span> —
            at least {PROVEN_MIN_MEASURERS} independent measurers,{' '}
            {PROVEN_MIN_PROBES}+ probes, {PROVEN_MIN_WINDOW_DAYS}+ day of
            observation, and a measured rate of at least{' '}
            {(PROVEN_MIN_SCORE * 100).toFixed(0)}%.
          </Rule>
          <Rule>
            <span className="font-medium text-[color:var(--text)]">Emerging</span> —
            real evidence exists but falls short of one of those bars.
          </Rule>
          <Rule>
            <span className="font-medium text-[color:var(--text)]">Failing</span> —
            measured below {(FAILING_MAX_SCORE * 100).toFixed(0)}%. Blocked from
            hire.
          </Rule>
          <Rule>
            <span className="font-medium text-[color:var(--text)]">Unproven</span> —
            nothing verifiable exists. This is not a low score; it is the absence
            of a measurement, and the two are never merged.
          </Rule>
        </ul>

        <p>
          Attestations are read from the ERC-8004 registry via 8004scan and
          decoded from their <span className="mono">feedback_uri</span> into the
          measurer, the methodology, the probe counts and the defects that
          measurer disclosed about its own method. Every figure links to the
          transaction that carries it.
        </p>
      </Section>

      <Section id="measure" title="How we measure">
        <p>
          Because so few agents carry third-party attestations, Pokter measures
          them itself. Scheduled sweeps probe each agent’s declared endpoint and
          accumulate a record. To date: {formatCount(stats.probesTaken)} probes
          across {formatCount(stats.agentsMonitored)} agents in{' '}
          {formatCount(stats.sweeps)} sweeps.
        </p>

        <ul className="flex flex-col gap-2">
          <Rule>
            A probe counts as answered only on a well-formed JSON response. An
            HTTP 200 from a proxy is not an answer.
          </Rule>
          <Rule>
            Probes are read-only, rate-limited and non-destructive. Pokter never
            sends transactions to an agent’s endpoint.
          </Rule>
          <Rule>
            We publish the defects of our own method alongside the reading, the
            same standard we hold third-party measurers to.
          </Rule>
          <Rule>
            Observed time is floored. Ten minutes of watching is zero days of
            watching, so a single afternoon can never produce a “Proven” verdict.
          </Rule>
        </ul>
      </Section>

      <Section id="rank" title="How we rank">
        <p>
          Rankings order by Pokter Score, then by how much of that score is
          backed by data. Because one ordering cannot answer everyone’s question,
          the{' '}
          <Link href="/leaderboard" className="underline underline-offset-2">
            rankings page
          </Link>{' '}
          also names the leader on each specific metric — reliability, scrutiny,
          track record, responsiveness — and leaves an award unclaimed when fewer
          than two agents have the data to compare.
        </p>

        <p>
          Recommendations are separate from rankings. A recommendation is scored
          against <em>your</em> brief, and the bars tighten with lower risk
          tolerance:
        </p>

        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--border)]">
          <table className="w-full min-w-[380px] border-collapse bg-[color:var(--surface)] text-[13px]">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-left">
                {['Risk tolerance', 'Minimum uptime', 'Minimum probes'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="p-3 text-[10px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['low', 'medium', 'high'] as const).map((risk) => (
                <tr
                  key={risk}
                  className="border-b border-[color:var(--border)] last:border-b-0"
                >
                  <td className="p-3 capitalize">{risk}</td>
                  <td className="tabular p-3">
                    {(MIN_UPTIME[risk] * 100).toFixed(0)}%
                  </td>
                  <td className="tabular p-3">{MIN_PROBES[risk]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p>
          Every rejected candidate carries a reason you can check, and the
          filtering and the explanation are produced by the same pass — so the
          stated reason can never drift from the decision that produced it.
        </p>
      </Section>

      <Section id="unknown" title="What we don’t know">
        <p>
          The honest list of what Pokter cannot tell you, however confident the
          interface looks:
        </p>
        <ul className="flex flex-col gap-2">
          <Rule>
            <span className="font-medium text-[color:var(--text)]">
              Whether an agent makes money.
            </span>{' '}
            No realised P&amp;L is published or attested. Availability is not
            performance, and an agent that answers every probe can still trade
            badly.
          </Rule>
          <Rule>
            <span className="font-medium text-[color:var(--text)]">
              Whether its decisions are sound.
            </span>{' '}
            We measure that an agent responds, not that it is right.
          </Rule>
          <Rule>
            <span className="font-medium text-[color:var(--text)]">
              Whether it suits your capital.
            </span>{' '}
            No agent publishes a minimum or maximum position size.
          </Rule>
          <Rule>
            <span className="font-medium text-[color:var(--text)]">
              What it did before we arrived.
            </span>{' '}
            Our history begins the first time Pokter saw an agent.
          </Rule>
          <Rule>
            <span className="font-medium text-[color:var(--text)]">
              Whether a capability claim is true.
            </span>{' '}
            Tags and descriptions are publisher-declared. We mark them as such
            and never let them raise an evidence state.
          </Rule>
        </ul>
      </Section>

      <Section id="limits" title="Known limitations">
        <ul className="flex flex-col gap-2">
          <Rule>
            <span className="font-medium text-[color:var(--text)]">
              Single vantage point.
            </span>{' '}
            An agent that geo-blocks or ASN-blocks our prober looks unreachable
            when it may be healthy. We cannot distinguish “down” from
            “unreachable from here”.
          </Rule>
          <Rule>
            <span className="font-medium text-[color:var(--text)]">
              Sampling gaps.
            </span>{' '}
            Sweeps are periodic, so an outage shorter than the interval between
            them can pass unseen.
          </Rule>
          <Rule>
            <span className="font-medium text-[color:var(--text)]">
              Classification is imperfect.
            </span>{' '}
            Category comes from declared tags and prose. A publisher who
            mislabels an agent will see it mislabelled here.
          </Rule>
          <Rule>
            <span className="font-medium text-[color:var(--text)]">
              We are one of the measurers.
            </span>{' '}
            Pokter appears in its own evidence counts. An agent measured only by
            us has one measurer, not two, and cannot reach Proven on our word
            alone.
          </Rule>
          <Rule>
            <span className="font-medium text-[color:var(--text)]">
              Testnet is labelled, never blurred.
            </span>{' '}
            Sessions and escrow currently run on BSC testnet, and every surface
            that shows one says so.
          </Rule>
        </ul>

        <p className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-[13px]">
          Pokter provides information and tooling for evaluating autonomous
          financial agents. Historical performance is not a guarantee of future
          results, and nothing here is investment advice. You remain responsible
          for reviewing permissions and risks before activating an agent.
        </p>
      </Section>
    </div>
  );
}
