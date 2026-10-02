import { CATEGORY_BY_ID, type Classification } from '@/lib/agents/categories';

/**
 * What a buyer gets, written by Pokter rather than by the publisher.
 *
 * Agent descriptions are raw registry strings and they show it: one carries
 * an OAuth token URL and a GitHub link, another sells "Harvest element |
 * Power 55/100" as a capability. They are the publisher's own words and
 * Pokter does not rewrite them — but leading with them means the first thing
 * a buyer reads about an agent is marketing of wildly varying quality, and
 * the questions they actually have go unanswered.
 *
 * Every row here is something Pokter can state for certain:
 *
 *  - what it covers comes from the category, which Pokter classified
 *  - what it needs is the brief, because no surface collects anything else
 *  - what arrives is a written assessment, true of every agent here
 *  - whether it can act is no, enforced rather than promised: delegated
 *    execution is disabled and every task template forbids transactions
 *
 * Nothing is inferred from the description, so nothing here can be wrong in
 * the way a publisher's claim can.
 */
export function AgentSpec({ category }: { category: Classification }) {
  const meta = category === 'unclassified' ? null : CATEGORY_BY_ID.get(category);

  const rows: { label: string; value: string }[] = [
    {
      label: 'What it covers',
      value: meta?.blurb ?? 'Outside the four categories Pokter judges.',
    },
    {
      label: 'What it needs from you',
      value: 'The brief you write when you hire it. It is not given your wallet or any position to read.',
    },
    {
      label: 'What arrives',
      value: 'A written assessment, once, in response to that brief.',
    },
    {
      label: 'Can it move funds',
      value: 'No. It never receives access to your wallet, and the escrow pays only on delivery.',
    },
  ];

  return (
    <dl className="flex max-w-3xl flex-col divide-y divide-[color:var(--border)] rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)]">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex flex-col gap-0.5 p-3 sm:flex-row sm:gap-4"
        >
          <dt className="shrink-0 text-[12px] text-[color:var(--text-muted)] sm:w-44">
            {row.label}
          </dt>
          <dd className="text-[12px] leading-relaxed">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
