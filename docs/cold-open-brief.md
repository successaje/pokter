# Cold open — one brief for an AI animator

> **Not used.** The final cut opens on the landing page instead — its hero
> already animates and its counters carry the same two numbers. Kept because
> the concept is sound and may be worth revisiting for a launch film; it is not
> part of the hackathon submission.

Twenty seconds, no dialogue in the animation itself (voiceover is laid over it).
Hand this whole page over. Shot-by-shot prompts for clip-based generators are in
[cold-open-prompt.md](cold-open-prompt.md) — use those if your tool only takes
short prompts and caps clips at 5–10 seconds.

Figures are current as of 7 September 2026. Re-check with `npm run figures`
before the numbers are burned in; they move every two hours.

---

## The brief

**Concept.** A vast dark field of tiny glowing cards, each one an autonomous
agent. Almost all of them go dark. A handful remain. That is the entire film,
and the narrowing is the argument: the problem is not finding agents, it is that
almost none can be checked.

**Tone.** A trading floor at night. Restrained, editorial, expensive. This is a
financial product, not science fiction.

**Duration.** 20 seconds, continuous. No title card at either end.

---

### 0:00 – 0:07 — the scale

Open on an extreme wide shot, camera pushing in very slowly. An endless dark
plane stretching to the horizon, covered in tens of thousands of small
rectangular cards in a vast irregular grid — like a city seen from far above at
night. Each card is a dim charcoal panel with a faint pale glow along one edge.
They recede into darkness in every direction, far too many to count. Cool, even,
low-key light. Slight atmospheric haze in the distance.

*Overlay (added in editing, not generated):* a counter ticking up to **307,000**,
small, lower third.

### 0:07 – 0:14 — the collapse

The camera drifts sideways. In sweeping waves rolling toward the viewer, the
overwhelming majority of the cards go dark — their light draining away, panels
dimming to flat unlit slabs. A faint dust of muted red pinpricks flickers where
cards die, then fades. The field empties fast and the darkness spreads. Only
scattered survivors stay lit, glowing a soft muted green.

*Overlay:* four labels fading in and out with the waves — `no endpoint`,
`never answered`, `no evidence`, `bulk-minted clone`.

**This is the shot that carries the film.** If the budget or the retries only
stretch to one good generation, spend them here.

### 0:14 – 0:20 — what survives

Push in slowly on the last remaining cards, isolated in a vast dark plane where
thousands used to be. Perhaps a dozen panels, standing apart, each lit with a
steady soft green edge — calm and stable, not pulsing or flashing. Everything
around them is unlit and dead, extending into darkness. The camera settles and
holds on them for the final beat.

*Overlay:* **39 measured**, small, beneath the survivors.

**Ending.** Hold on the survivors and cut. No fade, no logo, no title. The next
frame is the live product, and that hard cut is the whole trick.

---

## Non-negotiables

**No generated text.** Every current model garbles letters and numbers. A
mangled `3O7,OOO` in the opening seconds would undermine a product whose entire
argument is that its figures can be trusted. Generate the visuals clean; add the
counter and the four labels as overlays in editing.

**Palette**, matched to the app so the cut into the live site is seamless:

| Role | Hex |
| --- | --- |
| Background | `#08090b` — near-black, faintly blue |
| Card surface | `#0f1114` rising to `#16191e` |
| Alive / verified | `#3fb97f` — muted green, never neon |
| Dead / failing | `#e05a52` — muted red |
| Overlay text | `#edf0f4` |

**Motion stays slow.** Slow camera moves read as expensive; fast ones read as
stock footage. No shake, no whip pans, no snap zooms.

**Never include:** neon, purple or magenta, glowing orbs, lens flares, light
rays, particle storms, sparks, smoke, explosions, debris, crypto coins or
blockchain iconography, holograms, sci-fi HUD elements, people, faces, hands,
logos, fast cuts, cartoon or video-game rendering.

**Format:** 16:9, 1080p or better, 24 or 30fps.

---

## Voiceover, laid over the finished animation

Roughly 45 words across 20 seconds. Do not fill the gaps — the pauses are doing
the work.

> *(over the field)* "BNB Chain has three hundred and seven thousand registered
> agents."
>
> *(as it empties)* "Almost none of them can be checked."
>
> *(on the survivors)* "Pokter measures the ones that can."

Then silence into the cut. Let the product's first frame land without narration.

---

## What it is doing, so the animator can judge their own takes

It never explains the product, and it should not. It states a problem and shows
a few survivors **without saying how they were chosen** — so the viewer's next
question is *how do you know which ones?*, which is exactly what the following
three minutes answers.

If a take makes the survivors look triumphant or heroic, it is wrong. They
should look **quiet and few**. The feeling is relief that anything is left, not
victory.
