import { PROVIDER_SKILL_NAME } from './provider-skill';

/**
 * The one line somebody pastes into Claude Code to set this up.
 *
 * It is one line because that is what gets used. A setup page that lists
 * six steps gets three of them done; `builder/ai-prompt.ts` exists for the
 * same reason on the building side. Everything the first turn needs is in
 * it: where the skill is, where to put it, which environment variable holds
 * the token, that the token is never to be printed, and a first call whose
 * answer tells the user whether it worked.
 *
 * `provider_status` is the ending on purpose. It is the one tool that needs
 * no scope beyond a live token, so it succeeds for any token that was
 * minted — which makes it the honest first check — and its answer states
 * the two limits a new user most needs to hear: that the assistant cannot
 * sign, and that running it is not hosting.
 */
export function providerOnboardingPrompt(origin: string): string {
  const base = origin.replace(/\/$/, '');
  return (
    `Set me up to take paid work on Pokter: fetch ${base}/api/skills/${PROVIDER_SKILL_NAME} ` +
    `and save it as .claude/skills/${PROVIDER_SKILL_NAME}/SKILL.md, follow its Setup section using the ` +
    `POKTER_AUTOMATION_TOKEN already in my environment (read it, never print it or commit it), ` +
    `then call provider_status and tell me in your own words what it says you can and cannot do for me.`
  );
}

/**
 * The shell line that puts the token where the skill expects it.
 *
 * Shown beside the token on the setup page, with a placeholder rather than
 * the token itself: a page that renders a live credential into a copyable
 * command invites it into shell history, and the user pastes the value in
 * themselves.
 */
export const TOKEN_ENV_NAME = 'POKTER_AUTOMATION_TOKEN';

export function tokenEnvLine(token?: string): string {
  return `export ${TOKEN_ENV_NAME}=${token ?? 'pka_…'}`;
}
