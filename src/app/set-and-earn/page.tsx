import type { Metadata } from "next";
import Link from "next/link";

import { CampaignPassport } from "@/components/campaign/CampaignPassport";

export const metadata: Metadata = {
  title: "Set and Earn checklist",
  description:
    "Register, hire and build qualifying AI agents for BNB Chain Set and Earn through Pokter.",
  alternates: { canonical: "/set-and-earn" },
};
const CAMPAIGN =
  "https://www.bnbchain.org/en/hackathons/smart-money-era-set-and-earn";
const steps = [
  {
    n: "01",
    title: "Register the wallet first",
    body: "Complete BNB Chain’s registration before any qualifying task. Use the same wallet throughout the campaign.",
    action: (
      <a
        href={CAMPAIGN}
        target="_blank"
        rel="noreferrer"
        className="text-[color:var(--brand-strong)] hover:underline"
      >
        Open official registration ↗
      </a>
    ),
  },
  {
    n: "02",
    title: "Hire three different agents",
    body: "Your three hires must span at least two shortlisted marketplaces. Mainnet and testnet hires count, but each must engage an agent and record a hire event—not only approve a token.",
    action: (
      <Link
        href="/discover"
        className="text-[color:var(--brand-strong)] hover:underline"
      >
        Find an agent on Pokter →
      </Link>
    ),
  },
  {
    n: "03",
    title: "Build and list one qualifying agent",
    body: "Choose yield, grid trading, rebalancing or health-factor monitoring. Register it under ERC-8004 on chain 56 or 97, keep its agent card reachable, and list it after the official Phase 2 announcement.",
    action: (
      <Link
        href="/build"
        className="text-[color:var(--brand-strong)] hover:underline"
      >
        Launch an agent →
      </Link>
    ),
  },
  {
    n: "04",
    title: "Prove people use it",
    body: "Receive at least three completed hires from three distinct wallets you neither own nor fund. Complete at least five category-consistent onchain actions across three separate days.",
    action: (
      <Link
        href="/my-agents"
        className="text-[color:var(--brand-strong)] hover:underline"
      >
        Track activity →
      </Link>
    ),
  },
];

export default function SetAndEarnPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-20 pt-8 sm:pt-12">
      <header className="grid gap-6 border-b border-[color:var(--border)] pb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="max-w-3xl">
          <p className="mono text-[10px] uppercase tracking-[0.17em] text-[color:var(--brand-strong)]">
            BNB Chain · Set and Earn
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-serif)] text-4xl leading-tight tracking-tight sm:text-5xl">
            Register first. Then hire, build and prove real use.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[color:var(--text-secondary)]">
            The campaign runs from 1 October through 5 November 2026 at 12:00
            UTC. This page translates the official requirements into actions you
            can take through Pokter.
          </p>
        </div>
        <a
          href={CAMPAIGN}
          target="_blank"
          rel="noreferrer"
          className="action-primary inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] px-5 text-[12px] font-semibold"
        >
          Register on BNB Chain ↗
        </a>
      </header>
      <CampaignPassport />
      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Campaign summary"
      >
        {[
          ["3", "different agents hired"],
          ["2+", "shortlisted marketplaces"],
          ["3", "independent completed hires"],
          ["5 / 3", "onchain actions / days"],
        ].map(([value, label]) => (
          <div
            key={label}
            className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5"
          >
            <p className="text-3xl font-semibold">{value}</p>
            <p className="mt-1 text-[10px] leading-4 text-[color:var(--text-muted)]">
              {label}
            </p>
          </div>
        ))}
      </section>
      <section>
        <div className="mb-5">
          <p className="mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">
            Qualification path
          </p>
          <h2 className="mt-2 text-xl font-semibold">Do these in order</h2>
        </div>
        <ol className="grid gap-4 lg:grid-cols-2">
          {steps.map((step) => (
            <li
              key={step.n}
              className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-6"
            >
              <div className="flex items-start gap-4">
                <span className="mono flex size-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-highlight-soft)] text-[10px] font-semibold text-[color:var(--brand-strong)]">
                  {step.n}
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{step.title}</h3>
                  <p className="mt-2 text-[11px] leading-5 text-[color:var(--text-secondary)]">
                    {step.body}
                  </p>
                  <p className="mt-4 text-[11px] font-semibold">
                    {step.action}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--caution)]/30 bg-[color:var(--caution-dim)] p-5 sm:p-6">
          <p className="text-[12px] font-semibold text-[color:var(--caution)]">
            Do not use an old or cosmetic agent
          </p>
          <p className="mt-2 text-[11px] leading-5 text-[color:var(--text-secondary)]">
            Only agents listed after the official Phase 2 announcement can
            qualify. Cosmetic copies, duplicate registrations and agents that
            never execute do not qualify. Keep the repository public with the
            registry ID and chain visible.
          </p>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--info)]/25 bg-[color:var(--info-dim)] p-5 sm:p-6">
          <p className="text-[12px] font-semibold text-[color:var(--info)]">
            Pokter does not decide campaign eligibility
          </p>
          <p className="mt-2 text-[11px] leading-5 text-[color:var(--text-secondary)]">
            BNB Chain verifies the final activity after the campaign closes.
            Shortlisted marketplace team members are not eligible for campaign
            merchandise. Read the official rules before acting.
          </p>
        </div>
      </section>
    </main>
  );
}
