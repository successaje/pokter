/**
 * Write `.claude/skills/pokter-hire/SKILL.md` from its source module, as
 * `write-provider-skill.mts` does for the provider skill: one copy of the
 * text, served over HTTP and loaded from disk.
 *
 *   npx tsx scripts/write-hire-skill.mts
 *
 * `tests/hire-skill.test.mts` fails if the file is not what this would write.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { HIRE_SKILL_MD, HIRE_SKILL_NAME } from '../src/lib/builders/hire-skill';

const target = join(process.cwd(), '.claude', 'skills', HIRE_SKILL_NAME, 'SKILL.md');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, HIRE_SKILL_MD, 'utf8');
console.log(`Wrote ${target} (${HIRE_SKILL_MD.length} characters).`);
