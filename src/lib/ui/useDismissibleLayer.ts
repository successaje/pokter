'use client';

import { useEffect, useRef } from 'react';

/**
 * Shared interaction contract for menus and non-modal popovers.
 *
 * Pointer events inside the layer are left alone. An outside pointer press or
 * Escape dismisses it, and Escape returns keyboard focus to the trigger.
 */
export function useDismissibleLayer<T extends HTMLElement>({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  const layerRef = useRef<T>(null);

  useEffect(() => {
    if (!open) return;

    const dismissOutside = (event: PointerEvent) => {
      if (!layerRef.current?.contains(event.target as Node)) onDismiss();
    };

    const dismissWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onDismiss();
      const trigger = layerRef.current?.querySelector<HTMLElement>(
        '[aria-expanded="true"]',
      );
      trigger?.focus();
    };

    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissWithKeyboard);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('keydown', dismissWithKeyboard);
    };
  }, [open, onDismiss]);

  return layerRef;
}
