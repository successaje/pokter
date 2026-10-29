import type { CampaignProgressReport } from './progress-server';

/**
 * Three answers a campaign checker can give, and never a fourth.
 *
 * `verified`: Pokter read it from public chain data and it holds.
 * `not-yet`: Pokter can see it does not hold yet.
 * `cannot-verify`: it may hold, but Pokter cannot confirm it: a step only
 * the participant can vouch for (registering on BNB Chain's form), a count
 * whose meaning BNB Chain judges (whether hirers are independent, whether
 * the agent's actions fit its category), or a read that failed just now.
 *
 * A green tick is `verified` only. Counting five actions on three days is
 * not the same as those actions satisfying the campaign, and a checker that
 * says otherwise promises a qualification it cannot see.
 */
export type CampaignCheck = 'verified' | 'not-yet' | 'cannot-verify';

export const CHECK_WORDS: Record<CampaignCheck, string> = {
  verified: 'Verified',
  'not-yet': 'Not yet met',
  'cannot-verify': 'Pokter can’t verify',
};

export interface CampaignStep {
  id: 'register' | 'hire' | 'build' | 'adoption';
  state: CampaignCheck;
  /** How far along, for the bar: 1 when nothing Pokter can count is left. */
  progress: number;
}

const part = (value: number, target: number) => Math.min(Math.max(value, 0), target) / target;

/** The four Set and Earn steps, each as one of the three answers. */
export function campaignSteps(report: Pick<CampaignProgressReport, 'hires' | 'build' | 'adoption'>, registered: boolean): CampaignStep[] {
  const h = report.hires;
  const hire: CampaignStep = h.distinctAgents >= 3 && h.marketplacesStatus === 'met'
    ? { id: 'hire', state: 'verified', progress: 1 }
    : h.distinctAgents >= 3 && h.marketplacesStatus === 'likely'
      ? { id: 'hire', state: 'cannot-verify', progress: 1 }
      : { id: 'hire', state: 'not-yet', progress: Math.min(0.95, part(h.distinctAgents, 3)) };

  const inWindow = report.build?.some((a) => a.inWindow === true) ?? false;
  const build: CampaignStep = report.build === null
    ? { id: 'build', state: 'cannot-verify', progress: 0 }
    : { id: 'build', state: inWindow ? 'verified' : 'not-yet', progress: inWindow ? 1 : 0 };

  const a = report.adoption;
  const counted = Boolean(a && a.independentWallets >= 3 && a.actions >= 5 && a.activeDays >= 3);
  const adoption: CampaignStep = !inWindow
    ? { id: 'adoption', state: 'not-yet', progress: 0 }
    : counted
      ? { id: 'adoption', state: 'cannot-verify', progress: 1 }
      : { id: 'adoption', state: 'not-yet', progress: a ? Math.min(0.95, (part(a.independentWallets, 3) + part(a.actions, 5) + part(a.activeDays, 3)) / 3) : 0 };

  return [
    { id: 'register', state: registered ? 'cannot-verify' : 'not-yet', progress: registered ? 1 : 0 },
    hire,
    build,
    adoption,
  ];
}

/** One line for the top of the checker: what is verified, what Pokter cannot confirm, what is left. */
export function campaignHeadline(steps: CampaignStep[]): string {
  const count = (state: CampaignCheck) => steps.filter((s) => s.state === state).length;
  const verified = count('verified');
  const unverifiable = count('cannot-verify');
  const left = count('not-yet');
  if (left === 0) return `Nothing left that Pokter can see: ${verified} of ${steps.length} verified${unverifiable ? `, ${unverifiable} Pokter can’t verify` : ''}`;
  return [`${verified} of ${steps.length} verified`, unverifiable ? `${unverifiable} Pokter can’t verify` : null, `${left} not yet met`].filter(Boolean).join(' · ');
}
