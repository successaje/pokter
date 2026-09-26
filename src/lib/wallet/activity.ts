'use client';

import type { GrantedSession } from '@/lib/altana/types';
import type { HiredJob } from '@/lib/erc8183/types';

const STORAGE_KEY = 'pokter.sessions.v1';
const EVENT_NAME = 'pokter:sessions-changed';
const JOBS_STORAGE_KEY = 'pokter.jobs.v1';
const JOBS_EVENT_NAME = 'pokter:jobs-changed';
const EMPTY_SESSIONS: GrantedSession[] = [];
let cachedRaw: string | null = null;
let cachedSessions: GrantedSession[] = EMPTY_SESSIONS;
let cachedByWallet = new Map<string, GrantedSession[]>();
const EMPTY_JOBS: StoredJob[] = [];
const EMPTY_HIRED_JOBS: HiredJob[] = [];
let cachedJobsRaw: string | null = null;
let cachedJobs: StoredJob[] = EMPTY_JOBS;
let cachedJobsByWallet = new Map<string, HiredJob[]>();

interface StoredJob {
  walletAddress: string;
  job: HiredJob;
}

function readAll(): GrantedSession[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? '[]';
    if (raw === cachedRaw) return cachedSessions;
    const parsed = JSON.parse(raw);
    cachedRaw = raw;
    cachedSessions = Array.isArray(parsed) ? (parsed as GrantedSession[]) : EMPTY_SESSIONS;
    cachedByWallet = new Map();
    return cachedSessions;
  } catch {
    return EMPTY_SESSIONS;
  }
}

function writeAll(sessions: GrantedSession[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function sessionsForWallet(walletAddress: string): GrantedSession[] {
  const wallet = walletAddress.toLowerCase();
  const all = readAll();
  const cached = cachedByWallet.get(wallet);
  if (cached) return cached;
  const sessions = all.filter(
    (session) => session.walletAddress.toLowerCase() === wallet,
  );
  cachedByWallet.set(wallet, sessions);
  return sessions;
}

export function noSessions(): GrantedSession[] {
  return EMPTY_SESSIONS;
}

function readJobs(): StoredJob[] {
  try {
    const raw = window.localStorage.getItem(JOBS_STORAGE_KEY) ?? '[]';
    if (raw === cachedJobsRaw) return cachedJobs;
    const parsed = JSON.parse(raw);
    cachedJobsRaw = raw;
    cachedJobs = Array.isArray(parsed) ? (parsed as StoredJob[]) : EMPTY_JOBS;
    cachedJobsByWallet = new Map();
    return cachedJobs;
  } catch {
    return EMPTY_JOBS;
  }
}

function writeJobs(jobs: StoredJob[]): void {
  window.localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  window.dispatchEvent(new Event(JOBS_EVENT_NAME));
}

export function jobsForWallet(walletAddress: string): HiredJob[] {
  const wallet = walletAddress.toLowerCase();
  const all = readJobs();
  const cached = cachedJobsByWallet.get(wallet);
  if (cached) return cached;
  const jobs = all
    .filter((entry) => entry.walletAddress.toLowerCase() === wallet)
    .map((entry) => entry.job);
  cachedJobsByWallet.set(wallet, jobs);
  return jobs;
}

export function noJobs(): HiredJob[] {
  return EMPTY_HIRED_JOBS;
}

export function rememberJob(walletAddress: string, job: HiredJob): void {
  const jobs = readJobs().filter(
    (entry) =>
      entry.job.id !== job.id &&
      !(
        entry.walletAddress.toLowerCase() === walletAddress.toLowerCase() &&
        entry.job.chainId === job.chainId &&
        entry.job.jobId === job.jobId
      ),
  );
  writeJobs([{ walletAddress, job }, ...jobs]);
}

export function updateRememberedJob(walletAddress: string, job: HiredJob): void {
  rememberJob(walletAddress, job);
}

export function subscribeToJobs(listener: () => void): () => void {
  window.addEventListener(JOBS_EVENT_NAME, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(JOBS_EVENT_NAME, listener);
    window.removeEventListener('storage', listener);
  };
}

export function rememberSession(session: GrantedSession): void {
  const sessions = readAll().filter((existing) => existing.id !== session.id);
  writeAll([session, ...sessions]);
}

export function rememberRevocation(
  id: string,
  revokedAt: string,
  revokeTxHash: `0x${string}` | null,
): void {
  writeAll(
    readAll().map((session) =>
      session.id === id ? { ...session, revokedAt, revokeTxHash } : session,
    ),
  );
}

export function subscribeToSessions(listener: () => void): () => void {
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener('storage', listener);
  };
}
