import { plural } from '@/lib/ui/plural';
import { ProvenanceTag } from '@/components/ui/ProvenanceTag';
import type { AgentDossier } from '@/lib/marketplace';
import {
  publishedEvidenceLine,
  summarisePublishedEvidence,
} from '@/lib/proof/published';

/**
 * The four things worth knowing before reading anything else, each labelled
 * with where it came from.
 *
 * The provenance chip beside every figure is the whole point. Pokter already
 * separated declared facts from observed ones, but it did that inside
 * popovers, so the structure was invisible until you went looking. Here the
 * source is part of the layout: four numbers, four different kinds of
 * evidence, stated together.
 *
 * Which is also why these four. They are not the four most flattering
 * metrics — they are one of each kind we can actually produce. A strip of
 * four measurements all sourced the same way would look like this one and
 * mean much less.
 */
export function TrustStrip({ dossier }: { dossier: AgentDossier }) {
  const { agent, record, score, attestations } = dossier;

  const published = summarisePublishedEvidence(attestations);

  const availability =
    record.totalProbes === 0
      ? null
      : Math.round((record.totalAnswered / record.totalProbes) * 100);

  const cells = [
    {
      label: 'Identity',
      value: 'ERC-8004',
      sub: `#${agent.token_id} · chain ${agent.chain_id}`,
      tag: (
        <ProvenanceTag
          kind="onchain"
          note="Read from the ERC-8004 identity registry. Pokter mints nothing and maintains no parallel id space, so this is the registry's record, not ours."
          details={[
            { label: 'Registry', value: agent.contract_address },
            { label: 'Token id', value: agent.token_id },
            { label: 'Owner', value: agent.owner_address ?? 'not published' },
          ]}
        />
      ),
    },
    {
      label: 'Availability',
      value: availability === null ? 'Not measured' : `${availability}%`,
      sub:
        record.totalProbes === 0
          ? 'no probes yet'
          : `${plural(record.totalProbes, 'probe')} by Pokter`,
      tag: (
        <ProvenanceTag
          kind="measured"
          note="Our own scheduled probes. A probe counts as answered only on well-formed JSON; an HTTP 200 alone is not counted."
          details={[
            { label: 'Answered', value: `${record.totalAnswered}/${record.totalProbes}` },
            {
              label: 'Longest outage',
              value: record.longestOutage
                ? `${record.longestOutage.probes} consecutive failures`
                : 'none observed',
            },
          ]}
        />
      ),
    },
    {
      label: 'Attestations',
      value: String(published.total),
      sub:
        published.namedMeasurers.length === 0
          ? 'no named independent measurer'
          : `from ${plural(published.namedMeasurers.length, 'named measurer')}`,
      tag: (
        <ProvenanceTag
          kind="attested"
          note="Published on-chain by third parties, decoded to the measurer behind each figure. Pokter does not issue these."
          details={[
            { label: 'Published evidence', value: publishedEvidenceLine(published) },
            { label: 'Scorable', value: String(published.scorable) },
            {
              label: 'Named measurers',
              value: published.namedMeasurers.length
                ? published.namedMeasurers.join(', ')
                : 'none',
            },
          ]}
        />
      ),
    },
    {
      label: 'Evidence coverage',
      /*
       * Coverage, not the score. A 90 drawn from three dimensions and a 90
       * drawn from five are different claims, and this strip is the right
       * place to say which one is on offer.
       */
      value: `${score.measuredDimensions} of ${score.totalDimensions}`,
      sub: 'dimensions carry data',
      tag: (
        <ProvenanceTag
          kind="calculated"
          note="How much of the Pokter Score rests on real measurements. Dimensions nobody can measure score null rather than zero, so they lower coverage instead of lowering the score."
          details={[
            {
              label: 'Measured',
              value: `${score.measuredDimensions}/${score.totalDimensions}`,
            },
            { label: 'Weight covered', value: `${Math.round(score.coverage * 100)}%` },
            { label: 'Formula', value: score.version },
          ]}
        />
      ),
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--border)] lg:grid-cols-4">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="flex min-w-0 flex-col gap-1.5 bg-[color:var(--surface)] p-4"
        >
          <dt className="text-[11px] text-[color:var(--text-muted)]">
            {cell.label}
          </dt>
          <dd className="tabular truncate text-xl leading-none">{cell.value}</dd>
          <dd className="truncate text-[11px] text-[color:var(--text-faint)]">
            {cell.sub}
          </dd>
          <dd className="mt-0.5">{cell.tag}</dd>
        </div>
      ))}
    </dl>
  );
}
