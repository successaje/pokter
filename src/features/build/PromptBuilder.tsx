'use client';

import { useMemo, useState } from 'react';

import { CATEGORIES } from '@/lib/agents/categories';
import { createAgentBuildPrompt, promptInputFrom } from '@/lib/builder/ai-prompt';
import type { BuildStyle } from '@/lib/builder/drafts';
import { BuildStyleSwitch } from '@/features/build/BuildStyleSwitch';
import { CopyButton } from '@/ui/Data';
import { Field, Input, Select, Textarea } from '@/ui/Field';

/**
 * The build prompt, ready to copy, sharpened by whatever the builder adds.
 *
 * It is the same prompt the guided form produces on its Configure step, and
 * now literally so: both derive their input through `promptInputFrom`, which
 * is what stops them describing the same idea two different ways.
 *
 * Left blank it asks the assistant to propose concepts and recommend one,
 * rather than to interview the builder; filled in, it starts from their
 * direction and skips proposing anything. Nothing here is saved or sent: it
 * is text for their own tool.
 */
export function PromptBuilder() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [style, setStyle] = useState<BuildStyle>('recommend');
  /* Same derivation the guided step uses, so the two prompts cannot differ
     for the same idea. Everything not on this form is defaulted there. */
  const prompt = useMemo(
    () => createAgentBuildPrompt(promptInputFrom({ name, description, categoryId: category, style })),
    [name, description, category, style],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" hint="Optional.">
          {(p) => <Input {...p} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Position Guardian" />}
        </Field>
        <Field label="Category" hint="Optional.">
          {(p) => (
            <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Let the assistant choose</option>
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
      {/* The same switch the guided flow uses, so the two pages offer the
          same styles in the same words — and so the choice reaches the
          copied text, which is the only part an assistant ever sees. */}
      <BuildStyleSwitch style={style} onChange={setStyle} className="border-t border-rule pt-4" />
      <div className="relative">
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-[10px] border border-rule bg-sunken p-4 pr-12 text-[12px] leading-relaxed">{prompt}</pre>
        <CopyButton value={prompt} label="Copy prompt" className="absolute right-2 top-2 bg-sunken" />
      </div>
    </div>
  );
}
