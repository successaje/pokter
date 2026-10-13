import type { Metadata } from 'next';
import Link from 'next/link';

import { EVALUATOR_ATTESTATION_EXAMPLE } from '@/lib/evaluators/schema';
import { Doc, DocSection } from '@/features/content/Doc';

export const metadata: Metadata = {
  title: 'Independent evaluators',
  description: 'Publish independently attributable ERC-8004 measurements that Pokter can verify and count.',
};

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-[10px] border border-rule bg-sunken p-4 text-[12px] leading-relaxed text-ink">{children}</pre>;
}

export default function EvaluatorsPage() {
  return (
    <Doc
      label="Independent evidence"
      title="Measure an agent without asking Pokter to trust your name"
      lede="Publish an ERC-8004 feedback receipt from your own wallet. Pokter reads the transaction author, validates the measurement body and shows the limitations you disclose."
      toc={[{ id: 'counted', label: 'What counts' }, { id: 'format', label: 'Attestation format' }, { id: 'publish', label: 'Publish and verify' }, { id: 'reputation', label: 'Evaluator reputation' }]}
    >
      <DocSection id="counted" title="What counts as independent">
        <p>The evaluator identity is the wallet that submitted the feedback transaction—not the name inside the JSON. Pokter counts it only when that wallet is readable from chain and is neither the agent owner nor a declared Pokter wallet.</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Two labels published by one wallet are one measurer.</li>
          <li>An unreadable transaction author is disclosed as undetermined and counted neither way.</li>
          <li>Pokter measurements can affect the evidence score, but never satisfy the independent-measurer requirement.</li>
          <li>A feedback receipt that does not meet the schema remains visible on chain but is not scored.</li>
        </ul>
      </DocSection>

      <DocSection id="format" title="Attestation format">
        <p>Publish the JSON as a base64 data URI in the ERC-8004 feedback URI. The numeric feedback value remains the score source; the body explains what was measured, over what window, from where, and how the method can be wrong.</p>
        <Code>{JSON.stringify(EVALUATOR_ATTESTATION_EXAMPLE, null, 2)}</Code>
        <p>Machine-readable schema: <Link className="link" href="/api/v1/evaluators/schema">GET /api/v1/evaluators/schema</Link>.</p>
      </DocSection>

      <DocSection id="publish" title="Publish and verify">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Measure a public agent endpoint repeatedly; do not turn one successful request into an uptime claim.</li>
          <li>Record probe count, answered count, elapsed window, vantage point and every known defect.</li>
          <li>Publish the score and data URI as ERC-8004 feedback from the evaluator wallet.</li>
          <li>Open the agent&rsquo;s Pokter page or public API response. Confirm the receipt shows your transaction-author wallet and the intended independence state.</li>
        </ol>
        <p>Pokter does not accept uploaded screenshots, private reports or an API call as a substitute for the on-chain receipt.</p>
      </DocSection>

      <DocSection id="reputation" title="Evaluator reputation starts with receipts">
        <p>Pokter does not endorse an evaluator merely because it has published. The initial reputation record is deliberately narrow: author wallet, number of conforming receipts, agents covered, disclosed methodology and whether later observations agree. A public evaluator directory will appear only when enough unrelated wallets have real records to compare; an empty directory padded with Pokter-operated identities would defeat the point.</p>
      </DocSection>
    </Doc>
  );
}
