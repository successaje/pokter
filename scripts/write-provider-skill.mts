/**
 * Write `.claude/skills/pokter-provider/SKILL.md` from its source module.
 *
 * The skill text has to exist as a file, because that is where Claude Code
 * loads a skill from, and over HTTP, because the onboarding prompt fetches
 * it onto somebody else's machine. One of those has to be generated from
 * the other or the two drift, and an instruction file that drifts is worse
 * than none: it fails quietly and confidently.
 *
 *   npx tsx scripts/write-provider-skill.mts
 *
 * `tests/provider-skill.test.mts` fails if the file is not what this would
 * write, so forgetting to run it is a failing build and not a surprise in
 * production.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { PROVIDER_SKILL_MD, PROVIDER_SKILL_NAME } from '../src/lib/builders/provider-skill';

const target = join(process.cwd(), '.claude', 'skills', PROVIDER_SKILL_NAME, 'SKILL.md');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, PROVIDER_SKILL_MD, 'utf8');
console.log(`Wrote ${target} (${PROVIDER_SKILL_MD.length} characters).`);
