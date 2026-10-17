'use client';

import { useRouter } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';

import { buttonClass } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';

/**
 * The comparison over the page it was opened from: a floating, rounded panel
 * centred on wide displays, a tall bottom sheet on phones. Closing
 * goes back, so the browser's Back closes it too. "Full page" is a plain
 * link, a full load, so /compare renders as its own page.
 */
export function CompareSheet({ fullPageHref, children }: { fullPageHref: string; children: ReactNode }) {
  const router = useRouter();
  const close = useCallback(() => router.back(), [router]);
  return (
    <Sheet
      open
      onClose={close}
      title="Compare agents"
      description="Side by side on what has been measured. Best marks the leader on one measure, not an overall winner."
      className="sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[min(1000px,calc(100vw-48px))] sm:rounded-[20px] sm:border-rule-strong"
      footer={
        <div className="flex items-center justify-between gap-3 pb-3">
          <button type="button" onClick={close} className="text-[13px] font-medium text-ink-2 hover:text-ink">
            Close
          </button>
          <a href={fullPageHref} className={buttonClass('secondary', 's')}>
            Full page <Icon.ArrowUpRight size={14} />
          </a>
        </div>
      }
    >
      {children}
    </Sheet>
  );
}
