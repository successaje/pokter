# Pokter brand system

## Idea

The **Capital Gate** is made from two opposing gates that form a `P`. The
yellow proof tile crossing their threshold represents an agent, a piece of
evidence, or capital that has been checked before it moves.

The geometry is Pokter's. The yellow-and-graphite palette makes the product at
home in the BNB Chain ecosystem without copying the BNB Chain symbol.

## Logo use

- Use `pokter-mark-selected-dark.png` on dark or photographic backgrounds.
- Use `pokter-mark-selected-light.png` on white or pale backgrounds.
- Keep clear space around the mark equal to the width of its yellow tile.
- Do not recolor the proof tile with status green, amber, red or blue.
- Do not rotate, outline, add shadows, or place the mark inside another shape.
- Below 20 px, use the mark without the wordmark.

## Palette

| Role | Value | Use |
| --- | --- | --- |
| Signal yellow | `#F0B90B` | Brand tile, primary action, small ecosystem details |
| Dark ground | `#08090B` | Dark theme and social avatar |
| Dark ink | `#0C0E12` | Mark and type on light surfaces |
| Light ground | `#FBFBFC` | Light theme and light avatar |
| Light ink | `#F4F6F8` | Mark and type on dark surfaces |

Yellow is a brand signal, not a status. Pokter's existing green, amber, red and
blue tokens retain their semantic meanings.

## BNB Chain relationship

Until an official adoption or partnership is announced, use factual wording:

- “The agent marketplace for BNB Chain”
- “Built for the BNB Chain Smart Money Era hackathon”
- “Built on BNB Chain”

Do not use “official,” “BNB Agent Studio marketplace,” “endorsed by BNB Chain,”
or the BNB Chain logo without written authorization. If adoption is confirmed,
update the relationship line separately; the Pokter identity does not need to
change.

## Export inventory

- `public/brand/pokter-mark-selected-dark.png`
- `public/brand/pokter-mark-selected-light.png`
- `public/brand/pokter-social-profile-dark.png`
- `public/brand/pokter-social-profile-light.png`
- `public/brand/pokter-social-banner-dark.png`
- `public/brand/pokter-social-banner-light.png`
- `public/brand/pokter-app-icon-192.png`
- `public/brand/pokter-app-icon-512.png`
- `src/app/favicon.ico`
- `src/app/apple-icon.png`
- `src/app/opengraph-image.png`
- `src/app/twitter-image.png`

## Social banner

1500×500, light and dark, regenerated with:

```bash
node scripts/brand-banner.mjs
```

It carries the headline, the positioning line beneath it, and a field of agent
cards — most dim, a few alive in green. The field is the argument rather than
decoration: many agents exist, few can be verified, and that reads before
anybody parses a word.

Three constraints the layout exists to satisfy:

- **Everything lives in the middle band.** X trims top and bottom on mobile and
  the avatar covers the lower left on desktop, so anything at an edge is a
  casualty.
- **No wordmark.** The avatar already carries it, and repeating it is the most
  common way a banner ends up saying nothing twice.
- **The centre stays clear of cards.** They frame the type; they do not crowd
  it.

The light variant uses `--light-border-strong` for the dim cards rather than
`--light-border`. On a near-white background the softer token vanishes, and a
field of invisible cards tells no story.
