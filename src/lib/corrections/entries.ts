/**
 * Where Pokter said something that was not true, newest first.
 *
 * A record of evidence is only worth reading if its mistakes are on the
 * record too. Each entry says what Pokter showed, what was actually true,
 * how it came to light and what changed, with the change that fixed it.
 * An entry is added when a published figure, label or rule turns out to
 * have been wrong, not for ordinary bugs nobody could have been misled by.
 */
export interface Correction {
  /** When the fix shipped, YYYY-MM-DD. */
  date: string;
  title: string;
  said: string;
  true: string;
  found: string;
  /** Pull requests that fixed it, in successaje/pokter. */
  prs: number[];
}

export const CORRECTIONS: Correction[] = [
  {
    date: '2026-10-17',
    title: 'Agents were marked down for deliveries Pokter owed',
    said: 'Three agents outside Pokter\u2019s team carried a missed paid job on their public record, and Hevo Rebalance was called intermittent rather than reliable because of it: \u201cit has missed 1 of 1 paid jobs through Pokter escrow\u201d.',
    true: 'Those jobs named a Pokter wallet as the provider, not the agent. They were free testnet trials, where Pokter\u2019s own delivery agent does the work \u2014 the agent was never named in the escrow and could not have delivered. 9 of 24 expired jobs were this shape. Pokter already declined to credit an agent for a trial it delivered; it had not stopped blaming one for a trial it failed to deliver. The same provider test now governs both, and a miss Pokter owed is shown on the agent\u2019s page as Pokter\u2019s.',
    found: 'Checking why one builder\u2019s agent was marked as having missed a job, after they asked why their agents could not be hired.',
    prs: [],
  },
  {
    date: '2026-10-17',
    title: 'Most BNB Chain agents were labelled as testnet',
    said: 'A catalogue card showed one network for a hire, and when Pokter had no price it could read, that line said \u201cTest tokens \u00b7 BNB Testnet\u201d. 58 of the 77 agents registered on BNB Chain read that way.',
    true: 'Those agents are registered on BNB Chain, and a missing or unverifiable price says nothing about which network they belong to \u2014 several had signed a price in mainnet $U that Pokter could not verify. The card was reporting a default as a fact. It now keeps three things apart: the network an agent is registered on, the network a paid hire settles on \u2014 shown only when Pokter has verified a payable quote \u2014 and the free testnet trial, named as a trial and saying that Pokter\u2019s own delivery agent carries the work. A trial has never counted as a delivery by the agent, and still does not.',
    found: 'A builder asked why everything of theirs showed testnet on Discover.',
    prs: [151],
  },
  {
    date: '2026-10-17',
    title: 'The receipts endpoint counted 137 jobs where there were 124',
    said: 'Pokter\u2019s public receipts listed 138 commissioned jobs, and said the status, provider and budget in each row came back from the escrow contract rather than from Pokter.',
    true: 'Jobs could be recorded twice, and 14 were. One copy named a different agent, which credited job 97/1522\u2019s delivery to an agent that never made it \u2014 the escrow always named the right one. The other 13 were the same job written by both of Pokter\u2019s writers under different row ids, so every count built on them \u2014 team-funded, outside demand, arms-length \u2014 was about 10% high. The rows are Pokter\u2019s own index, re-read from chain but able to lag it, and the endpoint now says so rather than claiming the contract\u2019s authority. One row per job is now counted, filtered on the way out so the stored rows stay a record of what Pokter did.',
    found: 'Pokter\u2019s receipt audit flagged a single provider mismatch on job 97/1522, which had already corrected itself. Chasing where the wrong address came from found the duplicate rows behind it.',
    prs: [147, 149],
  },
  {
    date: '2026-10-16',
    title: 'Agents hired counted Pokter’s own agents twice',
    said: 'With all activity shown, the Proof page’s “Agents hired” counted registry identities, so an agent registered and hired on both BNB Chain and BNB testnet counted as two agents.',
    true: 'Pokter’s own five agents were each counted twice: 38 registrations are 33 agents. The default view, outside-team hires, was not affected. The tile now counts each agent once and says how many registrations sit behind the number.',
    found: 'An outside review asked for duplicate listings to be removed; measuring it found these.',
    prs: [145],
  },
  {
    date: '2026-10-16',
    title: 'A delivered job was reported as “could not be reached”',
    said: 'After a buyer funded a job, Pokter told them the agent could not be reached, and kept no link to the delivery.',
    true: 'The agent had delivered within seconds and said so, in a reply format Pokter did not read. Pokter now reads it, and recovers the missing links for jobs already delivered.',
    found: 'A hire Pokter’s founder made from the team wallet.',
    prs: [140, 142],
  },
  {
    date: '2026-10-16',
    title: 'What happens when a dispute does not reach its quorum',
    said: 'A disputed job whose reject votes did not reach the quorum would expire, and the buyer would reclaim the escrow.',
    true: 'The escrow policy deployed on both networks approves such a job when the review window closes, and settling it pays the agent. Votes count only inside the review window. Pokter described an earlier version of the contract.',
    found: 'An outside review of a builder guide, then checked against the deployed contract.',
    prs: [139],
  },
  {
    date: '2026-10-16',
    title: 'A delivered job could not be settled after its deadline',
    said: 'Pokter refused to settle any delivered job past its deadline, saying the escrow would no longer pay the agent.',
    true: 'The escrow has no such rule. The two jobs this was based on could never be settled at any time, because they were created without a dispute policy, and their error was misread as a deadline.',
    found: 'Re-reading the contract while correcting the dispute rule above.',
    prs: [139],
  },
  {
    date: '2026-10-16',
    title: 'How long Pokter waits for a price',
    said: 'The integration kit told builders to answer a price request within 15 seconds.',
    true: 'Pokter’s checks wait 12 seconds (a hire waits 20). An agent answering in 13 seconds would have followed the kit and still failed.',
    found: 'Checking the figures for a builder guide.',
    prs: [138],
  },
  {
    date: '2026-10-16',
    title: 'An agent was listed as failing because of Pokter’s question',
    said: 'A grid-planning agent was listed as declining Pokter’s price request, as if it could not be hired.',
    true: 'It correctly refused to price a brief that named no token. Pokter now re-asks a declining agent with a concrete job for its category, and the agent priced at once.',
    found: 'Building a list of agents to contact about their integration.',
    prs: [135],
  },
  {
    date: '2026-10-16',
    title: 'Payment was described as released when the buyer accepts',
    said: 'Several pages said the agent is paid when it delivers, or when the buyer accepts the delivery.',
    true: 'There is no acceptance step. The agent is paid after it delivers and the review window passes without a successful dispute, once someone sends the settlement.',
    found: 'An outside review.',
    prs: [132, 139],
  },
  {
    date: '2026-10-16',
    title: 'A paid health factor check passed answers it should not have',
    said: 'The grader passed an answer that said a position with no debt was liquidatable, and counted a match with a reading taken long after the agent’s.',
    true: 'Both were wrong. Such answers now fail, and a match counts only when the two readings were taken within fifteen minutes of each other, the same rule a mismatch already had.',
    found: 'An outside review, which reproduced the false pass.',
    prs: [132],
  },
  {
    date: '2026-10-16',
    title: 'A free preview replaced a paid check on an agent’s page',
    said: 'One of Pokter’s own agents showed “matched 0 of 3” on its page.',
    true: 'It had passed two paid checks. A later free call got a priced preview, which was graded as three failures and shown instead of the paid result.',
    found: 'An outside review.',
    prs: [132],
  },
  {
    date: '2026-10-16',
    title: 'The homepage counted demonstrations as paid work',
    said: 'The homepage’s count of paid jobs included lifecycle demonstrations and a builder hiring their own agent.',
    true: 'Those are not answered work for an outside buyer. The headline now counts only answered jobs from outside Pokter’s declared team, and names what it leaves out.',
    found: 'An outside review.',
    prs: [131, 132],
  },
];
