'use client';

import { useState } from 'react';

import { CONCEPTS, RECOMMENDATION_REASON, RECOMMENDED_CONCEPT_ID, conceptById, type AgentConcept } from '@/lib/builder/concepts';
import { cn } from '@/lib/ui/cn';
import { Button } from '@/ui/Button';
import { Details } from '@/ui/Data';
import { Icon } from '@/ui/icons';

/**
 * Five agents worth building, for somebody who has not decided.
 *
 * "What should I build?" used to be answered with five category names and
 * a blank form, which answers nothing: a category is a shelf. Each card
 * names the customer, the task, what the buyer has to supply, what comes
 * back, the limit of what it can honestly say, and why anybody would pay
 * — the two that a category name leaves out are the customer and the
 * limit, and they are the two that decide whether it is a business.
 *
 * Nothing is applied until a button is pressed. "Choose for me" is an
 * explicit instruction, not a default that fires if the reader hesitates,
 * and "I already know what to build" dismisses the proposals without
 * guessing what they are instead. Closing the page and coming back finds
 * the same state, because the choice is saved with the draft.
 */
export function ConceptPicker({
  onChoose,
  onDismiss,
  chosenId,
}: {
  onChoose: (concept: AgentConcept) => void;
  onDismiss: () => void;
  chosenId: string | null;
}) {
  const [open, setOpen] = useState<string | null>(RECOMMENDED_CONCEPT_ID);
  const recommended = conceptById(RECOMMENDED_CONCEPT_ID);

  return (
    <section aria-labelledby="concepts-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="concepts-title" className="t-h3">
          Five agents worth building
        </h2>
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          Different customers, not five versions of one idea. Every one reads and reports: Pokter grants no agent authority
          over a buyer&rsquo;s wallet, so an agent that promised to trade for somebody could not be built here.
        </p>
      </div>

      {recommended && (
        <div className="rounded-[14px] border border-ink bg-sunken/50 p-4">
          <p className="flex items-center gap-2 text-[12.5px] font-medium">
            <Icon.Spark size={14} aria-hidden /> Recommended: {recommended.title}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{RECOMMENDATION_REASON}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* The delegating option, which is this one: the heading above
                already names what "for me" means, so pressing it is not a
                blind choice. Nothing happens until it is pressed. */}
            <Button size="s" onClick={() => onChoose(recommended)} trailing={<Icon.Arrow size={14} />}>
              Choose for me
            </Button>
            <Button size="s" intent="ghost" onClick={onDismiss}>
              I already know what to build
            </Button>
            <span className="text-[12px] text-ink-3">Or pick another below. Nothing is decided until you press one.</span>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {CONCEPTS.map((concept) => {
          const expanded = open === concept.id;
          const chosen = chosenId === concept.id;
          return (
            <li
              key={concept.id}
              className={cn(
                'rounded-[14px] border bg-raised',
                chosen ? 'border-ok' : concept.id === RECOMMENDED_CONCEPT_ID ? 'border-rule-strong' : 'border-rule',
              )}
            >
              <h3>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`concept-${concept.id}`}
                  onClick={() => setOpen(expanded ? null : concept.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <Icon.ChevronRight size={14} className={cn('shrink-0 text-ink-3 transition-transform duration-200', expanded && 'rotate-90')} aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[14.5px] font-medium">{concept.title}</span>
                    <span className="truncate text-[12.5px] text-ink-3">{concept.task}</span>
                  </span>
                  {chosen && <span className="shrink-0 text-[11.5px] font-medium text-ok">Taken</span>}
                  {!chosen && concept.id === RECOMMENDED_CONCEPT_ID && (
                    <span className="shrink-0 rounded-full border border-rule-strong px-2 py-0.5 text-[11px] font-medium text-ink-2">Recommended</span>
                  )}
                </button>
              </h3>
              {expanded && (
                <div id={`concept-${concept.id}`} className="flex flex-col gap-3 border-t border-rule px-4 py-4">
                  <dl className="grid grid-cols-1 gap-3 text-[13px] leading-relaxed sm:grid-cols-2">
                    <div>
                      <dt className="t-label">Who pays</dt>
                      <dd className="mt-1 text-ink-2">{concept.customer}</dd>
                    </div>
                    <div>
                      <dt className="t-label">What comes back</dt>
                      <dd className="mt-1 text-ink-2">{concept.output}</dd>
                    </div>
                    <div>
                      <dt className="t-label">What the buyer must supply</dt>
                      <dd className="mt-1 text-ink-2">
                        <ul className="list-disc pl-4">
                          {concept.inputs.map((input) => (
                            <li key={input}>{input}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                    <div>
                      <dt className="t-label">What it cannot say</dt>
                      <dd className="mt-1 text-ink-2">{concept.limitation}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="t-label">Why anyone would hire it</dt>
                      <dd className="mt-1 text-ink-2">{concept.whyHire}</dd>
                    </div>
                  </dl>
                  <Details summary="Names you could use">
                    <ul className="flex flex-wrap gap-2">
                      {concept.nameSuggestions.map((name) => (
                        <li key={name} className="t-readout rounded-full border border-rule bg-sunken px-2.5 py-1 text-[12px]">
                          {name}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[12.5px] text-ink-3">
                      Suggestions only. Rename it on the next screen, or now, or never — the name is not a blocker.
                    </p>
                  </Details>
                  <div className="flex flex-wrap gap-2">
                    <Button size="s" intent={concept.id === RECOMMENDED_CONCEPT_ID ? 'primary' : 'secondary'} onClick={() => onChoose(concept)}>
                      {chosen ? 'Fill the blanks again' : 'Build this one'}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[12.5px] leading-relaxed text-ink-3">
        Taking one fills the blanks below and changes nothing you have already typed. Everything stays editable, and you can
        refine it as much as you like before anything is published.
      </p>
    </section>
  );
}
