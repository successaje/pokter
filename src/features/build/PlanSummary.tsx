'use client';

import type { DraftFields } from '@/lib/builder/drafts';
import { blockingQuestions, routineDecisions, suppliedFields } from '@/lib/builder/style';
import { Details } from '@/ui/Data';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

const FIELD_LABEL: Record<string, string> = {
  name: 'name',
  description: 'description',
  category: 'category',
  endpoint: 'endpoint',
  image: 'image',
  repository: 'repository',
};

/**
 * What Pokter has decided, what it still needs, and what it already has.
 *
 * Three things a builder in Recommend-and-build cannot otherwise see.
 *
 * The decisions are shown rather than silently taken: a choice made on
 * somebody's behalf and never told to them is indistinguishable from one
 * they will later be blamed for. The questions are grouped into one
 * message instead of arriving a step at a time, because what a builder
 * needs is to know how many there are. And the third list is the
 * promise being kept — everything on it will not be asked for again.
 */
export function PlanSummary({ draft, step }: { draft: DraftFields; step: number }) {
  const decisions = routineDecisions(draft);
  const questions = blockingQuestions(draft);
  const supplied = suppliedFields(draft);
  const outstanding = questions.filter((question) => question.step >= step);

  return (
    <div className="flex flex-col gap-3">
      {outstanding.length > 0 && (
        <Notice
          tone="neutral"
          icon={<Icon.Info size={15} />}
          title={outstanding.length === 1 ? 'One thing Pokter cannot decide for you' : `${outstanding.length} things Pokter cannot decide for you`}
        >
          <ul className="flex flex-col gap-2">
            {outstanding.map((question) => (
              <li key={question.id}>
                <span className="font-medium text-ink">{question.question}</span>{' '}
                <span className="text-ink-3">{question.because}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12.5px] text-ink-3">
            That is the whole list. Everything else below is already decided, and the build carries on while you answer.
          </p>
        </Notice>
      )}

      {supplied.length > 0 && (
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Already have your {supplied.map((field) => FIELD_LABEL[field]).join(', ')} — Pokter will not ask again.
        </p>
      )}

      <Details summary={`${decisions.length} decisions Pokter took for you`}>
        <ul className="flex flex-col gap-2.5">
          {decisions.map((decision) => (
            <li key={decision.id} className="flex flex-col gap-0.5 text-[13px] leading-relaxed">
              <span className="font-medium">{decision.decision}</span>
              <span className="text-ink-3">{decision.because}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] text-ink-3">
          Every one is reversible on the step that owns it. Switch to <span className="font-medium text-ink-2">Build with me</span> to be
          offered them instead.
        </p>
      </Details>
    </div>
  );
}
