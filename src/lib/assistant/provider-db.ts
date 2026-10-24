import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  attachDeliverySubmission,
  attachProposalBid,
  ensureProviderWork,
  readStagedDelivery,
  readStagedProposal,
  releaseStagedDelivery,
  stageDelivery,
  stageProposal,
  stagedDeliveriesFor,
  stagedDeliveryForJob,
  stagedProposalsFor,
  type DeliveryAttachment,
  type ProposalAttachment,
  type StagedDelivery,
  type StagedDeliveryWrite,
  type StagedProposal,
  type StagedProposalWrite,
} from './provider-store';

/**
 * The connection the staged-work statements run against.
 *
 * Its own file rather than a table in `jobs.db`, for the reason briefs have
 * their own: nothing staged here is money. A proposal nobody signed and a
 * deliverable nobody submitted have no place in a table whose every other
 * row is an escrow, and the two have different lifetimes — staged work is
 * cleared by the wallet step that consumes it, where a job is permanent.
 */
const DB_PATH = process.env.PROVIDER_DB_PATH ?? './data/provider.db';

let database: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (database) return database;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  database = new DatabaseSync(DB_PATH);
  database.exec('PRAGMA journal_mode = WAL;');
  ensureProviderWork(database);
  return database;
}

export function recordStagedProposal(write: StagedProposalWrite) {
  return stageProposal(db(), write);
}

export function stagedProposal(key: string): StagedProposal | null {
  return readStagedProposal(db(), key);
}

export function placeStagedProposal(key: string, bidId: string): ProposalAttachment {
  return attachProposalBid(db(), key, bidId);
}

export function stagedProposalsByOwner(owner: string, limit?: number): StagedProposal[] {
  return stagedProposalsFor(db(), owner, limit);
}

export function recordStagedDelivery(write: StagedDeliveryWrite) {
  return stageDelivery(db(), write);
}

export function stagedDelivery(key: string): StagedDelivery | null {
  return readStagedDelivery(db(), key);
}

export function releaseUnsubmittedDelivery(key: string): boolean {
  return releaseStagedDelivery(db(), key);
}

export function stagedDeliveryByJob(chainId: number, jobId: string): StagedDelivery | null {
  return stagedDeliveryForJob(db(), chainId, jobId);
}

export function recordDeliverySubmission(key: string, transactionHash: string): DeliveryAttachment {
  return attachDeliverySubmission(db(), key, transactionHash);
}

export function stagedDeliveriesByOwner(owner: string, limit?: number): StagedDelivery[] {
  return stagedDeliveriesFor(db(), owner, limit);
}
