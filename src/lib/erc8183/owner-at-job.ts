/**
 * Whether Pokter may say who owned a hired agent when its job was funded.
 *
 * The registry only answers who owns an agent now. Read close to the
 * funding, that is who took the job on; read later, it may be whoever the
 * agent was sold to since, and crediting them with work done before they
 * owned it is the mistake this exists to avoid. So an owner is recorded
 * only when the funding is proven recent: by the block the funding
 * transaction landed in, never by when Pokter first saw the job, which for
 * a backfilled job is the day of the backfill.
 *
 * Jobs funded before recording began, or seen too late, stay unattributed.
 * Nothing is filled in afterwards with today's owner.
 */
export const OWNER_WINDOW_MS = 2 * 60 * 60 * 1000;

/** A funded job without an owner yet, worth the RPC reads to check. */
export function ownerCandidate(
  job: { status: string; hireTxHash: string | null; hiredAt: string },
  hasOwner: boolean,
  nowMs: number,
): boolean {
  if (hasOwner || job.status === 'OPEN' || !job.hireTxHash) return false;
  // Pokter saw the job at or after its funding, so a job first seen outside the window was funded outside it too.
  const seenMs = Date.parse(job.hiredAt);
  return Number.isFinite(seenMs) && nowMs - seenMs <= OWNER_WINDOW_MS;
}

/** The funding block's time is the proof: within the window of the owner read, and not in the future. */
export function fundedRecently(fundedAtMs: number, nowMs: number): boolean {
  return Number.isFinite(fundedAtMs) && fundedAtMs <= nowMs + 60_000 && nowMs - fundedAtMs <= OWNER_WINDOW_MS;
}

/** What the proof reads from the agent's registry chain. Kept as an interface so the proof is tested without a chain. */
export interface OwnershipReader {
  latestBlock(): Promise<bigint>;
  /** A block's timestamp, in milliseconds. */
  blockTimeMs(block: bigint): Promise<number>;
  /** The agent's owner as of a block, or null when it cannot be read. */
  ownerAt(block: bigint): Promise<string | null>;
  /** How many Transfer events the agent's token emitted in [from, to], both included. Throws when it cannot say. */
  transfers(from: bigint, to: bigint): Promise<number>;
}

/** Blocks per log query: what the public BNB Chain RPC answers for a token-filtered Transfer query. */
export const LOG_CHUNK = 2000n;

/**
 * Who owned the agent when its job was funded, proven rather than assumed.
 *
 * The registry answers only "who owns it now". That is who owned it at
 * funding exactly when the token has not moved since: an ERC-721 owner
 * changes only through a Transfer event, so the owner at the latest block,
 * with no Transfer between the funding and that block, is the owner at
 * funding. Reading the owner alone, however soon after funding, credits
 * whoever the agent was sold to in between.
 *
 * `fromBlock` is the funding block when the job was funded on the agent's
 * own registry chain. Otherwise it is found from the funding time: a block
 * on the registry chain at or before it. That block is included in the
 * range, so a transfer in the same block as the funding — before or after
 * it, which the block alone cannot tell — leaves the owner unknown.
 *
 * Null means unknown and is final for the caller to keep: a transfer in
 * the range, or no owner to read. A chain that cannot be read throws, so
 * the caller can try again while the funding is still recent.
 */
export async function ownerAtFunding(reader: OwnershipReader, funding: { fundedAtMs: number; fromBlock?: bigint }, maxChunks = 12): Promise<string | null> {
  const latest = await reader.latestBlock();
  const from = funding.fromBlock ?? (await blockAtOrBefore(reader, latest, funding.fundedAtMs));
  if (from > latest) throw new Error('The registry chain is behind the funding block.');
  if ((latest - from) / LOG_CHUNK + 1n > BigInt(maxChunks)) return null; // too long ago to prove cheaply: unknown
  const owner = await reader.ownerAt(latest);
  if (!owner) return null;
  for (let start = from; start <= latest; start += LOG_CHUNK) {
    const end = start + LOG_CHUNK - 1n < latest ? start + LOG_CHUNK - 1n : latest;
    if ((await reader.transfers(start, end)) > 0) return null;
  }
  return owner;
}

/** A block on the reader's chain whose time is at or before `atMs`, estimated from the chain's own pace and then checked. */
async function blockAtOrBefore(reader: OwnershipReader, latest: bigint, atMs: number): Promise<bigint> {
  const sample = latest > 1000n ? 1000n : latest;
  const [tLatest, tEarlier] = await Promise.all([reader.blockTimeMs(latest), reader.blockTimeMs(latest - sample)]);
  const pace = Math.max(1, (tLatest - tEarlier) / Number(sample));
  let margin = 200n;
  let candidate = latest - BigInt(Math.ceil(Math.max(0, tLatest - atMs) / pace)) - margin;
  for (let tries = 0; tries < 5; tries += 1) {
    if (candidate < 0n) candidate = 0n;
    if ((await reader.blockTimeMs(candidate)) <= atMs) return candidate;
    margin *= 2n;
    candidate -= margin;
  }
  throw new Error('No block at or before the funding time was found.');
}
