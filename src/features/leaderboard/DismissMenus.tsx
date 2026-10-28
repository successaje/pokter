'use client';

import { useEffect } from 'react';

/**
 * Closes the board's dropdowns the way a menu is expected to close.
 *
 * They are `<details>` holding links, so they work with nothing running and
 * every choice stays a URL; but a `<details>` stays open until its own
 * summary is pressed again. This closes any open one (`details[data-menu]`)
 * on a press anywhere outside it, on Escape, and once an option is chosen.
 */
export function DismissMenus() {
  useEffect(() => {
    const close = (keep: Element | null = null) => {
      document.querySelectorAll<HTMLDetailsElement>('details[data-menu][open]').forEach((menu) => {
        if (menu !== keep) menu.open = false;
      });
    };
    const onPointerDown = (event: PointerEvent) => close((event.target as Element | null)?.closest('details[data-menu]') ?? null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest('details[data-menu] a')) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onClick);
    };
  }, []);
  return null;
}
