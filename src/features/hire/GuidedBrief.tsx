'use client';

import { useMemo, useState } from 'react';

import { recipeProblems, type BriefRecipe } from '@/lib/hire/brief-recipes';
import { cn } from '@/lib/ui/cn';
import { Input } from '@/ui/Field';

/**
 * Questions for a brief format the agent published, composed into its
 * exact wording. The operator's example supplies placeholders only.
 *
 * The composed text stays editable below; a hand edit that no longer
 * fits the format turns the questions off rather than overwriting it.
 */
export function GuidedBrief({
  recipe,
  example,
  agentName,
  task,
  onChange,
}: {
  recipe: BriefRecipe;
  example: string | null;
  agentName: string;
  task: string;
  onChange: (task: string) => void;
}) {
  const placeholders = useMemo(() => (example ? recipe.parse(example) : null) ?? {}, [example, recipe]);
  const [values, setValues] = useState<Record<string, string>>(() => recipe.parse(task) ?? {});
  const parsed = recipe.parse(task);
  // The brief was edited by hand into something else: leave it as written.
  const handEdited = task.trim() !== '' && parsed === null;
  const shown = parsed ?? values;
  const problems = recipeProblems(recipe, shown);

  const set = (key: string, value: string) => {
    const next = { ...shown, [key]: value };
    setValues(next);
    onChange(recipeProblems(recipe, next).length === 0 ? recipe.compose(next) : '');
  };

  return (
    <fieldset className="flex flex-col gap-3 rounded-[12px] border border-rule bg-paper p-4">
      <legend className="px-1 text-sm font-medium">{recipe.title}</legend>
      <p className="text-[12.5px] text-ink-3">
        The format {agentName} publishes on its card{example ? `: “${example}”` : ''}. Its figures are the operator’s example,
        not market data or a suggestion; enter your own.
      </p>
      {handEdited ? (
        <p className="text-[12.5px] text-ink-3">The brief below was edited by hand and no longer fits this format, so it is sent as written.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {recipe.fields.map((field) => (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-[12.5px] font-medium">{field.label}</span>
              {field.kind === 'choice' ? (
                <div role="radiogroup" aria-label={field.label} className="flex gap-2">
                  {field.options?.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={shown[field.key] === option.value}
                      onClick={() => set(field.key, option.value)}
                      className={cn('rounded-[10px] border px-3 py-2 text-[13px]', shown[field.key] === option.value ? 'border-ink bg-raised' : 'border-rule hover:border-rule-strong')}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <Input
                  value={shown[field.key] ?? ''}
                  onChange={(e) => set(field.key, e.target.value)}
                  inputMode={field.kind === 'number' ? 'decimal' : undefined}
                  placeholder={placeholders[field.key] ? `e.g. ${placeholders[field.key]}` : field.hint}
                  spellCheck={false}
                  autoComplete="off"
                  className={cn(field.kind !== 'text' && 't-readout text-[13px]')}
                />
              )}
              {field.hint && field.kind !== 'choice' && <span className="text-[11.5px] text-ink-3">{field.hint}</span>}
            </label>
          ))}
        </div>
      )}
      {!handEdited && problems.length > 0 && (
        <p className="text-[12.5px] text-ink-3" aria-live="polite">To compose the brief: {problems.join('; ')}.</p>
      )}
    </fieldset>
  );
}
