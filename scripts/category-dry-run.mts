/**
 * What a change to the category rules would do to the real catalogue.
 *
 *   npx tsx scripts/category-dry-run.mts --input SNAPSHOT.json [--out DIR] [--review FILE]
 *
 * Reads a snapshot written by `scripts/category-snapshot.mts`, runs
 * production's classifier and every proposed rule set in
 * `scripts/category-variants.mts` over it, and writes a report listing each
 * agent whose category would change, with the terms (and where they were
 * found) behind both decisions, and the per-category counts before and
 * after. It reads nothing from the network, so the same snapshot always
 * gives the same report.
 *
 * Output goes to `--out` (default: a `pokter-category-dry-run` folder in
 * the OS temp directory) as `category-dry-run.md` and
 * `category-dry-run.json`. Reports are generated, and are not committed.
 *
 * `--review` scores each rule set against a hand-picked review set
 * (default: `tests/fixtures/categories/review-set.json`; `--no-review` skips it).
 *
 * Exits 1 when production's classifier, run on the snapshot, does not
 * reproduce the categories the catalogue showed, or the mirrored scorer
 * disagrees with production: either means the report cannot be trusted.
 * Exits 2 without `--input`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { emptyCounts, renderMarkdown, runDryRun, type DryRunAgent, type DryRunReport, type ReviewEntry } from './category-variants.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export interface DryRunFlags {
  input: string | null;
  out: string;
  review: string | null;
  recommend: string | undefined;
}

export function readFlags(argv: string[]): DryRunFlags {
  const value = (name: string) => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const review = value('--review');
  return {
    input: value('--input') ?? null,
    out: value('--out') ?? join(tmpdir(), 'pokter-category-dry-run'),
    review: argv.includes('--no-review') ? null : (review ?? join(ROOT, 'tests/fixtures/categories/review-set.json')),
    recommend: value('--recommend'),
  };
}

export function main(argv: string[]): { code: number; report: DryRunReport | null; lines: string[] } {
  const flags = readFlags(argv);
  if (!flags.input) {
    return {
      code: 2,
      report: null,
      lines: [
        'Usage: npx tsx scripts/category-dry-run.mts --input SNAPSHOT.json [--out DIR] [--review FILE | --no-review]',
        'Take a snapshot first with: npx tsx scripts/category-snapshot.mts --out SNAPSHOT.json',
      ],
    };
  }
  const input = resolve(flags.input);
  const snapshot = JSON.parse(readFileSync(input, 'utf8')) as { takenAt?: string; sources?: Record<string, string>; liveCounts?: Record<string, number>; agents: DryRunAgent[] };
  const review = flags.review ? (JSON.parse(readFileSync(flags.review, 'utf8')) as { agents: ReviewEntry[] }).agents : undefined;

  const report = runDryRun(snapshot, { path: input, review, recommend: flags.recommend });

  mkdirSync(flags.out, { recursive: true });
  const markdown = join(flags.out, 'category-dry-run.md');
  const json = join(flags.out, 'category-dry-run.json');
  writeFileSync(markdown, renderMarkdown(report));
  writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`);

  const lines: string[] = [];
  const { liveReproduced, mirrorParity } = report.checks;
  lines.push(`Snapshot ${input} (${report.input.listed} listed, ${report.input.agents} read)`);
  lines.push(`Production reproduces ${liveReproduced.matched}/${liveReproduced.of} live categories; mirror agrees on ${mirrorParity.matched}/${mirrorParity.of} records.`);
  const ids = Object.keys(emptyCounts()) as Array<keyof ReturnType<typeof emptyCounts>>;
  const base = report.variants[0]?.counts.before ?? emptyCounts();
  lines.push('', `${'category'.padEnd(14)} ${'live'.padStart(5)} ${'now'.padStart(5)} ${report.variants.map((v) => v.id.slice(0, 1).toUpperCase().padStart(5)).join(' ')}`);
  for (const id of ids) {
    lines.push(`${id.padEnd(14)} ${String(report.liveCounts?.[id] ?? (id === 'not listed' ? '-' : 0)).padStart(5)} ${String(base[id]).padStart(5)} ${report.variants.map((v) => String(v.counts.after[id]).padStart(5)).join(' ')}`);
  }
  lines.push('');
  for (const v of report.variants) {
    const r = v.review;
    lines.push(
      `${v.label}: ${v.summary.changed} change; ${v.summary.lostCategory} lose their category (${v.summary.lostCategoryLeaves} leave the catalogue), ${v.summary.movedCategory} move` +
        (r ? `; review set ${r.fixed.length}/${r.fixed.length + r.unfixed.length} misfiles fixed, ${r.broken.length} guards broken` : ''),
    );
  }
  lines.push('', `Recommended: ${report.recommendation.variant}`, `Wrote ${markdown}`, `Wrote ${json}`);
  return { code: liveReproduced.matched === liveReproduced.of && mirrorParity.matched === mirrorParity.of ? 0 : 1, report, lines };
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const { code, lines } = main(process.argv.slice(2));
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = code;
}
