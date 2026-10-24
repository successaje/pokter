/**
 * Who has started using Pokter, as counts: for the operator, never public.
 *
 * Pokter has no accounts. A person shows up as a wallet that signed
 * something (a profile, a Building sign-in, a request, a bid, a funded
 * job) or as an email they verified. Each is counted by when it first
 * appeared, with the team's own wallets counted apart: on 24 October
 * most of these were the team, and a total that mixes the two reads as
 * adoption that has not happened.
 *
 * Pure: the route reads the stores and hands the rows in. Nothing here
 * returns an address, an email or a handle, only how many.
 */

export interface WalletCohort {
  /** Distinct wallets, team included. */
  total: number;
  /** Distinct wallets outside the team. */
  outside: number;
  /** Outside wallets first seen in the last 7 and 30 days. */
  outsideNew7d: number;
  outsideNew30d: number;
}

const DAY_MS = 86_400_000;

export function walletCohort(rows: ReadonlyArray<{ wallet: string | null | undefined; firstAt: string | null | undefined }>, team: ReadonlySet<string>, now: number): WalletCohort {
  const first = new Map<string, number>();
  for (const row of rows) {
    const wallet = row.wallet?.trim().toLowerCase();
    if (!wallet) continue;
    const at = row.firstAt ? Date.parse(row.firstAt) : Number.NaN;
    const known = first.get(wallet);
    if (known === undefined || (Number.isFinite(at) && (!Number.isFinite(known) || at < known))) first.set(wallet, at);
  }
  const outside = [...first].filter(([wallet]) => !team.has(wallet));
  const since = (days: number) => outside.filter(([, at]) => Number.isFinite(at) && at >= now - days * DAY_MS).length;
  return { total: first.size, outside: outside.length, outsideNew7d: since(7), outsideNew30d: since(30) };
}

export interface SignupReport {
  observedAt: string;
  wallets: {
    profiles: WalletCohort & { withHandle: number };
    buildingSignIns: WalletCohort;
    requestPosters: WalletCohort;
    bidders: WalletCohort;
    buyers: WalletCohort;
    /** Any of the above, each wallet once. */
    anyOfThese: WalletCohort;
  };
  emails: unknown;
  definitions: readonly string[];
}

export function buildSignupReport(input: {
  profiles: ReadonlyArray<{ wallet: string; signedAt: string; handle: boolean }>;
  buildingSignIns: ReadonlyArray<{ wallet: string; firstAt: string }>;
  posters: ReadonlyArray<{ wallet: string; firstAt: string }>;
  bidders: ReadonlyArray<{ wallet: string; firstAt: string }>;
  buyers: ReadonlyArray<{ wallet: string | null | undefined; firstAt: string }>;
  emails: unknown;
  team: ReadonlySet<string>;
  now: number;
}): SignupReport {
  const profileRows = input.profiles.map((p) => ({ wallet: p.wallet, firstAt: p.signedAt }));
  const cohort = (rows: ReadonlyArray<{ wallet: string | null | undefined; firstAt: string | null | undefined }>) => walletCohort(rows, input.team, input.now);
  return {
    observedAt: new Date(input.now).toISOString(),
    wallets: {
      profiles: { ...cohort(profileRows), withHandle: input.profiles.filter((p) => p.handle).length },
      buildingSignIns: cohort(input.buildingSignIns),
      requestPosters: cohort(input.posters),
      bidders: cohort(input.bidders),
      buyers: cohort(input.buyers),
      anyOfThese: cohort([...profileRows, ...input.buildingSignIns, ...input.posters, ...input.bidders, ...input.buyers]),
    },
    emails: input.emails,
    definitions: [
      'Wallet counts are distinct wallets; "outside" leaves out the published team wallets and the operator.',
      'New means first seen in the window. A profile has no creation time, so its window is when it was last signed.',
      'Buyers are wallets that funded a job through Pokter. Request posters, bidders and Building sign-ins each signed with their wallet.',
      'Email counts are verified, still-subscribed addresses by kind; requests in a window count sign-ups asked for, verified or not. Emails cannot be told apart as team or outside.',
      'Passkey wallets, saved agents and the Set and Earn registration live only in the browser and cannot be counted.',
    ],
  };
}
