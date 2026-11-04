import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BotButton } from './marketplace-bot';

const DB_PATH = process.env.SCOUT_DB_PATH ?? './data/scout.db';
const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_TURNS = 6;

export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type ChatState = { turns: ChatTurn[]; evidence: string; buttons: BotButton[][]; aiEnabled: boolean; lastAgentCategory?: string | null };

let database: DatabaseSync | null = null;
function db(): DatabaseSync {
  if (database) return database;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  database = new DatabaseSync(DB_PATH);
  database.exec('PRAGMA journal_mode = WAL');
  database.exec(`CREATE TABLE IF NOT EXISTS scout_chats (
    chat_id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  return database;
}

export function readChat(chatId: number, now = Date.now()): ChatState {
  const handle = db();
  handle.prepare('DELETE FROM scout_chats WHERE updated_at < ?').run(now - RETENTION_MS);
  const row = handle.prepare('SELECT state_json, updated_at FROM scout_chats WHERE chat_id = ?').get(String(chatId)) as { state_json: string; updated_at: number } | undefined;
  if (!row || row.updated_at < now - RETENTION_MS) return { turns: [], evidence: '', buttons: [], aiEnabled: false };
  try {
    const state = JSON.parse(row.state_json) as ChatState;
    if (!Array.isArray(state.turns) || typeof state.evidence !== 'string' || !Array.isArray(state.buttons)) throw new Error('Invalid chat state');
    return { turns: state.turns.slice(-MAX_TURNS), evidence: state.evidence.slice(0, 3500), buttons: state.buttons.slice(0, 3), aiEnabled: state.aiEnabled === true, lastAgentCategory: typeof state.lastAgentCategory === 'string' ? state.lastAgentCategory : null };
  } catch {
    return { turns: [], evidence: '', buttons: [], aiEnabled: false };
  }
}

export function saveChat(chatId: number, state: ChatState, now = Date.now()): void {
  const bounded: ChatState = {
    turns: state.turns.slice(-MAX_TURNS).map((turn) => ({ role: turn.role, content: turn.content.slice(0, 1200) })),
    evidence: state.evidence.slice(0, 3500),
    buttons: state.buttons.slice(0, 3),
    aiEnabled: state.aiEnabled === true,
    lastAgentCategory: state.lastAgentCategory ?? null,
  };
  const handle = db();
  handle.prepare(`INSERT INTO scout_chats (chat_id, state_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`)
    .run(String(chatId), JSON.stringify(bounded), now);
  handle.prepare('DELETE FROM scout_chats WHERE updated_at < ?').run(now - RETENTION_MS);
}

export function forgetChat(chatId: number): void {
  db().prepare('DELETE FROM scout_chats WHERE chat_id = ?').run(String(chatId));
}
