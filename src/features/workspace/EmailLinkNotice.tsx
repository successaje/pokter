'use client';

import { useSearchParams } from 'next/navigation';

import { Notice } from '@/ui/Feedback';

const COPY = {
  jobs: {
    verified: { title: 'Email confirmed', body: 'You will get an email when a job you follow changes state.' },
    unsubscribed: { title: 'Unsubscribed', body: 'No more job emails will be sent to that address.' },
    invalid: 'Subscribe again from a job page if you still want emails.',
  },
  agents: {
    verified: { title: 'Alerts confirmed', body: 'You will get an email when an agent you follow stops or resumes answering, changes its price, or delivers or misses a paid job.' },
    unsubscribed: { title: 'Alerts stopped', body: 'No more emails will be sent about that agent.' },
    invalid: 'Follow the agent again from its page if you still want alerts.',
  },
  builder: {
    verified: { title: 'Builder alerts confirmed', body: 'You will get an email when your agents receive funded work, approach a deadline, or move through delivery review.' },
    unsubscribed: { title: 'Builder alerts stopped', body: 'No more builder emails will be sent to that address.' },
    invalid: 'Set up builder alerts again from Studio if you still want them.',
  },
} as const;

/**
 * What happened after a confirmation or unsubscribe link from an email,
 * read from the `email` query parameter the link redirects with.
 */
export function EmailLinkNotice({ kind, className = 'mb-6' }: { kind: keyof typeof COPY; className?: string }) {
  const status = useSearchParams().get('email');
  const copy = COPY[kind];
  if (status === 'verified') return <Notice tone="ok" className={className} title={copy.verified.title}>{copy.verified.body}</Notice>;
  if (status === 'unsubscribed') return <Notice tone="neutral" className={className} title={copy.unsubscribed.title}>{copy.unsubscribed.body}</Notice>;
  if (status === 'invalid') return <Notice tone="watch" className={className} title="That link has expired">{copy.invalid}</Notice>;
  return null;
}
