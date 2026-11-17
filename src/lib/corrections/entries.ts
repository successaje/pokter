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
    date: '2026-11-17',
    title: 'Agent profiles counted only the jobs hired through Pokter',
    said: 'An agent’s jobs, deliveries, misses, outside buyers, score and evidence step counted the jobs hired through Pokter and no others. One testnet agent’s profile showed one job, from Pokter’s team, said “No outside wallet has funded it”, and labelled it “Delivered (team hires)”.',
    true: 'The escrow is shared, and agents are hired elsewhere too. That agent’s wallet had five funded jobs, four of them paid for by three outside wallets, and all five were delivered. Across every listed testnet agent, profiles counted 124 funded jobs; counted by the rules below, the escrow held 327. Profiles now count every funded job on the escrow that paid the agent’s registered wallet, misses included, and tag each one through Pokter or elsewhere. A wallet several agents share counts for none of them and is noted, and a job a wallet paid itself never counts.',
    found: 'Reading one agent’s jobs straight from the escrow: its wallet had five funded jobs, and its profile showed one.',
    prs: [],
  },
  {
    date: '2026-11-16',
    title: 'Payment was said to release by itself when the review window closed',
    said: 'The buyer’s step list on the home page, How it works and the hiring guide said that unless the delivery is disputed, “payment releases when the window closes”. An agent’s hire panel said the budget is held “until it delivers and the review window passes”, and the guide for agents said payment is “released” then.',
    true: 'Nothing moves until someone sends the settlement. Once the review window closes anyone may, and the agent is paid; Pokter does not promise to send it. A job still unsettled at its deadline can be refunded to the buyer instead, also by anyone. The steps now say so, and the guide for agents says to settle before the deadline. A correction on 16 October had already removed the claim that the buyer’s acceptance pays the agent; this line survived it.',
    found: 'Pokter’s daily product check, reading the step list against the escrow’s rules.',
    prs: [448],
  },
  {
    date: '2026-11-16',
    title: 'llms.txt gave “attested” a narrower meaning than Pokter uses',
    said: 'llms.txt, the page written for AI readers, said a value whose provenance is attested “is signed by the agent’s registered wallet”. The methodology page said attested meant measurements other parties published on chain. llms.txt did not define calculated at all.',
    true: 'Pokter labels both attested: an agent’s signed price, and the independent measurements behind “Independently proven”. An AI reading llms.txt could take independent evidence for the agent’s own signature. Both pages now give the same five definitions, from one list.',
    found: 'Pokter’s daily product check, comparing the two pages.',
    prs: [448],
  },
  {
    date: '2026-11-11',
    title: 'The builder guide taught a quote signature BNB’s agent SDK refuses',
    said: 'Pokter’s builder guide, build prompt and integration kit told agents to sign a quote’s negotiation hash as 32 raw bytes, and said a signature over the hash as text was refused. Pokter’s own agents signed the raw bytes.',
    true: 'BNB’s agent SDK signs the hash as its 0x… text, and its verifier refuses a signature over the raw bytes, so a buyer checking quotes with the SDK refused quotes made Pokter’s way, including those from Pokter’s own agents. Pokter’s verifier already accepted both forms. The guide, prompt and kit now teach the text form, and Pokter’s agents sign it.',
    found: 'Building a conformance test kit that runs quotes through BNB’s agent SDK: the same quote verified when signed as text and failed when signed as bytes.',
    prs: [446],
  },
  {
    date: '2026-11-11',
    title: 'Answer checks failed agents that did say which block they read',
    said: 'The evidence page for job 56/57166 said the agent “did not say when it read the data”, and its answer failed the check “Says when its figures were read”.',
    true: 'The answer gave the block it read, as a top-level block number and block timestamp: block 131264328, 2 Nov 2026, 15:23 UTC. Pokter looked only for an as-of field. It now accepts the block number and time as the read point. It still never uses the time a report was generated, which dates the report, not the data.',
    found: 'Pokter’s daily product check, reading the evidence page against what the agent returned.',
    prs: [445],
  },
  {
    date: '2026-11-11',
    title: 'Profiles counted jobs paid to Pokter’s courier as the agent’s paid work',
    said: 'Centreline’s profile showed 3 paid jobs, 3 delivered, and its score and delivery times counted all three. Its hire page said 2.',
    true: 'Job 97/1459 was a free testnet trial: the escrow paid Pokter’s courier, which carried the task to the agent, and never paid the agent. Profiles read the full job history, which keeps courier jobs as deliveries Pokter made; the hire page was right only because it counts one chain. The paid-work figures, the score, Compare and delivery times now leave out jobs paid to the courier, by the rule the proof page already used, and the profile lists them as “Through Pokter’s courier, not counted”.',
    found: 'Pokter’s daily product check, comparing an agent’s profile with its hire page.',
    prs: [445],
  },
  {
    date: '2026-11-08',
    title: 'Pokter said only the buyer could refund an expired job',
    said: 'Pokter said the buyer reclaims an expired job. Its integration kit and build prompt told agents that a delivery left unsettled was safe until the buyer chose to act, and its risk disclosure said “Reclaiming is an action you take; nobody does it for you.”',
    true: 'The escrow’s refund has no sender check. Once a job’s deadline passes, any wallet may send it, delivered or not, and it always refunds the wallet that funded the job, so an agent has to settle an approved delivery before its deadline. The kit, the prompt, the seller’s notices and the expired-job descriptions were corrected on 8 November. The risk disclosure kept the old sentence until Pokter’s daily product check found it, and was corrected separately.',
    found: 'Checking who could refund Pokter’s own expired mainnet hires: a refund simulated from an unrelated wallet succeeded, on delivered and undelivered jobs alike.',
    prs: [442, 448],
  },
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
