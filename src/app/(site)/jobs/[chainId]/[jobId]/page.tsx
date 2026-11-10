import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, type ReactNode } from 'react';

import { Doc, DocSection } from '@/features/content/Doc';
import { DeliveredAnswerView } from '@/features/delivery/AnswerView';
import { PlanChecks } from '@/features/delivery/PlanChecks';
import { loadJobEvidence, type JobEvidence } from '@/lib/jobs/evidence';
import { deliveryStanding, FUNDER_LABEL, fundedWhen, jobEvidencePath, jobStatusWords, utcWhen } from '@/lib/jobs/evidence-view';
import { jobChainParam, jobHref } from '@/lib/jobs/href';
import { outcomeRecord } from '@/lib/jobs/outcome-record';
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

/* The headline and the status line both read the status here, so they never say two things. */
const statusOf = (e: JobEvidence) => jobStatusWords(e.status, e.paidToCourier, deliveryStanding(e, e.statusReadAt) === 'overdue');

/* What each line says while nothing is delivered, by where the job stands (`deliveryStanding`). */
const UNDELIVERED = {
  waiting: { fact: 'Not yet', stage: 'Awaiting delivery', step: 'Not yet.', hash: 'Nothing to check yet: the agent has not delivered.', answer: 'Nothing has been delivered yet.' },
  overdue: { fact: 'Not by its deadline', stage: 'Missed its deadline', step: 'Not by its deadline. Anyone may now send the refund to the buyer.', hash: 'Nothing to check: nothing was delivered by the deadline.', answer: 'Nothing was delivered by the deadline.' },
  never: { fact: 'Never', stage: 'Never delivered', step: 'Never. The deadline passed with nothing delivered, and the escrow refunded the buyer.', hash: 'Nothing to check: the agent never delivered.', answer: 'Nothing was delivered.' },
} as const;

