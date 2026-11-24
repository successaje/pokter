import { EDGE_CELL, EDGE_ROWS, pixelEdge } from '@/lib/ui/pixel-edge';

const SQUARES = pixelEdge();

/**
 * The footer's top edge, a dissolve of yellow squares into the paper above
 * it (`pixel-edge.ts` decides which). CSS only, and still under reduced
 * motion: the squares that would move just stay, or stay away.
 */
export function PixelEdge() {
  return (
    <div aria-hidden className="pointer-events-none relative overflow-hidden" style={{ height: EDGE_ROWS * EDGE_CELL }}>
      {SQUARES.map((square) => (
        <span
          key={`${square.col}:${square.row}`}
          className="edge-square absolute bg-[var(--signal)]"
          data-kind={square.kind}
          style={{
            left: square.col * EDGE_CELL,
            bottom: square.row * EDGE_CELL,
            width: EDGE_CELL,
            height: EDGE_CELL,
            ['--d' as string]: `${square.duration.toFixed(2)}s`,
            ['--o' as string]: `${square.offset.toFixed(2)}s`,
          }}
        />
      ))}
    </div>
  );
}
