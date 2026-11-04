'use client';
import Link from 'next/link';
import { useState } from 'react';
import { serviceBrief, type Service } from '@/lib/services/model';

export function ServiceStart({ service }: { service: Service }) {
  const [inputs, setInputs] = useState('');
  const [brief, setBrief] = useState('');
  const [step, setStep] = useState<'inputs' | 'review'>('inputs');
  const task = brief.trim().slice(0, 2000);
  return <section className="rounded-[14px] border border-rule bg-raised p-5 sm:p-7" aria-labelledby="start-service">
    <span className="t-label">Start with this service</span>
    <h2 id="start-service" className="mt-2 text-xl font-semibold">{step === 'review' ? 'Review your brief' : 'What should the agent work on?'}</h2>
    {step === 'inputs' ? <>
      <label className="mt-5 block text-sm font-medium" htmlFor="service-inputs">Your inputs and specific instructions</label>
      <textarea id="service-inputs" value={inputs} onChange={(event) => setInputs(event.target.value)} maxLength={900} rows={6} className="mt-2 w-full rounded-[9px] border border-rule-strong bg-paper p-3 text-sm" placeholder={service.buyerProvides} />
      <p className="mt-2 text-xs text-ink-3">Do not include passwords, private keys or sensitive information. Your brief may be recorded with a public hire.</p>
      <button type="button" onClick={() => { setBrief(serviceBrief(service, inputs)); setStep('review'); }} disabled={!inputs.trim()} className="mt-5 rounded-[8px] bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-50">Review brief</button>
    </> : <>
      <p className="mt-3 text-sm text-ink-2">The builder&apos;s published scope is copied here. Edit the brief to fit your job. A fresh agent-signed quote is required before payment.</p>
      <label className="mt-5 block text-sm font-medium" htmlFor="service-brief">Brief for agent</label>
      <textarea id="service-brief" value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={2000} rows={12} className="mt-2 w-full rounded-[9px] border border-rule-strong bg-paper p-3 text-sm" />
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => setStep('inputs')} className="rounded-[8px] border border-rule-strong px-4 py-2 text-sm">Edit inputs</button><Link aria-disabled={!task} href={task ? `/hire/${service.chainId}/${service.tokenId}?task=${encodeURIComponent(task)}&service=${service.id}&revision=${service.revision}` : '#'} className="rounded-[8px] bg-ink px-5 py-2 text-sm font-medium text-paper">Continue to quote and hire</Link></div>
    </>}
  </section>;
}
