import Link from 'next/link';

/**
 * Activity cannot be keyed by a browser connection on the server without an
 * authenticated wallet session. Showing the process-wide SQLite tables here
 * would leak every demo user's task text and session metadata, so this page
 * deliberately fails closed until address-bound authentication lands.
 */
export default function MyAgentsPage() {
  return (
    <div className="flex flex-col gap-8 pt-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Your agents
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Private activity is not inferred from a connected address. Pokter
          will show sessions and jobs here once the page can prove wallet
          ownership with an address-bound sign-in.
        </p>
      </header>

      <section className="flex max-w-2xl flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-5">
        <h2 className="text-sm font-medium text-[color:var(--caution)]">
          Activity view temporarily locked
        </h2>
        <p className="text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
          The previous demo view read a shared server index, which could mix
          activity from different visitors. It has been removed. New passkey
          grants still show their receipt and a device-signed revoke action on
          the authorization screen where they are created.
        </p>
        <Link
          href="/agents"
          className="mt-1 w-fit rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
        >
          Browse verified agents →
        </Link>
      </section>
    </div>
  );
}
