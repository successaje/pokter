/**
 * §10 / §62. The scanning sequence.
 *
 * Each line names a real stage of the pipeline — retrieval, evidence lookup,
 * scoring, risk filtering — so the wait explains the work rather than
 * performing it. Pure CSS, so it renders before hydration.
 */
const STAGES = [
  'Scanning agents',
  'Checking evidence',
  'Evaluating performance',
  'Adjusting for risk',
  'Finding your best matches',
];

export default function DiscoverLoading() {
  return (
    <div className="flex flex-col gap-8 pt-6">
      <div className="h-8 w-64 animate-pulse rounded bg-[color:var(--surface-raised)]" />

      <ol className="flex flex-col gap-3">
        {STAGES.map((stage, index) => (
          <li
            key={stage}
            style={{ animationDelay: `${index * 180}ms` }}
            className="rise-in flex items-center gap-3 text-sm text-[color:var(--text-secondary)]"
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-[color:var(--info)]"
            />
            {stage}
          </li>
        ))}
      </ol>

      <div className="grid gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            style={{ animationDelay: `${400 + index * 80}ms` }}
            className="rise-in h-44 animate-pulse rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]"
          />
        ))}
      </div>
    </div>
  );
}
