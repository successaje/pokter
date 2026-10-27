import type { ReactNode } from 'react';
import Link from 'next/link';

import { Doc, DocSection } from '@/features/content/Doc';
import { disputeWindowSeconds } from '@/lib/erc8183/dispute-window';
import { describeSeconds } from '@/lib/erc8183/deadline';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { percentOf } from '@/lib/erc8183/basis-points';
import { escrowPlatformFee } from '@/lib/erc8183/platform-fee';
import { GUIDES, type GuideEntry } from '@/lib/guides/catalogue';
import { integrationKit } from '@/lib/integration/live';
import { chainLabel, explorerBaseFor } from '@/lib/network/presentation';
import { CodeBlock } from '@/ui/Data';
import { LinkButton } from '@/ui/Button';

/**
 * The frame every guide shares: the same facts first, in the same order,
 * then the steps, a worked example, what goes wrong, and where to go next.
 *
 * Facts that the chain or the code decides — the networks and tokens, the
 * escrow's fee, the review window — are read here from the same sources
 * the hire flow uses, never typed into a guide, so a guide cannot quote a
 * token Pokter has stopped offering or a fee somebody else has changed.
 */
export function Guide({
  entry,
  title,
  lede,
  facts,
  sections,
  children,
}: {
  entry: GuideEntry;
  title: string;
  lede: ReactNode;
  facts: Array<{ label: string; value: ReactNode }>;
  /** The page's own sections, for the table of contents; `facts` and `next` are added around them. */
  sections: Array<{ id: string; label: string }>;
  children: ReactNode;
}) {
  return (
    <Doc
      label={`Guide · ${entry.audience}`}
      title={title}
      lede={lede}
      toc={[{ id: 'at-a-glance', label: 'At a glance' }, ...sections, { id: 'other-guides', label: 'Other guides' }]}
    >
      <section id="at-a-glance" aria-label="At a glance" className="scroll-mt-24">
        <dl className="divide-y divide-rule rounded-[14px] border border-rule bg-raised">
          {facts.map((fact) => (
            <div key={fact.label} className="grid gap-1 px-4 py-3.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
              <dt className="t-label pt-0.5">{fact.label}</dt>
              <dd className="text-[14.5px] leading-relaxed text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {children}
      <OtherGuides current={entry.slug} />
    </Doc>
  );
}

export { DocSection as GuideSection };

/** Numbered steps, each a short instruction and what it involves. */
export function GuideSteps({ steps }: { steps: Array<{ title: string; body: ReactNode }> }) {
  return (
    <ol className="flex flex-col gap-5">
      {steps.map((step, index) => (
        <li key={step.title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
          <span className="t-readout pt-0.5 text-sm text-ink-3" aria-hidden>
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="flex flex-col gap-1.5">
            <p className="font-medium text-ink">{step.title}</p>
            <div className="flex flex-col gap-2">{step.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function GuideCode({ children, wrap = false }: { children: string; wrap?: boolean }) {
  return <CodeBlock wrap={wrap}>{children}</CodeBlock>;
}

/** What goes wrong, and what to do about it. */
export function Troubles({ rows }: { rows: Array<{ what: ReactNode; fix: ReactNode }> }) {
  return (
    <dl className="flex flex-col divide-y divide-rule border-y border-rule">
      {rows.map((row, index) => (
        <div key={index} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] sm:gap-6">
          <dt className="font-medium text-ink">{row.what}</dt>
          <dd>{row.fix}</dd>
        </div>
      ))}
    </dl>
  );
}

export function NextActions({ actions }: { actions: Array<{ href: string; label: string; primary?: boolean }> }) {
  return (
    <div className="flex flex-wrap gap-3">
      {actions.map((action) => (
        <LinkButton key={action.href} href={action.href} intent={action.primary ? undefined : 'secondary'}>
          {action.label}
        </LinkButton>
      ))}
    </div>
  );
}

/**
 * Each escrow Pokter funds on, and the money it takes, from the kit the
 * hire flow is built from. Testnet money is said to be worthless every
 * time it is named.
 */
export function NetworksAndMoney() {
  const escrows = [...integrationKit().escrows].sort((a, b) => (a.chainId === 56 ? -1 : b.chainId === 56 ? 1 : 0));
  return (
    <>
      {escrows.map((escrow) => (
        <span key={escrow.chainId} className="block">
          <strong>
            {chainLabel(escrow.chainId)} ({escrow.chainId})
          </strong>
          : {escrow.tokens.map((t) => t.symbol).join(', ')}
          {escrow.chainId === 97 ? ', test tokens with no value.' : ', real money.'}
        </span>
      ))}
    </>
  );
}

/**
 * The escrow contract's platform fee on each chain, read when the page
 * is built. Pokter's own charge is nothing, and is said by the caller;
 * this is the one cost Pokter does not control.
 *
 * A chain whose read fails says "fee unavailable" — never 0%, which would
 * be a claim about a contract nobody just read. The ceiling is only
 * stated when every chain's was read.
 */
export async function EscrowFee() {
  const chains = integrationKit().escrows.map((e) => e.chainId).sort((a, b) => (a === 56 ? -1 : b === 56 ? 1 : 0));
  const fees = await Promise.all(chains.map(async (chainId) => ({ chainId, fee: await escrowPlatformFee(chainId).catch(() => null) })));
  const read = fees.flatMap((f) => (f.fee ? [f.fee] : []));
  const commerce = correctedErc8183Addresses(56).commerce;
  return (
    <>
      The escrow contract has its own platform fee, set by its operator and not by Pokter. Read from it just now:{' '}
      {fees.map((f, index) => (
        <span key={f.chainId}>
          {index > 0 && ', '}
          {f.fee ? <strong>{percentOf(f.fee.feeBp)}</strong> : <strong>fee unavailable</strong>} on {chainLabel(f.chainId)}
        </span>
      ))}
      .{' '}
      {read.length === fees.length ? (
        <>The contract allows at most {percentOf(Math.max(...read.map((fee) => fee.maxBp)))}.</>
      ) : (
        <>
          Where it could not be read, check <code>platformFeeBP()</code> on the{' '}
          <a className="link" href={`${explorerBaseFor(56)}/address/${commerce}#readProxyContract`}>
            commerce contract
          </a>{' '}
          before relying on it.
        </>
      )}
    </>
  );
}

/** How long a buyer has to dispute after delivery, read from each escrow's policy. */
export async function ReviewWindow() {
  const chains = integrationKit().escrows.map((e) => e.chainId).sort((a, b) => (a === 56 ? -1 : b === 56 ? 1 : 0));
  const windows = await Promise.all(chains.map(async (chainId) => ({ chainId, seconds: await disputeWindowSeconds(chainId).catch(() => null) })));
  const known = windows.filter((w) => w.seconds !== null);
  if (known.length === 0) return <>the review window the escrow&rsquo;s policy sets (read <code>disputeWindow()</code> on it)</>;
  return <>{known.map((w) => `${describeSeconds(w.seconds!)} on ${chainLabel(w.chainId)}`).join(' and ')}</>;
}

function OtherGuides({ current }: { current: GuideEntry['slug'] }) {
  return (
    <DocSection id="other-guides" title="Other guides">
      <ul className="grid gap-3 sm:grid-cols-2">
        {GUIDES.filter((g) => g.slug !== current).map((g) => (
          <li key={g.slug}>
            <Link href={g.href} className="flex h-full flex-col gap-1 rounded-[12px] border border-rule bg-raised p-4 hover:border-rule-strong">
              <span className="font-medium text-ink">{g.title}</span>
              <span className="text-[13.5px] leading-relaxed text-ink-3">{g.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </DocSection>
  );
}
