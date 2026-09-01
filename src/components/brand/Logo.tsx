/**
 * The Pokter mark.
 *
 * A filled square inside an open one: the outer frame is the claim an agent
 * makes, the inner block is the part of it that has actually been verified.
 * The inner square is deliberately smaller than the frame — the product's
 * whole argument, rendered at twenty pixels.
 */
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <rect
        x="1.25"
        y="1.25"
        width="17.5"
        height="17.5"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.45"
      />
      <rect x="6" y="6" width="8" height="8" rx="1.75" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <Logo size={size} />
      <span className="text-sm font-semibold tracking-tight">Pokter</span>
    </span>
  );
}
