import type { Metadata } from 'next';

export const metadata: Metadata = { robots: { index: false } };

/*
 * Transaction flows (hiring) get a layout of their own: no site navigation
 * to wander off into mid-payment, just the flow and a way out.
 */
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}
