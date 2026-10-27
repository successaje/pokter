import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, type ReactNode } from 'react';

import { Doc, DocSection } from '@/features/content/Doc';
import { loadJobEvidence, type JobEvidence } from '@/lib/jobs/evidence';
import { FUNDER_LABEL, fundedWhen, jobEvidencePath, jobStatusWords, utcWhen } from '@/lib/jobs/evidence-view';
import { jobChainParam, jobHref } from '@/lib/jobs/href';
import { chainLabel, explorerBaseFor } from '@/lib/network/presentation';

/*
 * A job's state moves on (delivered, then settled), and the page is read
 * by crawlers and people long after: five minutes is fresh enough for a
 * record whose every change is a transaction, and keeps a popular job from
 * reading the chain on every view.
 */
export const revalidate = 300;

type Params = { chainId: string; jobId: string };

/* One read for the metadata and the page. */
const evidenceFor = cache(async (chainParam: string, jobId: string): Promise<JobEvidence | null> => {
  const chainId = jobChainParam(chainParam);
  if (!chainId || !/^\d{1,18}$/.test(jobId)) return null;
  return loadJobEvidence(chainId, jobId);
});

function summary(e: JobEvidence): string {
  const status = jobStatusWords(e.status).label.toLowerCase();
  const check = e.delivery.state === 'matches' ? ', and its delivery matches the hash committed on chain' : e.delivery.state === 'mismatch' ? ', but its delivery does not match the hash committed on chain' : '';
  const funder = e.funder === 'team' ? ' Funded by Pokter’s team as a test.' : e.funder === 'outside' ? ' Funded by an outside buyer.' : e.funder === 'self' ? ' Funded by the agent’s own operator.' : '';
  return `A ${e.amount} escrow job for ${e.agent.name} on ${chainLabel(e.chainId)}: ${status}${check}.${funder}`;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { chainId, jobId } = await params;
  const e = await evidenceFor(chainId, jobId);
  if (!e) return { title: 'Job not found', robots: { index: false } };
  return {
    title: `Job #${e.jobId} on ${chainLabel(e.chainId)} · ${e.agent.name}`,
    description: summary(e),
    alternates: { canonical: jobEvidencePath(e) },
  };
}

function Readout({ children }: { children: ReactNode }) {
  return <span className="t-readout break-all text-[13px] text-ink">{children}</span>;
}

/* Where a fact came from, said beside it: the chain, or Pokter's own check or record. */
function Source({ kind }: { kind: 'onchain' | 'pokter' | 'index' }) {
  const label = kind === 'onchain' ? 'On chain' : kind === 'pokter' ? 'Pokter checked' : 'Pokter’s record';
  return <span className="t-label shrink-0 rounded-full border border-rule px-2 py-0.5 text-[10.5px]">{label}</span>;
}

