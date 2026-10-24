import Link from 'next/link';

import { builderChecklist, type ChecklistStatus } from '@/lib/builder/checklist';
import { Icon } from '@/ui/icons';
import { cn } from '@/lib/ui/cn';
import type { AgentDraft } from './useAgentDraft';

const MARK: Record<ChecklistStatus, { icon: React.ReactNode; tone: string; word: string }> = {
  done: { icon: <Icon.Check size={13} />, tone: 'bg-ok text-paper', word: 'Done' },
  failed: { icon: <Icon.Cross size={13} />, tone: 'bg-bad text-paper', word: 'Failed' },
  todo: { icon: <Icon.Dash size={13} />, tone: 'border border-rule-strong text-ink-3', word: 'To do' },
  'after-publish': { icon: <Icon.Dash size={13} />, tone: 'border border-rule-strong text-ink-3', word: 'Checked after you publish' },
  optional: { icon: <Icon.Dash size={13} />, tone: 'border border-rule text-ink-3', word: 'Optional' },
};

/**
 * Where a draft stands on the way to a hireable listing, from the checks
 * this flow already ran: nothing here is re-run or assumed. A failed stage
 * shows the reason Pokter got and where the fix is explained.
 */
export function BuilderChecklist({ d, title = 'Before you publish' }: { d: AgentDraft; title?: string }) {
  const identityChecks = d.checks.filter((c) => c.id !== 'endpoint');
  const stages = builderChecklist({
    identity: { done: identityChecks.every((c) => c.done), missing: identityChecks.filter((c) => !c.done).map((c) => c.label.toLowerCase()) },
    endpoint: {
      /* A check of an endpoint the draft no longer names is not a check of this one. */
      checked: Boolean(d.preflight && d.preflight.endpoint === d.draft.endpoint.trim() && d.preflight.protocol === d.draft.protocol),
      ok: d.endpointChecked,
      detail: d.preflight?.detail ?? null,
      status: d.preflight?.status ?? null,
    },
    capabilities: d.preflight?.capabilities ?? [],
    quoteCapability: Boolean(d.preflight?.quoteCapability),
    trial: { ran: Boolean(d.trial) || Boolean(d.trialError), ok: Boolean(d.trial?.ok), summary: d.trial?.summary ?? null, error: d.trialError },
  });
  return (
    <section aria-labelledby="builder-checklist" className="flex flex-col gap-2">
      <h3 id="builder-checklist" className="text-sm font-medium">{title}</h3>
      <ol className="ruled rounded-[14px] border border-rule bg-raised px-5">
        {stages.map((stage, i) => {
          const mark = MARK[stage.status];
          return (
            <li key={stage.id} className="flex items-start gap-3 py-3">
              <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full', mark.tone)} aria-hidden>
                {mark.icon}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {i + 1}. {stage.label} <span className="sr-only">: {mark.word}</span>
                  <span className={cn('ml-2 text-[12px] font-normal', stage.status === 'failed' ? 'text-bad' : 'text-ink-3')} aria-hidden>
                    {mark.word}
                  </span>
                </span>
                <span className={cn('text-[12.5px]', stage.status === 'failed' ? 'text-ink-2' : 'text-ink-3')}>{stage.detail}</span>
                {stage.fix && (
                  <Link href={stage.fix.href} className="text-[12.5px] font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
                    {stage.fix.label}
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
