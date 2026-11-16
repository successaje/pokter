import Image from 'next/image';
import Link from 'next/link';

/**
 * Pokter's own agents, waiting on the line under the headline.
 *
 * The page needed a character and Pokter has none: there is no mascot, and
 * inventing one is an illustration job and a brand decision rather than
 * something to improvise in a component. What it does have is five house
 * agents that already share a drawn family — the same proof tile, the same
 * gates in the corner, a different glyph each for what the agent watches —
 * and every one of them is already the brand yellow. So they are the
 * characters, and the colour needs no introducing.
 *
 * They stand behind a rule rather than sitting in a row, cropped by it,
 * which is the idea: they are under the sentence that is about them, looking
 * up at it. Hovering one lifts it clear and names it; clicking opens it,
 * because unlike a mascot each of these is a real agent somebody can hire.
 *
 * No JavaScript. The arrival is `anim-rise` with a delay each, the lift is a
 * hover transition, and the label is an opacity change — so this renders and
 * behaves before any bundle loads, and the stylesheet's reduced-motion rule
 * already flattens the arrival to nothing without this file knowing about it.
 */

interface HouseAgent {
  slug: string;
  name: string;
  /** What it watches, for the label on hover. */
  does: string;
  /** Its registration per chain, so the link follows the network the site runs on. */
  on: Record<56 | 97, string>;
}

const HOUSE: HouseAgent[] = [
  { slug: 'touchstone', name: 'Touchstone', does: 'Token safety', on: { 56: '374115', 97: '2622' } },
  { slug: 'gridloom', name: 'Gridloom', does: 'Grid trading', on: { 56: '374114', 97: '2621' } },
  { slug: 'brinkwatch', name: 'Brinkwatch', does: 'Health factor', on: { 56: '374107', 97: '2618' } },
  { slug: 'centreline', name: 'Centreline', does: 'Rebalancing', on: { 56: '374113', 97: '2620' } },
  { slug: 'cresthold', name: 'Cresthold', does: 'Yield', on: { 56: '374112', 97: '2619' } },
];

export function HeroAgents({ chainId }: { chainId: 56 | 97 }) {
  return (
    <div className="relative mt-12 sm:mt-16">
      <ul className="frame relative z-10 flex items-end justify-center gap-3 sm:gap-6">
        {HOUSE.map((agent, i) => (
          <li key={agent.slug} className="anim-rise" style={{ animationDelay: `${240 + i * 80}ms` }}>
            <Link
              href={`/agents/${chainId}/${agent.on[chainId]}`}
              className="group relative flex flex-col items-center rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
            >
              {/*
                The name only on hover or focus: five labels at rest would
                compete with the headline they are standing under.
              */}
              <span className="pointer-events-none absolute -top-9 whitespace-nowrap rounded-full border border-rule bg-paper px-2.5 py-1 text-[11.5px] opacity-0 shadow-lift transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <span className="font-medium text-ink">{agent.name}</span>{' '}
                <span className="text-ink-3">{agent.does}</span>
              </span>
              {/*
                Cropped by the rule below: the tile is taller than the box it
                sits in, so only its top shows and the line reads as something
                they are standing behind.
              */}
              <span className="block h-[46px] w-[58px] overflow-hidden sm:h-[58px] sm:w-[74px]">
                <Image
                  src={`/agents/${agent.slug}.svg`}
                  alt=""
                  width={74}
                  height={74}
                  className="size-[58px] rounded-[14px] transition-transform duration-300 ease-out group-hover:-translate-y-1.5 group-focus-visible:-translate-y-1.5 sm:size-[74px] sm:rounded-[18px]"
                  priority={i < 3}
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {/*
        The line they stand behind, full bleed, in the brand's own yellow: the
        page's one unbroken piece of colour above the fold, and the edge the
        hero ends on.
      */}
      <div aria-hidden className="relative -mt-px h-[3px] w-full bg-signal" />
    </div>
  );
}
