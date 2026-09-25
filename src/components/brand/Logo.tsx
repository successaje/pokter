/**
 * Pokter's Capital Gate.
 *
 * Two opposing gates form a P; the signal tile crossing their threshold is
 * the agent, proof or capital that Pokter has checked before it moves.
 */
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path d="M3 3.5h15.25v6.75H10.5V29H3V3.5Z" fill="currentColor" />
      <path
        d="M19.25 3.5H24a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5h-9.25V15h6.75v-4.75h-2.25V3.5Z"
        fill="currentColor"
      />
      <rect x="11.75" y="12.25" width="6.75" height="6.75" rx="1.35" fill="var(--brand)" />
    </svg>
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
