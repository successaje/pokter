import type { SVGProps } from 'react';

/*
 * Pokter's icon set: a 20px grid, 1.5px stroke, square-ish terminals, drawn
 * for this product rather than pulled from a library. Every icon is
 * decorative unless the caller gives it a label; buttons carry the text.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    ...rest,
  };
}

export const Icon = {
  Search: (p: IconProps) => (
    <svg {...base(p)}><circle cx="8.75" cy="8.75" r="5.25" /><path d="m12.75 12.75 4 4" /></svg>
  ),
  Arrow: (p: IconProps) => (
    <svg {...base(p)}><path d="M4 10h11.5M11 5.5 15.5 10 11 14.5" /></svg>
  ),
  ArrowUpRight: (p: IconProps) => (
    <svg {...base(p)}><path d="M6.5 13.5 13.5 6.5M7.5 6.5h6v6" /></svg>
  ),
  ChevronDown: (p: IconProps) => (
    <svg {...base(p)}><path d="m5.5 8 4.5 4.5L14.5 8" /></svg>
  ),
  ChevronRight: (p: IconProps) => (
    <svg {...base(p)}><path d="m8 5.5 4.5 4.5L8 14.5" /></svg>
  ),
  ChevronLeft: (p: IconProps) => (
    <svg {...base(p)}><path d="M12 5.5 7.5 10l4.5 4.5" /></svg>
  ),
  Close: (p: IconProps) => (
    <svg {...base(p)}><path d="m5.5 5.5 9 9M14.5 5.5l-9 9" /></svg>
  ),
  Menu: (p: IconProps) => (
    <svg {...base(p)}><path d="M3.5 6.5h13M3.5 13.5h13" /></svg>
  ),
  Check: (p: IconProps) => (
    <svg {...base(p)}><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>
  ),
  Dash: (p: IconProps) => (
    <svg {...base(p)}><path d="M5.5 10h9" /></svg>
  ),
  Cross: (p: IconProps) => (
    <svg {...base(p)}><path d="m6 6 8 8M14 6l-8 8" /></svg>
  ),
  Alert: (p: IconProps) => (
    <svg {...base(p)}><path d="M10 3.5 17 16H3L10 3.5Z" /><path d="M10 8.5v3.2M10 13.9v.1" /></svg>
  ),
  Info: (p: IconProps) => (
    <svg {...base(p)}><circle cx="10" cy="10" r="6.75" /><path d="M10 9v4.5M10 6.6v.1" /></svg>
  ),
  Clock: (p: IconProps) => (
    <svg {...base(p)}><circle cx="10" cy="10" r="6.75" /><path d="M10 6.25V10l2.5 1.75" /></svg>
  ),
  Shield: (p: IconProps) => (
    <svg {...base(p)}><path d="M10 2.75 16 5v4.6c0 3.6-2.6 6.4-6 7.65-3.4-1.25-6-4.05-6-7.65V5l6-2.25Z" /><path d="m7.5 10 1.75 1.75L12.75 8" /></svg>
  ),
  Lock: (p: IconProps) => (
    <svg {...base(p)}><rect x="4.5" y="8.75" width="11" height="8" rx="1.5" /><path d="M7 8.75V6.5a3 3 0 0 1 6 0v2.25" /></svg>
  ),
  Wallet: (p: IconProps) => (
    <svg {...base(p)}><path d="M3.5 6.25A1.75 1.75 0 0 1 5.25 4.5h9.25v2.75" /><rect x="3.5" y="6.5" width="13" height="9.25" rx="1.75" /><path d="M13 11.1h.1" strokeWidth="2.2" /></svg>
  ),
  Key: (p: IconProps) => (
    <svg {...base(p)}><circle cx="7" cy="12.75" r="3.25" /><path d="m9.4 10.4 6.35-6.35M13.5 6.3l1.75 1.75" /></svg>
  ),
  Bookmark: (p: IconProps) => (
    <svg {...base(p)}><path d="M5.5 3.5h9v13l-4.5-3.25-4.5 3.25v-13Z" /></svg>
  ),
  BookmarkFilled: (p: IconProps) => (
    <svg {...base(p)} fill="currentColor"><path d="M5.5 3.5h9v13l-4.5-3.25-4.5 3.25v-13Z" /></svg>
  ),
  Share: (p: IconProps) => (
    <svg {...base(p)}><path d="M10 12.5V3.5M6.5 7 10 3.5 13.5 7M4.5 11v4.25c0 .7.55 1.25 1.25 1.25h8.5c.7 0 1.25-.55 1.25-1.25V11" /></svg>
  ),
  Copy: (p: IconProps) => (
    <svg {...base(p)}><rect x="7" y="7" width="9.5" height="9.5" rx="1.5" /><path d="M13 7V4.75c0-.7-.55-1.25-1.25-1.25h-7c-.7 0-1.25.55-1.25 1.25v7c0 .7.55 1.25 1.25 1.25H7" /></svg>
  ),
  Sun: (p: IconProps) => (
    <svg {...base(p)}><circle cx="10" cy="10" r="3.25" /><path d="M10 2.5v1.75M10 15.75v1.75M2.5 10h1.75M15.75 10h1.75M4.7 4.7l1.25 1.25M14.05 14.05l1.25 1.25M4.7 15.3l1.25-1.25M14.05 5.95l1.25-1.25" /></svg>
  ),
  Moon: (p: IconProps) => (
    <svg {...base(p)}><path d="M15.75 12.4A6.5 6.5 0 0 1 7.6 4.25a6.5 6.5 0 1 0 8.15 8.15Z" /></svg>
  ),
  Monitor: (p: IconProps) => (
    <svg {...base(p)}><rect x="3" y="4" width="14" height="9.5" rx="1.5" /><path d="M7.5 16.5h5M10 13.5v3" /></svg>
  ),
  Home: (p: IconProps) => (
    <svg {...base(p)}><path d="M3.75 9 10 3.75 16.25 9v6.75c0 .4-.35.75-.75.75h-3.25v-4.5h-4.5v4.5H4.5a.75.75 0 0 1-.75-.75V9Z" /></svg>
  ),
  Compass: (p: IconProps) => (
    <svg {...base(p)}><circle cx="10" cy="10" r="6.75" /><path d="m12.75 7.25-1.5 4-4 1.5 1.5-4 4-1.5Z" /></svg>
  ),
  Pulse: (p: IconProps) => (
    <svg {...base(p)}><path d="M2.75 10h3l2-4.5 3.5 9 2-4.5h4" /></svg>
  ),
  User: (p: IconProps) => (
    <svg {...base(p)}><circle cx="10" cy="7" r="3.25" /><path d="M3.75 16.5c.9-2.6 3.3-4.25 6.25-4.25s5.35 1.65 6.25 4.25" /></svg>
  ),
  Inbox: (p: IconProps) => (
    <svg {...base(p)}><path d="M3.5 11.25 5.25 4.5h9.5l1.75 6.75v4.25c0 .4-.35.75-.75.75H4.25a.75.75 0 0 1-.75-.75v-4.25Z" /><path d="M3.5 11.25h3.75l1 1.75h3.5l1-1.75h3.75" /></svg>
  ),
  Briefcase: (p: IconProps) => (
    <svg {...base(p)}><rect x="3" y="6.25" width="14" height="10" rx="1.5" /><path d="M7.25 6.25v-1.5c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1v1.5M3 10.5h14" /></svg>
  ),
  Layers: (p: IconProps) => (
    <svg {...base(p)}><path d="m10 3.25 7 3.75-7 3.75L3 7l7-3.75Z" /><path d="m3 10.25 7 3.75 7-3.75M3 13.5l7 3.75 7-3.75" /></svg>
  ),
  Plus: (p: IconProps) => (
    <svg {...base(p)}><path d="M10 4.5v11M4.5 10h11" /></svg>
  ),
  Plug: (p: IconProps) => (
    <svg {...base(p)}><path d="M7.25 3.5v3.25M12.75 3.5v3.25M5.5 6.75h9v2.5a4.5 4.5 0 0 1-9 0v-2.5ZM10 13.75v2.75" /></svg>
  ),
  Spark: (p: IconProps) => (
    <svg {...base(p)}><path d="M10 3v3.5M10 13.5V17M3 10h3.5M13.5 10H17M5.4 5.4l2 2M12.6 12.6l2 2M5.4 14.6l2-2M12.6 7.4l2-2" /></svg>
  ),
  Flask: (p: IconProps) => (
    <svg {...base(p)}><path d="M8 3.5h4M8.75 3.5v4.25L4.6 14.9c-.5.85.1 1.85 1.05 1.85h8.7c.95 0 1.55-1 1.05-1.85l-4.15-7.15V3.5" /><path d="M6.5 11.5h7" /></svg>
  ),
  Rocket: (p: IconProps) => (
    <svg {...base(p)}><path d="M11.5 4.5c2-1.25 4-1.25 4-1.25s0 2-1.25 4l-4.5 4.5-2.5-2.5 4.25-4.75Z" /><path d="M7.25 9.25 5 9l-1.5 1.5 3 1M10.75 12.75 11 15l-1.5 1.5-1-3M5.75 14.25l-1.5 1.5" /></svg>
  ),
  Doc: (p: IconProps) => (
    <svg {...base(p)}><path d="M5.25 3.5h6.25l3.25 3.25v9c0 .4-.35.75-.75.75H5.25a.75.75 0 0 1-.75-.75v-11.5c0-.4.35-.75.75-.75Z" /><path d="M11.25 3.5v3.5h3.5M7.5 10.5h5M7.5 13.25h3.5" /></svg>
  ),
  Code: (p: IconProps) => (
    <svg {...base(p)}><path d="m7 6.5-3.5 3.5L7 13.5M13 6.5l3.5 3.5-3.5 3.5M11.25 4.5l-2.5 11" /></svg>
  ),
  Gear: (p: IconProps) => (
    <svg {...base(p)}><circle cx="10" cy="10" r="2.5" /><path d="M10 2.75v2M10 15.25v2M2.75 10h2M15.25 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4" /></svg>
  ),
  Logout: (p: IconProps) => (
    <svg {...base(p)}><path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M12.5 13.5 16 10l-3.5-3.5M16 10H8" /></svg>
  ),
  External: (p: IconProps) => (
    <svg {...base(p)}><path d="M11.5 3.75h4.75V8.5M16 4l-7 7M14 11.5v3.75c0 .55-.45 1-1 1H4.75c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1H8.5" /></svg>
  ),
  Refresh: (p: IconProps) => (
    <svg {...base(p)}><path d="M15.75 8.5A6 6 0 0 0 4.6 7M4.25 11.5A6 6 0 0 0 15.4 13" /><path d="M4.25 3.75V7h3.25M15.75 16.25V13H12.5" /></svg>
  ),
  Filter: (p: IconProps) => (
    <svg {...base(p)}><path d="M3.5 5.5h13M6 10h8M8.5 14.5h3" /></svg>
  ),
  Grid: (p: IconProps) => (
    <svg {...base(p)}><rect x="3.5" y="3.5" width="5.25" height="5.25" rx="1" /><rect x="11.25" y="3.5" width="5.25" height="5.25" rx="1" /><rect x="3.5" y="11.25" width="5.25" height="5.25" rx="1" /><rect x="11.25" y="11.25" width="5.25" height="5.25" rx="1" /></svg>
  ),
  List: (p: IconProps) => (
    <svg {...base(p)}><path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9M3.75 5.5h.1M3.75 10h.1M3.75 14.5h.1" /></svg>
  ),
  Columns: (p: IconProps) => (
    <svg {...base(p)}><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M10 4v12" /></svg>
  ),
  Bell: (p: IconProps) => (
    <svg {...base(p)}><path d="M5.25 13.75V9a4.75 4.75 0 0 1 9.5 0v4.75l1.25 1.5H4l1.25-1.5ZM8.25 17h3.5" /></svg>
  ),
  Download: (p: IconProps) => (
    <svg {...base(p)}><path d="M10 3.5v9M6.5 9 10 12.5 13.5 9M4.5 15.5h11" /></svg>
  ),
  Send: (p: IconProps) => (
    <svg {...base(p)}><path d="M16.5 3.5 9 11M16.5 3.5 11.75 16.5 9 11 3.5 8.25l13-4.75Z" /></svg>
  ),
  Play: (p: IconProps) => (
    <svg {...base(p)}><path d="M6.5 4.5v11l9-5.5-9-5.5Z" /></svg>
  ),
  Eye: (p: IconProps) => (
    <svg {...base(p)}><path d="M2.75 10S5.5 4.75 10 4.75 17.25 10 17.25 10 14.5 15.25 10 15.25 2.75 10 2.75 10Z" /><circle cx="10" cy="10" r="2.25" /></svg>
  ),
};

export type IconName = keyof typeof Icon;
