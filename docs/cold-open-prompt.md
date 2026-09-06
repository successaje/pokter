# Cold open — prompts for an AI video generator

Twenty seconds, three shots, no dialogue. Paste each shot separately: most
generators cap a clip at 5–10 seconds, so this is built to be stitched.

## Read this before generating

**Do not ask the AI for text or numbers.** Every current model renders legible
text unreliably — you will get `3O6,OOO` or worse, and a garbled figure in the
opening frames undermines a product whose whole argument is that its numbers are
trustworthy. Generate the visuals clean and **add the counter and labels as
overlays in your editor**, where they will be sharp and correct.

**Match the app's palette** so the cut into the live site is seamless rather than
jarring:

| Role | Hex |
| --- | --- |
| Background | `#08090b` — near-black, very slightly blue |
| Card surface | `#0f1114` rising to `#16191e` |
| Live / verified | `#3fb97f` — muted green, never neon |
| Dead / failing | `#e05a52` — muted red |
| Text | `#edf0f4` |

**Keep it restrained.** This is a financial product. No lens flares, no particle
storms, no purple gradients, no glowing orbs, no crypto iconography. The mood is
a trading floor at night, not a sci-fi title sequence.

---

## Shot 1 · 0:00 – 0:07 · The scale

> Extreme wide shot, slow push-in. An endless dark plane extending to the
> horizon, covered in tens of thousands of small rectangular cards arranged in a
> vast irregular grid, like a city seen from far above at night. Each card is a
> dim charcoal panel with a faint pale glow along one edge. The surface is
> near-black, very slightly blue. Cards recede into darkness in every direction,
> far too many to count. Cool, even, low-key lighting. Slow, patient camera
> motion. Photoreal, high detail, shallow atmospheric haze in the distance.
> Muted, desaturated, editorial. No text, no logos, no people.

**Overlay in your editor:** a counter running up to **306,000**, small, in the
lower third, in your UI font.

---

## Shot 2 · 0:07 – 0:14 · The collapse

> Same endless field of small glowing cards, camera now drifting slowly
> sideways. In sweeping waves, the vast majority of the cards go dark — their
> light draining away and the panels dimming to flat unlit slabs, wave after
> wave rolling across the field toward the camera. A faint dust of red pinpricks
> flickers briefly where cards die. The field empties fast. Only scattered
> survivors remain lit, glowing a soft muted green. Cinematic, restrained,
> desaturated. Near-black background. No text, no explosions, no debris,
> no particles.

**Overlay in your editor:** four labels fading in and out with the waves —
`no endpoint`, `never answered`, `no evidence`, `bulk-minted clone`.

This is the shot that carries the film. If only one generation comes out well,
make it this one.

---

## Shot 3 · 0:14 – 0:20 · What survives

> Slow push-in on the last few remaining cards, isolated in a vast dark empty
> plane where thousands used to be. Perhaps a dozen panels, standing apart,
> each lit with a steady soft green edge glow — calm and stable rather than
> pulsing. Everything around them is unlit, dead, extending into darkness. The
> camera settles and holds. Quiet, still, confident. Photoreal, muted palette,
> near-black background, shallow depth of field. No text, no logos.

**Overlay in your editor:** **38 measured**, small, beneath the survivors.

**Then cut hard to the live site.** No fade, no logo card. The jump from the
last frame of this shot straight into the real product is the whole trick — a
title slide between them throws the effect away.

---

## Negative prompt

Paste into the negative field if your tool has one:

```
text, letters, numbers, words, watermark, logo, ui mockup, people, faces, hands,
neon, purple, magenta, cyan, glowing orbs, lens flare, light rays, particles,
sparks, smoke, explosion, debris, crypto coins, bitcoin, blockchain imagery,
holograms, sci-fi hud, fast cuts, camera shake, saturated colours, cartoon,
3d render look, video game
```

## Settings

- **Aspect** 16:9, **1080p or better**
- **Motion** low. Slow camera moves read as expensive; fast ones read as stock
  footage.
- **Generate 3–4 takes per shot.** These are cheap and the variance is high.

---

## The voiceover

Twenty seconds is roughly 45 spoken words. Do not fill it — the pauses are doing
work.

> *(shot 1)* "BNB Chain has three hundred and six thousand registered agents."
>
> *(shot 2, as the field empties)* "Almost none of them can be checked."
>
> *(shot 3, on the survivors)* "Pokter measures the ones that can."

Then silence into the cut. Let the site's first frame land without narration —
the sudden appearance of a real interface after an abstract sequence is the
moment that earns attention, and talking over it wastes it.

## Why this should hold a judge

It does not explain the product, and that is deliberate. It poses the problem
and shows a small number of survivors without saying how they were chosen — so
the obvious next question is *how do you know which ones?*, which is precisely
what the following 150 seconds answers.

An opening that explains everything leaves nothing to watch for.
