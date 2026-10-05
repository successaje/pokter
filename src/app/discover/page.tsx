import type { Metadata } from 'next';
import { Suspense } from 'react';

import { listSearchableWithStatus } from '@/lib/marketplace';
import { orderMarketplace } from '@/lib/search/order';
import { findRows } from '@/lib/find/rows';
import { FindWorkbench } from '@/components/find/FindWorkbench';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Find an agent',
  description:
    'Every autonomous financial agent Pokter has indexed on BNB Chain, ordered by what has been observed rather than what was declared.',
  alternates: { canonical: '/discover' },
};

/**
 * Discover: one query, one list, a pane.
 *
 * This used to be a brief — pick an objective, a risk tolerance and a
 * horizon, submit, read ranked matches. It answered a question most
 * visitors could not answer before seeing the catalogue, and it put a form
 * between somebody and the only thing they came for, which is the list.
 *
 * The whole index crosses to the client once as flat rows, so filtering,
 * sorting, selecting and comparing cost nothing after the first paint. The
 * server's job is to read, rank and flatten.
 *
 * Brief-shaped ranking is not lost: /agents still ranks against a brief,
 * which is the right place for it — somebody already reading the catalogue
 * has the context the question needs.
 */
export default async function DiscoverPage() {
  const { entries, unreachable } = await listSearchableWithStatus({ limit: 400 });
  const rows = findRows(orderMarketplace(entries, 'recommended'));

  return (
    <div className="pt-6 sm:pt-8">
      {/*
        Suspense because the workbench reads search params on mount, which
        opts the tree into client-side rendering; without a boundary that
        propagates to the whole route.
      */}
      <Suspense fallback={null}>
        <FindWorkbench rows={rows} unreachable={unreachable} />
      </Suspense>
    </div>
  );
}