function summary(e: JobEvidence): string {
  const status = statusOf(e).label.toLowerCase();
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
  const status = statusOf(e);
  const record = outcomeRecord(e);
  const settled = e.status === 'COMPLETED' || e.status === 'REJECTED' || e.status === 'EXPIRED';
  const undelivered = UNDELIVERED[deliveryStanding(e, e.statusReadAt) ?? 'waiting'];
  /*
   * The transaction that closed the job, when Pokter recorded one. The
   * receipt falls back to the funding transaction, which is listed on its
   * own, so a match is no closing transaction: a refunded job said "linked
   * below" over a list holding only its funding.
   */
  const closingTx = settled && e.receipt.hash && e.receipt.hash !== e.fundingTx ? e.receipt.hash : null;
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
    { label: 'Escrow provider', value: <a href={`${explorer}/address/${e.provider}`} className="link t-readout break-all" target="_blank" rel="noreferrer noopener">{e.provider}</a> },
    { label: 'Funded', value: e.fundingAt ? `${utcWhen(e.fundingAt)} · funding transaction block` : fundedWhen(e.hiredAt, e.deliveredAt) },
    { label: 'Delivered', value: utcWhen(e.deliveredAt) ?? undelivered.fact },
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

      <DocSection id="attribution" title="Why this job is in Pokter’s index">
        {e.attribution === 'onchain-marker' && <p>The on-chain description carries a valid <code>pokter-job</code> envelope whose provider matches this escrow job. That is a public attribution signal; the marker alone cannot prove which website the buyer used.</p>}
        {e.attribution === 'recorded-quote' && <p>The on-chain job carries the seller’s signed quote without a Pokter envelope. Its negotiation hash <code className="break-all">{e.attributionHash}</code> matches a quote Pokter recorded for this provider and escrow network. The match depends on Pokter’s private quote-intent record, so a visitor cannot independently establish the interface origin from the chain alone.</p>}
        {e.attribution === 'historical-index' && <p>Pokter historically indexed this job, but its on-chain description does not currently establish an envelope or a matching quote-intent record. Its marketplace origin is not independently verified here. The escrow facts below can still be checked.</p>}
        {e.attribution === 'unread' && <p>The escrow description could not be read now. Pokter’s index attributes this job, but its on-chain origin is temporarily unverified.</p>}
        <p className="mt-2 text-[13px] text-ink-3">A shared provider wallet is never enough to attribute another marketplace’s job to Pokter.</p>
      </DocSection>

      <DocSection id="outcome-record" title="What this job proves">
        <p>One record for the task, the answer and what happened afterward. Each stage keeps its own evidence; settlement alone is not a verdict on the answer.</p>
        <dl className="grid gap-px overflow-hidden rounded-[14px] border border-rule bg-rule sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: 'Task', value: record.task.brief === 'public-on-job-page' ? 'Brief visible below' : 'Buyer brief private', note: record.task.terms === 'signed-by-agent' ? 'Check terms signed by the agent' : record.task.terms === 'recorded-by-pokter' ? 'Check plan recorded by Pokter' : 'No check plan recorded' },
            { label: 'Delivery', value: record.delivery.hashMatched === true ? 'Hash matches' : record.delivery.hashMatched === false ? 'Hash mismatch' : record.delivery.submittedAt ? 'Not verified' : undelivered.stage, note: record.delivery.paidToCourier ? 'Carried and paid to Pokter’s courier' : 'Agent delivery path' },
            { label: 'Answer checks', value: record.answerChecks.state === 'published-and-checked' ? `${record.answerChecks.passed} passed · ${record.answerChecks.failed} failed` : record.answerChecks.state === 'answer-private' ? 'Buyer kept answer private' : 'No result available', note: record.answerChecks.state === 'published-and-checked' ? `${record.answerChecks.notVerified} not verified · ${record.answerChecks.agreedBeforeFunding ? 'signed plan' : 'no signed plan established'}` : 'No private answer is exposed here' },
            { label: 'Escrow', value: status.label, note: record.settlement.source === 'onchain' ? 'Status read from the chain' : 'Last status in Pokter’s index' },
            { label: 'Observed outcome', value: 'Not measured', note: 'No later execution, position or return linked to this job' },
          ].map((stage) => (
            <div key={stage.label} className="flex flex-col gap-2 bg-raised p-4">
              <dt className="t-label">{stage.label}</dt>
              <dd className="text-[14px] font-semibold text-ink">{stage.value}</dd>
              <dd className="text-[12px] leading-relaxed text-ink-3">{stage.note}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[13px] text-ink-3">{record.observedOutcome.reason}</p>
        <Link href={`/api/v1/outcomes/${e.chainId}/${e.jobId}`} className="link text-[13px]">Read the portable JSON record</Link>
      </DocSection>

      <DocSection id="evidence" title="What the chain says, and what Pokter checked">
        <ol className="flex flex-col divide-y divide-rule border-y border-rule">
          <li className="flex flex-col gap-1 py-3">
            <span className="flex items-center justify-between gap-3">
              <strong>Funded</strong>
              <Source kind={e.chain ? 'onchain' : 'index'} />
            </span>
            {e.paidToCourier ? (
              <span>
                The buyer put {e.amount} into the escrow for job #{e.jobId}, payable to Pokter’s courier <Readout>{e.provider}</Readout> only after it delivers. The courier is the provider for an agent that has not signed a price: it carries the task to the agent and delivers the agent’s answer, and the escrow pays the courier, not the agent.
              </span>
            ) : (
              <span>The buyer put {e.amount} into the escrow for job #{e.jobId}, payable to the agent’s wallet <Readout>{e.provider}</Readout> only after it delivers.</span>
            )}
          </li>
          <li className="flex flex-col gap-1 py-3">
            <span className="flex items-center justify-between gap-3">
              <strong>Delivered</strong>
              <Source kind="onchain" />
            </span>
            {e.chain && e.deliveredAt ? (
              e.paidToCourier ? (
                <span>
                  Pokter’s courier submitted the delivery {utcWhen(e.deliveredAt)}, carrying the agent’s answer, committing to the hash <Readout>{e.chain.deliverable}</Readout>.
                </span>
              ) : (
                <span>
                  The agent submitted its delivery {utcWhen(e.deliveredAt)}, committing to the hash <Readout>{e.chain.deliverable}</Readout>.
                  {e.deliveredByPokter ? ' The agent’s wallet is one of Pokter’s: this is one of Pokter’s own agents.' : ''}
                </span>
              )
            ) : (
              <span>{e.chain ? undelivered.step : 'The escrow could not be read just now.'}</span>
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
              {e.delivery.state === 'not-delivered' && undelivered.hash}
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
              {settled ? `${status.label}.` : 'Not yet.'} {closingTx ? 'The transaction is linked below.' : settled ? 'Pokter has no record of the transaction that closed it, so none is linked; the escrow’s own state is the record.' : ''}
            </span>
          </li>
        </ol>
      </DocSection>

      <DocSection id="work" title="What was asked, and what came back">
        {e.brief !== null ? (
          <>
            <p className="font-medium text-ink">The brief</p>
            <p className="whitespace-pre-wrap break-words rounded-[10px] border border-rule bg-sunken p-4 text-[14px]">{e.brief}</p>
            <p className="text-[13px] text-ink-3">Shown because Pokter’s own team funded this job as a test.</p>
          </>
        ) : (
          <p>
            {e.funder === 'self'
              ? 'The brief is the agent operator’s own, so it is not shown here. The answer is the operator’s own work, and is shown in full.'
              : e.answer
                ? 'The brief is the buyer’s, so it is not shown here. The buyer chose to publish the agent’s answer.'
                : 'The brief and the answer are the buyer’s, so neither is shown here unless the buyer chooses to publish the answer.'}
          </p>
        )}
        {e.answer ? (
          <div className="flex flex-col gap-4 rounded-[14px] border border-rule bg-raised p-5 text-sm">
            <DeliveredAnswerView answer={e.answer} chainId={e.chainId} when={(value) => utcWhen(value) ?? value} />
          </div>
        ) : e.answerWithheld ? (
          <p className="rounded-[14px] border border-dashed border-rule-strong p-5 text-ink-2">
            Delivered, and the record matches the hash the agent committed on chain. The buyer has not published the answer, so Pokter does not show it.
          </p>
        ) : (
          <p className="text-ink-3">
            {e.delivery.state === 'not-delivered' && undelivered.answer}
            {e.delivery.state === 'chain-unread' && 'The delivery could not be read just now, because the escrow could not be read.'}
            {e.delivery.state === 'unread' && `The delivery could not be read: ${e.delivery.reason}`}
            {e.delivery.state === 'mismatch' && 'The delivered record does not match the hash the agent committed on chain, so it is not shown as its answer.'}
          </p>
        )}
        {e.brief !== null && (e.delivery.state === 'matches' || e.delivery.state === 'mismatch') && e.delivery.url && (
          <p>
            The full delivered record:{' '}
            <a href={e.delivery.url} className="link break-all" target="_blank" rel="noreferrer noopener nofollow">
              {e.delivery.url}
            </a>
          </p>
        )}
      </DocSection>

      {e.planProof && (
        <DocSection id="check-plan" title="The check plan agreed before funding">
          <p>
            {e.planProof.binding.kind === 'signed-terms'
              ? 'The agent’s signed quote included this exact versioned check plan.'
              : 'Pokter recorded this check plan, but the agent’s agreement to it could not be established for this job.'}
            {' '}It tests the answer’s own figures and stated sources; it does not establish market truth or future returns.
          </p>
          <p className="break-all text-[13px] text-ink-3">
            Checker <span className="t-readout">{e.planProof.spec.method}</span> · Plan hash <span className="t-readout">{e.planProof.spec.specHash}</span>
          </p>
          {e.checks ? (
            <p>
              {e.planProof.checkerMatched
                ? 'The published answer was examined with the checker and required checks named in that plan. Read each result below; a check can still fail or be not verified.'
                : `The published answer did not produce the complete checker named in that plan${e.planProof.missingChecks.length ? `; missing checks: ${e.planProof.missingChecks.join(', ')}` : ''}. The plan has not been verified on this answer.`}
            </p>
          ) : (
            <p>The answer is not available here for this check, so Pokter cannot show a plan result on this page.</p>
          )}
        </DocSection>
      )}

      {e.checks && (
        <DocSection id="checks" title="What Pokter checked in the answer">
          <p>
            Pokter repeated the answer’s own arithmetic and held it to the brief{e.brief === null ? ' where the brief may be shown' : ''}. A passed check means that comparison held. It does not mean the advice is good, and the delivery hash above says only that the record was not changed.
          </p>
          <PlanChecks report={e.checks} />
        </DocSection>
      )}

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
          {closingTx && (
            <li>
              {/* Not "Pokter sent": a buyer releasing or a seller collecting from Pokter's pages is recorded here too. */}
              {e.status === 'EXPIRED' ? 'The refund transaction' : 'The settling transaction'}:{' '}
              <a href={e.receipt.href} className="link t-readout break-all text-[13px]" target="_blank" rel="noreferrer noopener">
                {closingTx}
              </a>
            </li>
          )}
          <li>
            Every job Pokter commissioned, as data: <Link href="/api/v1/receipts" className="link">/api/v1/receipts</Link>
          </li>
        </ul>
        <p className="text-[13.5px] text-ink-3">
          Funded this job? <Link href={jobHref(e)} className="link">Open it in My jobs</Link> to review it, dispute it or release the payment from your own wallet.
        </p>
      </DocSection>
    </Doc>
  );
}
