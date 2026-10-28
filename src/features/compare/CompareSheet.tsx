'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';

import { buttonClass } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';

/**
 * The comparison over the page it was opened from: a drawer on the right,
 * held off the screen's edges with rounded corners, on wide displays; a tall
 * bottom sheet on phones. Closing
 * goes back, so the browser's Back closes it too. "Full page" is a plain
 * link, a full load, so /compare renders as its own page.
 */
export function CompareSheet({ fullPageHref, children }: { fullPageHref: string | null; children: ReactNode }) {
  const router = useRouter();
  /* Dismiss first, navigate after — same reason as `HireSheet`: `router.back()`
     alone leaves the sheet up until the route behind it is ready to render. */
  const [open, setOpen] = useState(true);
  const close = useCallback(() => {
    setOpen(false);
    router.back();
  }, [router]);
  return (
    <Sheet
      open={open}
      onClose={close}
      variant="drawer"
      floating
      title="Compare agents"
      description="Side by side on what has been measured. Best marks the leader on one measure, not an overall winner."
      className="sm:max-w-[min(960px,60vw)]"
      footer={
        <div className="flex items-center justify-between gap-3 pb-3">
          <button type="button" onClick={close} className="text-[13px] font-medium text-ink-2 hover:text-ink">
            Close
          </button>
          {fullPageHref && (
            <a href={fullPageHref} className={buttonClass('secondary', 's')}>
              Full page <Icon.ArrowUpRight size={14} />
            </a>
          )}
        </div>
      }
    >
      {/*
        The agents' row sticks to the top of the sheet's scrolling body. That
        body is padded 20px (`py-5` in `Sheet`), and a sticky element stops
        inside the padding, so rows scrolled through the gap above it.
      */}
      <div className="[--compare-top:-20px]">{children}</div>
    </Sheet>
  );
}
