import assert from 'node:assert/strict';
import test from 'node:test';

/*
 * The hire skill as somebody's assistant fetches it: served whole, as the
 * module writes it. (The routes it posts to load the SDK, which this runner
 * cannot, so their logic is tested in agentic-hire and board-agent-review.)
 */

const { HIRE_SKILL_MD, HIRE_SKILL_NAME } = await import('../../src/lib/builders/hire-skill');
const skills = await import('../../src/app/api/skills/[name]/route');

test('the skill is served exactly as written', async () => {
  const response = await skills.GET(new Request(`http://localhost/api/skills/${HIRE_SKILL_NAME}`), { params: Promise.resolve({ name: HIRE_SKILL_NAME }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/markdown/);
  assert.equal(await response.text(), HIRE_SKILL_MD);
});
