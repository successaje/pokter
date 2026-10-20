'use client';

import { useMemo, useState } from 'react';

import { CATEGORIES } from '@/lib/agents/categories';
import { createAgentBuildPrompt } from '@/lib/builder/ai-prompt';
import { RUNTIME_OPTIONS } from '@/features/studio/useAgentDraft';
import { CopyButton } from '@/ui/Data';
import { Field, Input, Select, Textarea } from '@/ui/Field';

/**
 * The build prompt, ready to copy, sharpened by whatever the builder adds.
 *
 * It is the same prompt the guided form produces on its Configure step.
 * Left blank it tells the assistant to start by asking about the agent;
 * filled in, it starts from the builder's direction instead. Nothing here
 * is saved or sent: it is text for their own tool.
 */
export function PromptBuilder() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const prompt = useMemo(() => {
    const runtime = RUNTIME_OPTIONS[category];
    return createAgentBuildPrompt({
      name: name.trim(),
      description: description.trim(),
      category: CATEGORIES.find((c) => c.id === category)?.label ?? '',
      protocol: 'a2a',
      target: runtime?.target[0] ?? '',
      policy: runtime?.policy[0] ?? '',
      output: runtime?.output[0] ?? '',
    });
  }, [name, description, category]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" hint="Optional.">
          {(p) => <Input {...p} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Position Guardian" />}
        </Field>
        <Field label="Category" hint="Optional.">
          {(p) => (
            <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Let the assistant ask</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="What should it do?" hint="Optional. What it returns, for whom, and what it will not do.">
        {(p) => <Textarea {...p} value={description} maxLength={600} onChange={(e) => setDescription(e.target.value)} placeholder="Checks a Venus lending position and returns a read-only risk report, without moving funds." />}
      </Field>
      <div className="relative">
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-[10px] border border-rule bg-sunken p-4 pr-12 text-[12px] leading-relaxed">{prompt}</pre>
        <CopyButton value={prompt} label="Copy prompt" className="absolute right-2 top-2 bg-sunken" />
      </div>
    </div>
  );
}
