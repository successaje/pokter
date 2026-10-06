import { cn } from '@/lib/ui/cn';

/**
 * Where a number came from, in one word, beside the number.
 *
 * Four answers to "says who": Pokter measured it, the chain holds it, the
 * publisher declared it, or Pokter computed it from the first two. A static
 * mark rather than the dialog-bearing ProvenanceTag, for the first screen
 * where every figure needs the word and none needs a popover.
 */
export type SourceKind = 'measured' | 'onchain' | 'declared' | 'calculated' | 'quoted' | 'attested';

const KIND: Record<SourceKind, { label: string; title: string; className: string }> = {
  measured: { label: 'Measured', title: 'Observed by Pokter’s own checks, every two hours.', className: 'text-positive' },
  onchain: { label: 'On chain', title: 'Read from BNB Chain. The transaction is linked.', className: 'text-info' },
  declared: { label: 'Declared', title: 'The publisher’s own words. Not checked by Pokter.', className: 'text-caution' },
  calculated: { label: 'Computed', title: 'Arithmetic over measured and on-chain figures. Never assigned.', className: 'text-ink-muted' },
  quoted: { label: 'Signed quote', title: 'Signed by the agent’s own wallet. Pokter holds the signature.', className: 'text-info' },
  attested: { label: 'Attested', title: 'Signed by the agent or by another measurer and held on chain.', className: 'text-info' },
};

export function Source({ kind, className }: { kind: SourceKind; className?: string }) {
  const meta = KIND[kind];
  return (
    <span title={meta.title} className={cn('mono inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.12em]', meta.className, className)}>
      <span aria-hidden className="size-1 rounded-full bg-current" />
      {meta.label}
      <span className="sr-only">. {meta.title}</span>
    </span>
  );
}
