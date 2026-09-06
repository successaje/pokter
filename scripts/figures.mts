/**
 * Print the figures the demo and the docs quote, read from production.
 *
 *   npm run figures
 *
 * These grow every two hours as sweeps accumulate, so any number written into a
 * document starts ageing the moment it is written. Rather than trust a
 * hand-patched value, this reads the deployed site and says plainly what is
 * currently true — run it before recording, and before submitting.
 */
const SITE = process.env.POKTER_URL ?? 'https://pokter.fly.dev';

const LABELS = [
  'registered agents',
  'agents monitored',
  'probes taken',
  'financial categories',
] as const;

function textOf(html: string): string[] {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, '|');
  return stripped
    .split('|')
    .map((s) =>
      s
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#x27;|&#39;/g, "'")
        .trim(),
    )
    .filter(Boolean);
}

const response = await fetch(SITE, { headers: { 'user-agent': 'pokter-figures' } });
if (!response.ok) {
  console.error(`Could not read ${SITE}: HTTP ${response.status}`);
  process.exit(1);
}

const rows = textOf(await response.text());

console.log(`Live figures from ${SITE}\n`);
for (const label of LABELS) {
  const index = rows.indexOf(label);
  console.log(
    index > 0
      ? `  ${rows[index - 1].padStart(9)}  ${label}`
      : `  ${'?'.padStart(9)}  ${label} (not found)`,
  );
}

console.log(`
Where these are quoted, and what to check:

  docs/demo-walkthrough.md   the pre-flight table you verify before recording
  docs/demo-script.md        the cold-open counter and the spoken numbers
  docs/cold-open-prompt.md   the overlays burned into the animation
  README.md                  written with '+' so it ages without becoming wrong

Read what is on screen, never what a document says. A stale figure spoken over
a live page undercuts the one thing this product is arguing for.`);
