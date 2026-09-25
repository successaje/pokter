import Image from 'next/image';

/** The selected Capital Gate artwork, preserved without geometric redrawing. */
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      aria-hidden
      className="relative block shrink-0"
    >
      <Image
        src="/brand/pokter-mark-selected-dark.png"
        alt=""
        fill
        sizes={`${size}px`}
        className="pokter-mark-on-dark object-contain"
      />
      <Image
        src="/brand/pokter-mark-selected-light.png"
        alt=""
        fill
        sizes={`${size}px`}
        className="pokter-mark-on-light object-contain"
      />
    </span>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={size} />
      <span className="text-sm font-semibold tracking-[-0.025em]">Pokter</span>
    </span>
  );
}
