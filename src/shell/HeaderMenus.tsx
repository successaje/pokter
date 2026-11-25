'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { cn } from '@/lib/ui/cn';
import { Icon } from '@/ui/icons';
import { activeGroup, isActive, NAV_DIRECT, NAV_GROUPS, type NavGroup } from './nav';

/**
 * The header's desktop navigation: Hire and Build open a panel of links,
 * each with a line on what it leads to; Proof is a plain link.
 *
 * A panel opens on hover with a mouse, and on a press from the keyboard or a
 * touch, which toggles it; hover is never used for touch, where it and the
 * tap would open and close it in one go. It closes on Escape,
 * a click anywhere else, leaving it with the mouse, or going to a page. The
 * open state is kept with the page it was opened on, so a navigation closes
 * it without an effect. Each panel follows its own button in the DOM, so Tab
 * goes from a button into its links, and is positioned against that button
 * rather than the nav, so a panel drops from the left edge of the label it
 * belongs to — pulled left only by however much it would otherwise hang off
 * the window. See `Panel` for why neither edge alone can do it.
 */
export function HeaderMenus() {
  const pathname = usePathname() ?? '/';
  const reduce = useReducedMotion();
  const navRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* `fresh` is whether the panel opened from closed: moving from one menu to the other swaps it without the entrance. */
  const [state, setState] = useState<{ menu: string; path: string; fresh: boolean } | null>(null);
  const open = state?.path === pathname ? state.menu : null;
  const current = activeGroup(pathname);

  const show = (menu: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setState((prev) => (prev?.menu === menu && prev.path === pathname ? prev : { menu, path: pathname, fresh: !prev || prev.path !== pathname }));
  };
  const close = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setState(null);
  };
  const closeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setState(null), 140);
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      close();
      navRef.current?.querySelector<HTMLButtonElement>(`[aria-controls="menu-${open.toLowerCase()}"]`)?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const mouse = (event: React.PointerEvent) => event.pointerType === 'mouse';
  /*
   * How the last press on a menu button was made. A mouse has already opened
   * the panel by hovering, so its click only keeps it open: toggling would shut
   * what the hover just opened. Keyboard and touch toggle.
   */
  const pressedWithMouse = useRef(false);

  return (
    <nav
      ref={navRef}
      aria-label="Primary"
      className="relative mx-auto hidden items-center gap-1 lg:flex"
      onPointerLeave={(event) => mouse(event) && closeSoon()}
    >
      {NAV_GROUPS.map((group) => {
        const id = `menu-${group.label.toLowerCase()}`;
        const isOpen = open === group.label;
        return (
          <div key={group.label} className="relative" onPointerEnter={(event) => mouse(event) && show(group.label)}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={id}
              onPointerDown={(event) => {
                pressedWithMouse.current = mouse(event);
              }}
              onClick={(event) => {
                /* detail is 0 for Enter and Space: a keyboard press, whatever the last pointer was. */
                const byMouse = pressedWithMouse.current && event.detail > 0;
                pressedWithMouse.current = false;
                if (isOpen && !byMouse) close();
                else show(group.label);
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded-[8px] px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                isOpen || current === group.label ? 'text-ink' : 'text-ink-3 hover:text-ink',
              )}
            >
              {group.label}
              <Icon.ChevronDown size={13} className={cn('transition-transform duration-200', isOpen && 'rotate-180')} aria-hidden />
            </button>
            {isOpen && <Panel id={id} group={group} pathname={pathname} animate={state!.fresh && !reduce} onNavigate={close} />}
          </div>
        );
      })}
      {NAV_DIRECT.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? 'page' : undefined}
          onPointerEnter={(event) => mouse(event) && closeSoon()}
          className={cn(
            'rounded-[8px] px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
            isActive(pathname, item.href) ? 'text-ink' : 'text-ink-3 hover:text-ink',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Clear of the window's edge, so a panel never sits flush against it. */
const GUTTER = 16;

/**
 * A panel hangs from its label's left edge, and slides left only as far as
 * it must to stay on screen.
 *
 * Choosing an edge cannot work on its own. A 640px panel left-aligned under
 * Hire runs off the right of a 1024px window; right-aligned under the same
 * label it runs off the left, because the label sits barely 400px in. So the
 * offset is measured rather than chosen: start at the label, pull back by
 * the overhang, and stop at the left gutter. Measured in a layout effect, so
 * it is placed before the browser paints it.
 */
function Panel({ id, group, pathname, animate, onNavigate }: { id: string; group: NavGroup; pathname: string; animate: boolean; onNavigate: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(0);

  useLayoutEffect(() => {
    const place = () => {
      const panel = ref.current;
      const label = panel?.parentElement;
      if (!panel || !label) return;
      const from = label.getBoundingClientRect().left;
      const overhang = from + panel.offsetWidth + GUTTER - window.innerWidth;
      /* Never past the left gutter: on a narrow window the panel is as wide as the room there is. */
      setLeft(Math.max(GUTTER - from, overhang > 0 ? -overhang : 0));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);

  return (
    <motion.div
      ref={ref}
      style={{ left }}
      id={id}
      initial={animate ? { opacity: 0, y: -4 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'absolute top-[calc(100%+10px)] z-50',
        group.feature ? 'w-[min(40rem,calc(100vw-2rem))]' : 'w-[min(22rem,calc(100vw-2rem))]',
      )}
    >
      <div className={cn('grid gap-2 rounded-[14px] border border-rule bg-raised p-2 shadow-xl', group.feature && 'sm:grid-cols-[1.45fr_1fr]')}>
        <ul className="flex flex-col">
          {group.links.map((link) => {
            const here = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={onNavigate}
                  aria-current={here ? 'page' : undefined}
                  className="block rounded-[10px] px-3 py-2.5 transition-colors hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
                >
                  <span className="block text-sm font-medium text-ink">{link.label}</span>
                  <span className="mt-0.5 block text-pretty text-[12.5px] leading-snug text-ink-3">{link.description}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {group.feature && (
          <Link
            href={group.feature.href}
            onClick={onNavigate}
            className="group relative flex min-h-[11rem] flex-col justify-end overflow-hidden rounded-[10px] border border-rule bg-sunken p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {/* The proof tile from the mark, on the paper grid the home page is drawn on. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(var(--rule)_1px,transparent_1px),linear-gradient(90deg,var(--rule)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
            />
            <span aria-hidden className="absolute left-[45px] top-[23px] size-[21px] rounded-[4px] bg-signal transition-transform duration-300 ease-out group-hover:-translate-y-0.5" />
            <span className="t-label relative">{group.feature.eyebrow}</span>
            <span className="relative mt-1.5 text-[15px] font-semibold tracking-[-0.01em] text-ink">{group.feature.title}</span>
            <span className="relative mt-1 text-pretty text-[12.5px] leading-snug text-ink-3">{group.feature.body}</span>
            <Icon.Arrow size={15} className="relative mt-3 text-ink transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
          </Link>
        )}
      </div>
    </motion.div>
  );
}
