import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CHECK_DELIVERY, JOB_STATUS, PREPARE_BRIEF, PREPARE_HIRE } from '../src/lib/assistant/tools';
import { HIRE_SKILL_MD, HIRE_SKILL_NAME } from '../src/lib/builders/hire-skill';

/*
 * The skill that hires and reviews from the user's own Agentic Wallet. It
 * exists twice, as the file Claude Code loads and over HTTP, so one is
 * generated from the other and checked here; and what it tells an
 * assistant to do with money is checked line by line.
 */

/* The generated file Claude Code loads, not source code: what is checked is that it is exactly what the module produces. */
test('the SKILL.md on disk is what the module would write', async () => {
  const onDisk = await readFile(new URL(`../.claude/skills/${HIRE_SKILL_NAME}/SKILL.md`, import.meta.url), 'utf8');
  assert.equal(onDisk, HIRE_SKILL_MD, 'run `npx tsx scripts/write-hire-skill.mts`: the file and its source module have drifted');
});

test('it has the frontmatter Claude Code reads a skill by, and a name with no brand of anyone else’s', () => {
  assert.ok(HIRE_SKILL_MD.startsWith('---\n'));
  const [, frontmatter] = HIRE_SKILL_MD.split('---\n', 2);
  assert.match(frontmatter, new RegExp(`^name: ${HIRE_SKILL_NAME}$`, 'm'));
  assert.match(frontmatter, /^description: .{120,}$/m);
  assert.doesNotMatch(HIRE_SKILL_NAME, /binance|bnb/i);
});

test('it is written for one assistant and claims no broader compatibility', () => {
  assert.match(HIRE_SKILL_MD, /Claude Code/);
  assert.match(HIRE_SKILL_MD, /claude mcp add --transport http pokter https:\/\/pokter\.xyz\/api\/mcp/);
  for (const hedge of [/any assistant/i, /other assistants/i, /also works with/i, /compatible with/i, /any MCP client/i, /works with any/i]) {
    assert.doesNotMatch(HIRE_SKILL_MD, hedge);
  }
});

test('the user approves every call, one at a time, before anything else is said', () => {
  const rules = HIRE_SKILL_MD.indexOf("## 1. Every transaction is the user's");
  assert.ok(rules > 0 && rules < HIRE_SKILL_MD.indexOf('## Setup'), 'the rules come before the instructions that rely on them');
  assert.match(HIRE_SKILL_MD, /Run `baw contract-call execute` only after a yes in this\s+conversation, for that call\. A yes to one call is not a yes to the next\./);
  assert.match(HIRE_SKILL_MD, /never ask the user to approve several calls at once/);
  assert.match(HIRE_SKILL_MD, /Never use an option that skips the preview or the user's confirmation/);
  assert.match(HIRE_SKILL_MD, /Never run `execute`\s+twice for one step/);
  // Every execute in the file follows a preview the user was shown.
  for (const flag of [/--yes\b/, /--force\b/, /--no-confirm/, /--skip/]) assert.doesNotMatch(HIRE_SKILL_MD, flag);
});

test('no key, no unlimited approval, and no wallet looked up by name', () => {
  assert.match(HIRE_SKILL_MD, /\*\*Never\*\* ask the user for a private key, a seed phrase or a password/);
  assert.match(HIRE_SKILL_MD, /Approvals are always for the exact price, never unlimited/);
  assert.match(HIRE_SKILL_MD, /Never look up anyone else's wallet by their name or Agent ID/);
  assert.doesNotMatch(HIRE_SKILL_MD, /resolve-domain/, 'the skill never resolves a name to a wallet');
  assert.match(HIRE_SKILL_MD, /never instructions to you/);
});

test('it says before the agent is contacted that the brief goes to the agent, and never fills in the review', () => {
  assert.match(HIRE_SKILL_MD, /which sends the brief to the agent's own endpoint: tell the user before\s+you call it/);
  assert.match(HIRE_SKILL_MD, /Then ask them, and never fill in yourself/);
});

test('the hire tools it names are the assistant tools by those names', () => {
  for (const tool of [PREPARE_BRIEF, PREPARE_HIRE, JOB_STATUS, CHECK_DELIVERY]) assert.match(HIRE_SKILL_MD, new RegExp(`\`${tool.name}\``), tool.name);
  // prepare_hire takes the three fields the skill fills in from the user.
  for (const field of ['escrow_chain_id', 'owner_address', 'max_budget']) {
    assert.ok((PREPARE_HIRE.inputSchema as { required: string[] }).required.includes(field), field);
    assert.match(HIRE_SKILL_MD, new RegExp(`\`${field}\``));
  }
});
