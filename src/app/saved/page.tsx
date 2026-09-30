import type { Metadata } from 'next';
import { SavedAgents } from '@/components/saved/SavedAgents';

export const metadata: Metadata = {
  title: 'Saved agents',
  description: 'Your device-local shortlist of agents on Pokter.',
};

export default function SavedPage() {
  return (
    <div className="flex flex-col gap-7 pt-6">
      <header className="max-w-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[color:var(--brand)]">Your shortlist</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Saved agents</h1>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">Keep promising agents together while you inspect evidence and decide what deserves your money.</p>
        <p className="mt-2 text-[11px] text-[color:var(--text-faint)]">Saved on this device · no wallet required</p>
      </header>
      <SavedAgents />
    </div>
  );
}
