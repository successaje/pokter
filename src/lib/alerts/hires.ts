import 'server-only';

import { getErc8183Job } from '@altananetwork/sdk';
import { createPublicClient, http, type Address } from 'viem';

import { ALTANA_NETWORK } from '@/lib/altana/client';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { getJobStore } from '@/lib/erc8183/store';
import { decodePokterJobEnvelope } from '@/lib/erc8183/job-envelope';
import { alertChannels, sendOperatorAlert } from '@/lib/alerts/operator';
import { isTeamWallet } from '@/lib/alerts/team-wallets';

export { TEAM_WALLETS, isTeamWallet } from '@/lib/alerts/team-wallets';

const CURSOR = 'hire-watch:job-counter';

const COUNTER_ABI = [
  {
    type: 'function',
    name: 'jobCounter',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

/**
 * How many new ids one run will look at.
 *
 * The counter is shared with everything else deployed against this ERC-8183
 * commerce contract, so a quiet week for Pokter can still move it a long way.
 * Without a bound, one run after a busy stretch would try to read hundreds of
 * jobs inside a cron request and time out, losing the cursor advance with it.
 */
const MAX_JOBS_PER_RUN = 25;

export interface HireSighting {
  jobId: string;
  client: string;
  provider: string;
  status: string;
  team: boolean;
  /**
   * Whether the job carries Pokter's own envelope in its on-chain
   * description. The counter is shared with everything else deployed against
   * this commerce contract, so "not ours" and "not a Pokter hire" are
   * different questions and only this one answers the second.
   */
  viaPokter: boolean;
  agentName?: string;
}

export interface HireWatchResult {
  /** Null when the counter could not be read; never zero as a stand-in. */
  counter: string | null;
  /** The id this run started from, or null on the very first run. */
  from: string | null;
  sightings: HireSighting[];
  outsiders: number;
  alerted: boolean;
  /*
   * Which channels could have fired, read at the moment of the check.
   *
   * `alerted: false` is ambiguous on its own — it means either "nothing
   * happened worth alerting about" or "something did and we had no way to
   * tell you". Those are opposite situations, and the second has already
   * happened unnoticed once. Reporting the channel state separates them in
   * the sweep's own output.
   */
  channels: ReturnType<typeof alertChannels>;
  note?: string;
}

/**
 * Poll the job counter and report jobs we have not already seen.
 *
 * A poll rather than an event subscription on purpose: the public BSC testnet
 * RPC refuses `eth_getLogs` outright — a 1,000-block topic-filtered query
 * comes back "Request exceeds defined limit" — so a log watcher cannot run
 * there at all. `jobCounter` is a single `eth_call` and always answers.
 *
 * The first run records where the counter is and alerts on nothing. Every job
 * that already exists predates the watcher, and starting with a burst of
 * historical alerts is how an alerting channel gets muted on day one.
 */
export async function checkForNewHires(): Promise<HireWatchResult> {
  const store = getJobStore();
  const client = createPublicClient({
    chain: ALTANA_NETWORK.chain,
    transport: http(ALTANA_NETWORK.publicRpcUrl),
  });
  const addresses = correctedErc8183Addresses(ALTANA_NETWORK.chainId);

  let counter: bigint;
  try {
    counter = await client.readContract({
      address: addresses.commerce as Address,
      abi: COUNTER_ABI,
      functionName: 'jobCounter',
    });
  } catch {
    return {
      counter: null,
      from: null,
      sightings: [],
      outsiders: 0,
      alerted: false,
      channels: alertChannels(),
      note: 'The job counter could not be read this run.',
    };
  }

  const seen = store.readCursor(CURSOR);
  if (seen === null) {
    store.writeCursor(CURSOR, counter.toString());
    return {
      counter: counter.toString(),
      from: null,
      sightings: [],
      outsiders: 0,
      alerted: false,
      channels: alertChannels(),
      note: `First run. Watching from job #${counter.toString()} onward.`,
    };
  }

  const from = BigInt(seen);
  if (counter <= from) {
    return {
      counter: counter.toString(),
      from: seen,
      sightings: [],
      outsiders: 0,
      alerted: false,
      channels: alertChannels(),
    };
  }

  const last = counter - from > BigInt(MAX_JOBS_PER_RUN)
    ? from + BigInt(MAX_JOBS_PER_RUN)
    : counter;

  const sightings: HireSighting[] = [];
  for (let id = from + 1n; id <= last; id++) {
    try {
      const job = await getErc8183Job(ALTANA_NETWORK, id);
      const envelope = decodePokterJobEnvelope(job.description);
      sightings.push({
        jobId: id.toString(),
        client: job.client,
        provider: job.provider,
        status: job.statusName,
        team: isTeamWallet(job.client),
        viaPokter: envelope !== null,
        agentName: envelope?.identity.name ?? undefined,
      });
    } catch {
      // An unreadable id must not stall the cursor behind it forever: the
      // counter is shared, so some ids belong to contracts we cannot decode.
      sightings.push({
        jobId: id.toString(),
        client: '',
        provider: '',
        status: 'UNREADABLE',
        team: false,
        viaPokter: false,
      });
    }
  }

  /*
   * Worth waking someone for: a job that went through Pokter, from a wallet
   * that is not ours. A job on this contract without our envelope belongs to
   * another project and is not our news.
   */
  const outside = sightings.filter(
    (s) => !s.team && s.viaPokter && s.status !== 'UNREADABLE',
  );

  let alerted = false;
  if (outside.length > 0) {
    const lines = outside
      .map(
        (s) =>
          `#${s.jobId} · ${s.status}${s.agentName ? ` · hired ${s.agentName}` : ''}\n` +
          `client ${s.client}\n` +
          `https://testnet.bscscan.com/address/${s.client}`,
      )
      .join('\n\n');
    const delivery = await sendOperatorAlert({
      subject: `Pokter: ${outside.length} job${outside.length === 1 ? '' : 's'} from outside the team`,
      body:
        `${lines}\n\n` +
        'Each carries Pokter\'s job envelope and none of these clients is a ' +
        'declared team wallet, so these are hires made through Pokter by ' +
        'somebody else.',
    });
    alerted = delivery.telegram === 'sent' || delivery.email === 'sent';
  }

  store.writeCursor(CURSOR, last.toString());

  return {
    counter: counter.toString(),
    from: seen,
    sightings,
    outsiders: outside.length,
    alerted,
    channels: alertChannels(),
  };
}
