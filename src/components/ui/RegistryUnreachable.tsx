import Link from 'next/link';

/**
 * Shown when the registry could not be read.
 *
 * Deliberately not a 404. "This agent does not exist" and "we could not reach
 * the service that would tell us" are different claims, and a product whose
 * whole argument is that unmeasured is not the same as measured cannot collapse
 * them into one screen.
 */
export function RegistryUnreachable({
  chainId,
  tokenId,
}: {
  chainId: number;
  tokenId: string;
}) {
  return (
    <div className="flex flex-col gap-6 pt-6">
      <Link
        href="/agents"
        className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
      >
        ← All agents
      </Link>

      <section className="max-w-2xl rounded-[var(--radius-lg)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-6">
        <h1 className="text-lg font-medium text-[color:var(--caution)]">
          The registry did not answer
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
          We could not read agent #{tokenId} on chain {chainId} just now. That is
          not a claim it does not exist — it is us failing to ask. Reload in a
          moment.
        </p>
      </section>
    </div>
  );
}
