import { ProvenanceTag, type ProvenanceDetail } from '@/components/ui/ProvenanceTag';
import { shortAddress } from '@/lib/ui/format';
import type { AgentDossier } from '@/lib/marketplace';

interface TrustRow {
  label: string;
  value: string;
  provenance: React.ReactNode;
}

/**
 * §21. "Why should I trust this agent?"
 *
 * Every row states a fact and, next to it, where that fact came from. The
 * distinction the panel exists to preserve: identity and capability are
 * *self-asserted* by the publisher, while attestations and probe results are
 * *observed*. A user who cannot tell those apart cannot judge an agent.
 */
export function TrustPanel({
  dossier,
  explorerBase,
}: {
  dossier: AgentDossier;
  explorerBase: string;
}) {
  const { agent, attestations, proof, live, record } = dossier;

  const identityDetails: ProvenanceDetail[] = [
    { label: 'Registry', value: shortAddress(agent.contract_address) },
    { label: 'Token id', value: agent.token_id },
    { label: 'Owner', value: shortAddress(agent.owner_address) },
    {
      label: 'View',
      value: 'BscScan',
      href: `${explorerBase}/address/${agent.contract_address}`,
    },
  ];

  const attestationDetails: ProvenanceDetail[] = attestations
    .filter((a) => a.transactionHash)
    .slice(0, 4)
    .map((a) => ({
      label: a.measuredBy ?? 'measurer',
      value: `${a.transactionHash!.slice(0, 10)}…`,
      href: `${explorerBase}/tx/${a.transactionHash}`,
    }));

  const rows: TrustRow[] = [
    {
      label: 'Identity',
      value: agent.is_verified
        ? 'Verified by the registry'
        : 'Self-asserted, unverified',
      provenance: (
        <ProvenanceTag
          kind="onchain"
          note="Minted in the ERC-8004 identity registry. Registration proves who published the agent, not that the agent is any good."
          details={identityDetails}
        />
      ),
    },
    {
      label: 'Capabilities',
      value: (agent.supported_protocols ?? []).join(', ') || 'None published',
      provenance: (
        <ProvenanceTag
          kind="estimated"
          note="Declared by the publisher in the agent's own metadata. Nobody has checked that the agent can do what it claims."
          details={[
            { label: 'Tags', value: (agent.tags ?? []).join(', ') || 'none' },
            { label: 'Source', value: 'publisher metadata' },
          ]}
        />
      ),
    },
    {
      label: 'Attestations',
      value:
        attestations.length === 0
          ? 'None published'
          : `${attestations.length} from ${proof.measurers.length || 'unnamed'} measurer(s)`,
      provenance:
        attestations.length === 0 ? (
          <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
            Nothing to trace
          </span>
        ) : (
          <ProvenanceTag
            kind="attested"
            note="Published on-chain by independent measurers, each carrying its own methodology and disclosed defects."
            details={attestationDetails}
          />
        ),
    },
    {
      label: 'Endpoint',
      value:
        live.protocol === 'none'
          ? 'No reachable endpoint'
          : `${live.answered}/${live.probes.length} probes answered just now`,
      provenance: (
        <ProvenanceTag
          kind="measured"
          note="Probed by Pokter when this page loaded. A probe counts as answered only on well-formed JSON; an HTTP 200 alone is not counted."
          details={[
            { label: 'Protocol', value: live.protocol.toUpperCase() },
            {
              label: 'Median',
              value: live.medianMs === null ? '—' : `${live.medianMs}ms`,
            },
            { label: 'Endpoint', value: live.endpoint ?? 'none published' },
          ]}
        />
      ),
    },
    {
      label: 'Track record',
      value:
        record.totalProbes === 0
          ? 'Not yet measured'
          : `${record.totalAnswered}/${record.totalProbes} probes over ${record.days.length} day(s)`,
      provenance: (
        <ProvenanceTag
          kind="historical"
          note="Accumulated by repeated Pokter sweeps. History begins when Pokter first saw this agent; earlier behaviour is unknown to us."
          details={[
            { label: 'Days observed', value: String(record.days.length) },
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
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium tracking-tight">
          Why should I trust this agent?
        </h2>
        <p className="text-xs text-[color:var(--text-muted)]">
          Each claim below shows where it came from. Declared facts and observed
          facts are never mixed.
        </p>
      </div>

      <dl className="flex flex-col divide-y divide-[color:var(--border)] rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1.5 p-4"
          >
            <dt className="text-xs text-[color:var(--text-muted)]">{row.label}</dt>
            <dd className="flex min-w-0 flex-col items-end gap-1.5 text-right">
              <span className="text-[13px]">{row.value}</span>
              {row.provenance}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
