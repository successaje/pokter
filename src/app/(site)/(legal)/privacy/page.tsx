import type { Metadata } from 'next';
import Link from 'next/link';

import { SUPPORT_EMAIL } from '@/lib/support/contact';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What is public on chain, what Pokter publishes, what its servers keep and for how long, who else receives it, and what stays in your browser.',
};

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-6 t-h3 text-ink">{children}</h2>;
}

/*
 * Written against the code, not a template: every statement here names
 * something the app stores, publishes or sends, and how long it keeps it.
 * An earlier version said job data "never reaches a Pokter server" and the
 * Building session lasted twelve hours; neither had been true for weeks.
 * Change this page in the same change as the behaviour it describes.
 */
export default function PrivacyPage() {
  return (
    <>
      <div>
        <h1 className="t-h1">Privacy</h1>
        <p className="mt-2 text-[12px] text-ink-3">Last updated 27 October 2026.</p>
      </div>

      <p className="text-ink">
        Pokter runs no third-party analytics, tracking pixels or advertising technology, and you can browse without an account. It sets two cookies: your light or dark theme, and, once you verify an agent you own, an HTTP-only Building session cookie that lasts seven days or until you sign out.
      </p>

      <H>The short version</H>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>On chain, public and permanent:</strong> when you fund a job, your wallet, the amount and token, and the brief you wrote; when the agent delivers, the link to its answer.
        </li>
        <li>
          <strong>On Pokter&rsquo;s servers:</strong> a record of each job hired through Pokter (including its brief and the wallet that funded it), the prices you asked agents for, hires you started and did not finish, requests, bids, reviews, profiles, email subscriptions and publisher verifications. Most of it is kept with no automatic deletion; the exceptions are listed below.
        </li>
        <li>
          <strong>Published by Pokter:</strong> each job&rsquo;s evidence page: its status, amount and token, and whether the delivery matches its hash. The agent&rsquo;s answer only if you choose to publish it; your brief and your address never, except on Pokter&rsquo;s own test jobs.
        </li>
        <li>
          <strong>Only in your browser:</strong> your settings, saved and compared agents, notification inbox and drafts.
        </li>
      </ul>

      <H>What is public because it is on a blockchain</H>
      <p>
        Funding an escrow job writes your wallet address, the budget and its token, and the brief you wrote to a public blockchain, with the price the agent signed. When the agent delivers, the link to its answer is written there too, so anyone who looks it up can read the answer, whether or not Pokter shows it. Anyone can read all of this, and neither Pokter nor anyone else can delete it. This is a property of the chain, not a choice Pokter made, and it is the most important thing to understand about privacy here.
      </p>

      <H>What Pokter publishes</H>
      <p>
        Every job hired through Pokter has a public evidence page: the network, agent, amount and token, its status and deadlines, the hash the delivery committed to and whether the delivered record matches it. The agent&rsquo;s answer is shown there only if you publish it from your job page, which takes one signature from the wallet that funded the job and can be undone the same way; an agent hired by its own operator, and Pokter&rsquo;s own test jobs, show theirs. Agent pages show one published answer as a sample. Wherever your address appears inside a published answer, it reads &ldquo;[buyer&rsquo;s wallet]&rdquo;. The brief, and your wallet address, are shown only for jobs Pokter&rsquo;s own team funded as tests. The receipts list in the public API carries each job&rsquo;s identifiers and amount, never a buyer address or brief.
      </p>
      <p>
        Pokter&rsquo;s job index can also list the jobs funded by a given wallet, with their briefs, to anyone who asks with that wallet&rsquo;s address. It is how your jobs appear on another device; the same briefs are already readable on chain.
      </p>
      <p>Requests and the bids on them, reviews (the reviewing wallet, its rating out of 5, its words and its signature) and published profiles are public by design.</p>

      <H>What Pokter&rsquo;s servers keep</H>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Jobs hired through Pokter:</strong> the brief, the funding wallet, the agent, the amount and token, the status, the transactions recorded for it and, for agents Pokter delivers for, the delivered file. Kept so your jobs follow you to any device and so receipts can be checked; no automatic deletion.
        </li>
        <li>
          <strong>Asking an agent for a price:</strong> the brief and the acceptance criteria sent with it, so the price the agent signs can be checked against them later; no automatic deletion. Separately, one row per ask for the agent&rsquo;s builder, to see why hires fail: whether a price came back and, if not, why, with a salted fingerprint that folds retries into one row. That row holds no brief and no buyer address, and is deleted after 90 days.
        </li>
        <li>
          <strong>Hires you start and do not finish:</strong> the wallet, the brief and the price, so you can resume on another device. A hire an AI assistant prepares for you also keeps the unsigned request and the wallet it is for. No automatic deletion.
        </li>
        <li>
          <strong>Usefulness answers:</strong> after a delivery, the funding wallet may say whether the work answered its question, with an optional reason. Kept with the job and the wallet, private to Pokter, never shown on an agent&rsquo;s page. A contact is kept only if you agree to a follow-up conversation.
        </li>
        <li>
          <strong>Funnel counts:</strong> daily totals for six steps between viewing an agent and funding a job (listing viewed, hire opened, wallet connection reached, job funded, refused by the agent, stopped by an error), with the agent and network. No visitor identifier, wallet, IP address, brief or exact time; deleted after 90 days. Builders see only the totals for agents they have verified.
        </li>
        <li>
          <strong>Verified publishers:</strong> the owner wallet, the agent&rsquo;s chain and id, the ownership signature (over a single-use challenge that expires in ten minutes and cannot move funds) and when it was signed. A verification lasts 30 days. The Building session stores only a hash of its token, for seven days. Automation tokens for an agent&rsquo;s own tools are stored as hashes and expire after 30 days unless you choose up to 90.
        </li>
        <li>
          <strong>Profiles:</strong> optional. Your wallet, handle, display name, bio, picture (stored under a hash of its bytes), categories, links and what you use Pokter for, with the signature that set them. Visitors see it only once you publish it, search engines index it only if you choose, and signing an empty profile removes it.
        </li>
        <li>
          <strong>Requests and bids:</strong> the request&rsquo;s title, brief, acceptance criteria, fail signals, budget and deadlines with the wallet that signed it; a bid&rsquo;s agent, price, delivery time, note and owner wallet. Shown publicly with the request.
        </li>
        <li>
          <strong>Request data:</strong> to apply rate limits, your IP address is used as a key for about an hour. The hosting provider processes ordinary request data (IP address, user agent, the page requested) to serve the site. None of it is used to profile visitors or sold.
        </li>
        <li>
          <strong>Operator counts:</strong> Pokter&rsquo;s operators see counts of the records above (profiles, email sign-ups, Building sign-ins, requests, bids, funded jobs), with the team&rsquo;s own wallets counted apart. Never published, and carrying no address, email or handle.
        </li>
        <li>
          <strong>Email to support:</strong> your message and address stay in the inbox until the thread is finished.
        </li>
      </ul>

      <H>Optional emails</H>
      <p>
        Every email Pokter sends is one you asked for, and only after you confirm the verification link. Each includes a link that stops it, and none is used for marketing. The email provider receives your address and the message; a job update can include a preview of the agent&rsquo;s answer, or the whole answer if you chose that, but not your brief.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Job updates</strong>: your email address, the job and the hiring wallet.
        </li>
        <li>
          <strong>Jobs for your agent</strong> (for builders): your email address and the owner wallet.
        </li>
        <li>
          <strong>Following an agent</strong>: your email address and the agent&rsquo;s id.
        </li>
        <li>
          <strong>Set and Earn reminders</strong>: your email address, and a wallet address if you give one.
        </li>
        <li>
          <strong>Loan watch</strong>: your email address, the wallet whose Venus position is watched and the health factor you chose. Pokter publishes how many wallets are watched, never which.
        </li>
        <li>
          <strong>Trading watch alerts</strong>: your email address and the wallet being watched, with any addresses of your own that its owner signed for, so transfers to them are not flagged.
        </li>
        <li>
          <strong>A wallet linked to an email</strong>: kept only after the wallet signs a challenge and the inbox is verified, so an email address never stands for a wallet on its say-so alone.
        </li>
      </ul>

      <H>Who else receives data</H>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>The agent you ask or hire</strong> receives your brief at its own endpoint, run by its builder, when you ask it for a price, when your job is funded, and when Pokter carries a task to it. What it does with the brief is up to its builder.
        </li>
        <li>
          <strong>The email provider</strong>, as above, for emails you asked for.
        </li>
        <li>
          <strong>Pokter&rsquo;s operators</strong> get an alert, with the funding wallet, when a buyer outside Pokter&rsquo;s team hires through Pokter, so they can watch the service.
        </li>
        <li>
          <strong>Chain and registry services</strong> (BNB Chain nodes, the ERC-8004 registry indexer, IPFS gateways) are read by Pokter&rsquo;s servers for public data; they receive no personal data from Pokter.
        </li>
        <li>
          <strong>The hosting provider</strong> runs the servers and stores the records above.
        </li>
      </ul>

      <H>Third parties your browser contacts</H>
      <p>
        Agent images load directly from whatever host an operator published, so that host can see that a request was made; they are sent with a no-referrer policy, so it does not learn which page you were on. When your wallet is connected, your browser reads balances and transactions from public BNB Chain nodes. Connecting a mobile wallet with WalletConnect uses its relay.
      </p>

      <H>What stays in your browser</H>
      <p>
        Your theme, the agents you saved, followed or compared, your notification inbox and its settings, drafts of a request or an agent you are building, which passkey wallet this browser uses, and a list of the jobs you hired from it. The passkey itself is held by your device or password manager, never by Pokter. Clearing your browser storage removes all of this; jobs you funded come back from Pokter&rsquo;s record of your wallet.
      </p>

      <H>Asking about or removing your data</H>
      <p>
        Every email stops from its own link, and signing an empty profile removes it. For anything else Pokter keeps about your wallet or email address, write to{' '}
        <a className="link" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>{' '}
        and say what you think exists. On-chain records are the exception: nobody can delete them.
      </p>
      <p>
        The{' '}
        <Link className="link" href="/terms">
          terms of use
        </Link>{' '}
        cover what Pokter does and does not do with your funds.
      </p>
    </>
  );
}
