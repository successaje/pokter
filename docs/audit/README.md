# Audit

Pokter moves user funds. This directory is the record of what has been examined
before it does so on mainnet, what was found, and what remains open.

| Report | Scope | Status |
| --- | --- | --- |
| [mainnet-readiness.md](mainnet-readiness.md) | Migration from BSC testnet (97) to mainnet (56) | **In progress** |
| [protocol-audit.md](protocol-audit.md) | Identity, authority, escrow, delivery, dispute and recovery | **Open blockers** |

## How findings are tracked

Each finding carries a stable id (`POK-001`), a severity, the evidence it was
raised on, and a status. Ids are never reused or renumbered, so a finding can
be referenced in a commit message or an issue and still mean the same thing in
six months.

| Severity | Meaning |
| --- | --- |
| **Critical** | A user can lose funds, or is actively misled about what they are spending. |
| **High** | A user can be harmed under plausible conditions, or a safety control does not hold. |
| **Medium** | Degraded safety or correctness that does not directly cost a user money. |
| **Low** | Hygiene. Worth fixing, not worth blocking on. |
| **Info** | Verified safe. Recorded so the check is not repeated from scratch. |

| Status | Meaning |
| --- | --- |
| **Open** | Confirmed, not yet addressed. |
| **Fixed** | Addressed, with the commit that did it. |
| **Accepted** | Understood and deliberately not changed, with the reason. |
| **Verified** | Checked and found safe. |

## Rules

**No finding is closed without evidence.** A fix is Fixed when something has
been run against it, not when the code looks right.

**Nothing ships to mainnet with an open Critical or High.** That is the point
of the register.

**Coverage is stated, not implied.** Each report names what it did not examine.
An audit that lists only what it looked at reads as complete when it is not.
