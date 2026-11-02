'use client';

import { useState } from 'react';

import { PlanChecks } from '@/features/delivery/PlanChecks';
import { checkDeliveredPlan, type PlanCheckReport } from '@/lib/delivery/plan-checks';
import type { PlanProofSpec } from '@/lib/delivery/plan-proof';

type Kind = 'research' | 'trading' | 'content';

const EXAMPLES: Record<Kind, { answer: Record<string, unknown>; brief: string }> = {
  research: {
    answer: {
      type: 'research',
      findings: [
        { claim: 'The agent has an ERC-8004 identity', source: 'ERC-8004 registry record', provenance: 'onchain' },
        { claim: 'The observation covers ten calls', source: 'Pokter probe history', provenance: 'pokter-measured' },
      ],
      calls: { value: { taken: 10, answered: 9 }, source: 'Pokter probe history', provenance: 'pokter-measured' },
      uptime: { value: 0.9, source: 'Calculated from the call counts', provenance: 'pokter-measured' },
      as_of: { time: '2026-11-02T10:00:00Z' },
      sources: ['ERC-8004 registry record', 'Pokter probe history'],
    },
    brief: '',
  },
  trading: {
    answer: {
      direction: 'long', entry_price: 100, stop_price: 90, take_profit_price: 120,
      size_units: 2, risk_usd: 20, reward_usd: 40, risk_reward_ratio: 2,
      fee_usd: 1, slippage_pct: 0.5,
      as_of: { time: '2026-11-02T10:00:00Z' },
      sources: ['Example market quote at the stated time'],
    },
    brief: '',
  },
  content: {
    answer: {
      draft: 'Explore BNB Chain with a clear plan today.', word_count: 8, format: 'post',
      claims: [{ text: 'BNB Chain supports agents.', source: 'BNB Chain documentation' }],
      as_of: { time: '2026-11-02T10:00:00Z' },
      sources: ['BNB Chain documentation'],
    },
    brief: JSON.stringify({ data: { min_words: 7, max_words: 9, format: 'post', required_phrases: ['BNB Chain'] } }, null, 2),
  },
};

const LABEL: Record<Kind, string> = { research: 'Research', trading: 'Trading', content: 'Content' };
const sample = (kind: Kind) => JSON.stringify(EXAMPLES[kind].answer, null, 2);

export function DeliveryCheckPlayground({ specs }: { specs: Record<Kind, PlanProofSpec> }) {
  const [kind, setKind] = useState<Kind>('research');
  const [answer, setAnswer] = useState(sample('research'));
  const [brief, setBrief] = useState(EXAMPLES.research.brief);
  const [report, setReport] = useState<PlanCheckReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);
  const spec = specs[kind];

  function choose(next: Kind) {
    setKind(next);
    setAnswer(sample(next));
    setBrief(EXAMPLES[next].brief);
    setReport(null);
    setError(null);
    setRan(false);
  }

  function run() {
    try {
      JSON.parse(answer);
    } catch {
      setError('The answer is not valid JSON. Check commas and quotation marks, then run it again.');
      setReport(null);
      setRan(true);
      return;
    }
    const next = checkDeliveredPlan(answer, brief.trim() || null);
    setReport(next);
    setError(next ? null : 'Use a JSON object, or a delivery manifest with a JSON object in response.content.');
    setRan(true);
  }

  const missing = report?.kind === spec.kind && report.method === spec.method
    ? spec.requiredChecks.filter((id) => !report.checks.some((check) => check.id === id))
    : [...spec.requiredChecks];
  const matched = Boolean(report && missing.length === 0);

  return (
    <div className="flex flex-col gap-5 rounded-[16px] border border-rule bg-raised p-4 sm:p-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose delivery kind">
        {(Object.keys(LABEL) as Kind[]).map((option) => (
          <button key={option} type="button" aria-pressed={kind === option} onClick={() => choose(option)}
            className={`rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${kind === option ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-2 hover:border-ink hover:text-ink'}`}>
            {LABEL[option]}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1 border-b border-rule pb-4 text-[12.5px] text-ink-3">
        <p>Checker <span className="t-readout text-ink-2">{spec.method}</span></p>
        <p className="break-all">Plan hash <span className="t-readout text-ink-2">{spec.specHash}</span></p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-2 text-[13px] font-medium text-ink" htmlFor="delivery-answer">
          Answer JSON
          <textarea id="delivery-answer" spellCheck={false} maxLength={50000} value={answer} onChange={(event) => { setAnswer(event.target.value); setRan(false); }}
            className="min-h-80 w-full resize-y rounded-[10px] border border-rule-strong bg-paper p-3 font-mono text-[12px] font-normal leading-relaxed text-ink outline-none focus:border-ink" />
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-[13px] font-medium text-ink" htmlFor="delivery-brief">
          Buyer brief, if available
          <textarea id="delivery-brief" spellCheck={false} maxLength={10000} value={brief} onChange={(event) => { setBrief(event.target.value); setRan(false); }}
            placeholder="Paste the buyer’s brief. Structured data lets Pokter compare exact terms."
            className="min-h-48 w-full resize-y rounded-[10px] border border-rule-strong bg-paper p-3 font-mono text-[12px] font-normal leading-relaxed text-ink outline-none focus:border-ink" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} className="rounded-[9px] bg-ink px-4 py-2.5 text-[13px] font-semibold text-paper hover:opacity-85">Run checks</button>
        <button type="button" onClick={() => choose(kind)} className="rounded-[9px] border border-rule-strong px-4 py-2.5 text-[13px] text-ink-2 hover:border-ink hover:text-ink">Reset example</button>
        <span className="text-[12px] text-ink-3">Runs in this browser. Pasted text is not sent to Pokter.</span>
      </div>
      {ran && (
        <div aria-live="polite" className="border-t border-rule pt-5">
          {error ? <p role="alert" className="text-[13px] text-bad">{error}</p> : report && (
            <div className="flex flex-col gap-5">
              <div className={`rounded-[10px] border p-3 text-[13px] ${matched ? 'border-ok bg-ok-wash text-ink' : 'border-watch bg-watch-wash text-ink'}`}>
                {matched
                  ? `The ${spec.method} checker ran with every check named in this plan. Read each outcome below; matching the plan does not mean the answer passed.`
                  : `This answer did not run the complete ${spec.method} checker. ${missing.length} plan checks are missing. The answer may use a different shape.`}
              </div>
              <PlanChecks report={report} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
