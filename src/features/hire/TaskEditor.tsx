'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { composeTask, fieldsWithValues, taskFieldProblems, taskFields, withWallet, type TaskField } from '@/lib/hire/task-fields';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { Input, Textarea } from '@/ui/Field';

function labelOf(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The task, as the agent asked for it.
 *
 * Prose stays a text box. A task the agent declared as JSON is shown as one
 * field per key, typed as its example was, with the routing key (`skill`)
 * shown rather than edited and an empty wallet filled from the connected
 * one. The JSON stays one click away for anyone who wants it.
 */
export function TaskEditor({
  task,
  schema,
  onChange,
  wallet,
  hintId,
  label = 'Task',
  placeholder,
}: {
  label?: string;
  placeholder?: string;
  task: string;
  /** The template's fixed field layout; null for a prose task. */
  schema?: TaskField[] | null;
  onChange: (task: string) => void;
  wallet: string | null;
  hintId: string;
}) {
  // Values read into the template's layout, so a field keeps its type while edited.
  const fields = useMemo(() => (schema ? fieldsWithValues(schema, task) : taskFields(task)), [schema, task]);
  const [asJson, setAsJson] = useState(false);
  // A wallet the buyer cleared or typed stays as they left it.
  const walletTouched = useRef(false);
  // "Required" is said by the label; the error waits until a field is left empty on purpose.
  const [touched, setTouched] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!fields || !wallet || walletTouched.current) return;
    const filled = withWallet(fields, wallet);
    if (filled) onChange(composeTask(filled));
  }, [fields, wallet, onChange]);

  if (!fields || asJson) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="task" className="text-sm font-medium">
            {label}
          </label>
          {fields && (
            <button type="button" className="text-[12.5px] font-medium text-ink-2 hover:text-ink hover:underline" onClick={() => setAsJson(false)}>
              Edit as fields
            </button>
          )}
        </div>
        <Textarea id="task" value={task} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} maxLength={2000} className={cn('min-h-40', fields && 't-readout text-[13px]')} aria-describedby={hintId} />
      </div>
    );
  }

  const update = (key: string, value: string) => {
    onChange(composeTask(fields.map((field) => (field.key === key ? { ...field, value } : field))));
  };

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={hintId}>
      <div className="flex items-baseline justify-between gap-3">
        <legend className="text-sm font-medium">{label}</legend>
        <button type="button" className="text-[12.5px] font-medium text-ink-2 hover:text-ink hover:underline" onClick={() => setAsJson(true)}>
          Edit as JSON
        </button>
      </div>
      <p className="-mt-1 text-[12.5px] text-ink-3">The agent asked for these inputs on its card. It receives them as JSON, exactly as filled in here.</p>
      {fields.map((field) => (
        <FieldRow
          key={field.key}
          field={field}
          wallet={wallet}
          problem={(() => {
            const problem = taskFieldProblems([field])[0] ?? null;
            return problem && (field.value.trim() !== '' || touched.has(field.key)) ? problem : null;
          })()}
          onBlur={() => setTouched((prev) => new Set(prev).add(field.key))}
          onChange={(value) => {
            if (field.wallet) walletTouched.current = true;
            update(field.key, value);
          }}
        />
      ))}
    </fieldset>
  );
}

function FieldRow({ field, wallet, problem, onChange, onBlur }: { field: TaskField; wallet: string | null; problem: string | null; onChange: (value: string) => void; onBlur: () => void }) {
  const id = `task-${field.key}`;
  if (field.fixed) {
    return (
      <div className="flex items-baseline justify-between gap-3 rounded-[10px] border border-rule bg-sunken px-3 py-2 text-[13px]">
        <span className="text-ink-2">{labelOf(field.key)}</span>
        <span className="t-readout text-ink">{field.value}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium">
          {labelOf(field.key)}
          {field.required && <span className="text-ink-3"> · required</span>}
        </label>
        {field.wallet && wallet && field.value.toLowerCase() !== wallet.toLowerCase() && (
          <button type="button" className="text-[12px] font-medium text-ink-2 hover:text-ink hover:underline" onClick={() => onChange(wallet)}>
            Use my wallet ({shortAddress(wallet)})
          </button>
        )}
      </div>
      {field.kind === 'boolean' ? (
        <select id={id} value={field.value === 'true' ? 'true' : 'false'} onChange={(e) => onChange(e.target.value)} className="h-11 rounded-[10px] border border-rule-strong bg-paper px-3 text-sm">
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : field.kind === 'json' ? (
        <Textarea id={id} value={field.value} onChange={(e) => onChange(e.target.value)} className="t-readout min-h-20 text-[13px]" aria-invalid={Boolean(problem)} />
      ) : (
        <Input
          id={id}
          value={field.value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          inputMode={field.kind === 'number' ? 'decimal' : undefined}
          placeholder={field.wallet ? '0x… the address to check' : field.address ? '0x… the token, pool or contract address' : field.example}
          spellCheck={false}
          autoComplete="off"
          className={cn((field.wallet || field.address) && 't-readout text-[13px]')}
          aria-invalid={Boolean(problem)}
        />
      )}
      {problem && <p className="text-[12px] text-bad">{problem.charAt(0).toUpperCase() + problem.slice(1)}.</p>}
    </div>
  );
}
