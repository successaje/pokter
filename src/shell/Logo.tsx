import Link from 'next/link';

import { cn } from '@/lib/ui/cn';

/**
 * The Capital Gate: two opposing gates forming a P, with the yellow proof
 * tile crossing their threshold. Drawn as SVG so the gates take the ink of
 * whichever theme they sit on; the tile is always signal yellow.
 */
export function Mark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="150 52 682 712"
      className={cn('shrink-0', className)}
      aria-hidden
      focusable={false}
    >
      <path
        fill="currentColor"
        d="M192 62H513Q545 62 545 94V168Q545 200 513 200H344Q332 200 332 212V752H192Q160 752 160 720V94Q160 62 192 62Z"
      />
      <path
        fill="currentColor"
        d="M592 62H716Q820 62 820 166V546Q820 648 716 648H457Q425 648 425 616V562Q425 530 457 530H640Q652 530 652 518V258Q652 246 640 246H592Z"
      />
      <rect x="400" y="290" width="183" height="182" rx="36" fill="var(--signal)" />
    </svg>
  );
}

export function Wordmark({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('group inline-flex items-center gap-2.5 text-ink', className)} aria-label="Pokter home">
      <Mark size={22} className="transition-transform duration-300 ease-out group-hover:-rotate-3" />
      <span className="text-[17px] font-[640] tracking-[-0.03em]" style={{ fontVariationSettings: '"wdth" 92' }}>
        Pokter
      </span>
    </Link>
  );
}