export default async function JobEvidencePage({ params }: { params: Promise<Params> }) {
  const { chainId, jobId } = await params;
  const e = await evidenceFor(chainId, jobId);
  if (!e) notFound();

  const explorer = explorerBaseFor(e.chainId);
  const status = jobStatusWords(e.status);
  const settled = e.status === 'COMPLETED' || e.status === 'REJECTED' || e.status === 'EXPIRED';
  const facts: Array<{ label: string; value: ReactNode }> = [
    { label: 'Network', value: `${chainLabel(e.chainId)} (${e.chainId})${e.chainId === 97 ? ', test tokens with no value' : ''}` },
    {
      label: 'Status',
      value: (
        <>
          <strong>{status.label}.</strong> {status.meaning}{' '}
          <span className="text-ink-3">{e.statusSource === 'onchain' ? `Read from the escrow, ${utcWhen(e.statusReadAt)}.` : `The escrow could not be read just now; this is Pokter’s record, last read ${utcWhen(e.statusReadAt) ?? 'at an unknown time'}.`}</span>
        </>
      ),
    },
    {
      label: 'Agent',
      value: (
        <Link href={`/agents/${e.agent.chainId}/${e.agent.tokenId}`} className="link">
          {e.agent.name} ({e.agent.chainId}/{e.agent.tokenId})
        </Link>
      ),
    },
    {
      label: 'Amount',
      value: (
        <>
          {e.amount}
          {e.paymentToken && (
            <span className="block">
              <a href={`${explorer}/token/${e.paymentToken}`} className="link t-readout text-[12.5px]" target="_blank" rel="noreferrer noopener">
                {e.paymentToken}
              </a>
            </span>
          )}
        </>
      ),
    },
    { label: 'Funded by', value: FUNDER_LABEL[e.funder] },
    { label: 'Funded', value: fundedWhen(e.hiredAt, e.deliveredAt) },
    { label: 'Delivered', value: utcWhen(e.deliveredAt) ?? 'Not yet' },
    ...(e.review ? [{ label: 'Review window', value: e.review.open ? `Open until ${e.review.closes}. The buyer can dispute until then.` : `Closed ${e.review.closes}.` }] : []),
    { label: 'Deadline', value: utcWhen(e.expiresAt) ?? 'Not readable just now' },
  ];

  return (
    <Doc label="Job evidence" title={`Job #${e.jobId} · ${e.agent.name}`} lede={summary(e)}>
      <section aria-label="At a glance">
        <dl className="divide-y divide-rule rounded-[14px] border border-rule bg-raised">
          {facts.map((fact) => (
            <div key={fact.label} className="grid gap-1 px-4 py-3.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
              <dt className="t-label pt-0.5">{fact.label}</dt>
              <dd className="text-[14.5px] leading-relaxed text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <DocSection id="evidence" title="What the chain says, and what Pokter checked">
        <ol className="flex flex-col divide-y divide-rule border-y border-rule">
          <li className="flex flex-col gap-1 py-3">
            <span className="flex items-center justify-between gap-3">
              <strong>Funded</strong>
              <Source kind={e.chain ? 'onchain' : 'index'} />
            </span>
            <span>The buyer put {e.amount} into the escrow for job #{e.jobId}, payable to the agent’s wallet <Readout>{e.provider}</Readout> only after it delivers.</span>
          </li>
          <li className="flex flex-col gap-1 py-3">
            <span className="flex items-center justify-between gap-3">
              <strong>Delivered</strong>
              <Source kind="onchain" />
            </span>
            {e.chain && e.deliveredAt ? (
              <span>
                The agent submitted its delivery {utcWhen(e.deliveredAt)}, committing to the hash <Readout>{e.chain.deliverable}</Readout>.
                {e.deliveredByPokter ? ' It was submitted from a Pokter wallet, carrying the agent’s answer, not from the agent’s own wallet.' : ''}
              </span>
            ) : (
              <span>{e.chain ? 'Not yet.' : 'The escrow could not be read just now.'}</span>
            )}
          </li>
          <li className="flex flex-col gap-1 py-3">
            <span className="flex items-center justify-between gap-3">
              <strong>The delivery matches its hash</strong>
              <Source kind="pokter" />
            </span>
            <span>
              {e.delivery.state === 'matches' && `Yes. Pokter read the delivered record and its hash matches the one on chain (${e.delivery.matchedBy}).`}
              {e.delivery.state === 'mismatch' && 'No. Pokter read a delivered record whose hash does not match the one on chain.'}
              {e.delivery.state === 'unread' && `Not checked: ${e.delivery.reason}`}
              {e.delivery.state === 'not-delivered' && 'Nothing to check yet: the agent has not delivered.'}
              {e.delivery.state === 'chain-unread' && 'Not checked: the escrow could not be read just now.'}
            </span>
            <span className="text-[13px] text-ink-3">A match says the record was not changed after delivery. It does not say the answer is right.</span>
          </li>
          <li className="flex flex-col gap-1 py-3">
            <span className="flex items-center justify-between gap-3">
              <strong>Settled</strong>
              <Source kind={e.chain ? 'onchain' : 'index'} />
            </span>
            <span>
              {settled ? `${status.label}.` : 'Not yet.'} {settled && e.receipt.hash ? 'The transaction is linked below.' : settled ? 'Pokter did not send the settling transaction, so it has none to link; the escrow’s own state is the record.' : ''}
            </span>
          </li>
        </ol>
      </DocSection>

      <DocSection id="work" title="What was asked, and what came back">
        {e.brief !== null ? (
          <>
            <p className="text-[13.5px] text-ink-3">Published because Pokter’s own team funded this job as a test.</p>
            <p className="font-medium text-ink">The brief</p>
            <p className="whitespace-pre-wrap break-words rounded-[10px] border border-rule bg-sunken p-4 text-[14px]">{e.brief}</p>
            {e.answer && (e.answer.result || e.answer.title) && (
              <>
                <p className="font-medium text-ink">The answer, in the agent’s words</p>
                <p className="whitespace-pre-wrap break-words rounded-[10px] border border-rule bg-sunken p-4 text-[14px]">{e.answer.result ?? e.answer.title}</p>
              </>
            )}
            {(e.delivery.state === 'matches' || e.delivery.state === 'mismatch') && e.delivery.url && (
              <p>
                The full delivered record:{' '}
                <a href={e.delivery.url} className="link break-all" target="_blank" rel="noreferrer noopener">
                  {e.delivery.url}
                </a>
              </p>
            )}
          </>
        ) : (
          <p>
            {e.funder === 'self' ? 'This job was funded by the agent’s own operator.' : 'This job was funded by an outside buyer.'} What they asked and what came back is theirs, so it is not
            published here. Everything above is what the escrow records and what Pokter checked.
          </p>
        )}
      </DocSection>

      <DocSection id="verify" title="Check it yourself">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Read <code>getJob({e.jobId})</code> on the escrow:{' '}
            <a href={`${explorer}/address/${e.escrow}#readProxyContract`} className="link t-readout break-all text-[13px]" target="_blank" rel="noreferrer noopener">
              {e.escrow}
            </a>
          </li>
          {e.fundingTx && (
            <li>
              The funding transaction:{' '}
              <a href={`${explorer}/tx/${e.fundingTx}`} className="link t-readout break-all text-[13px]" target="_blank" rel="noreferrer noopener">
                {e.fundingTx}
              </a>
            </li>
          )}
          {e.receipt.hash && e.receipt.hash !== e.fundingTx && (
            <li>
              The latest transaction Pokter sent for it:{' '}
              <a href={e.receipt.href} className="link t-readout break-all text-[13px]" target="_blank" rel="noreferrer noopener">
                {e.receipt.hash}
              </a>
            </li>
          )}
          <li>
            Every job Pokter commissioned, as data: <Link href="/api/v1/receipts" className="link">/api/v1/receipts</Link>
          </li>
        </ul>
        <p className="text-[13.5px] text-ink-3">
          Funded this job? <Link href={jobHref(e)} className="link">Open it in your workspace</Link> to review it, dispute it or release the payment from your own wallet.
        </p>
      </DocSection>
    </Doc>
  );
}
