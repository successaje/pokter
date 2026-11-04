import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Service, ServiceContent } from './model';

const DB_PATH = process.env.SERVICE_DB_PATH ?? './data/services.db';

export class ServiceStore {
  private db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY, builder TEXT NOT NULL, chain_id INTEGER NOT NULL, token_id TEXT NOT NULL,
        category TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL,
        content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS service_revisions (
        service_id TEXT NOT NULL, revision INTEGER NOT NULL, content TEXT NOT NULL, signed_at TEXT NOT NULL,
        PRIMARY KEY (service_id, revision)
      );
      CREATE INDEX IF NOT EXISTS services_builder ON services (builder, updated_at DESC);
      CREATE INDEX IF NOT EXISTS services_catalogue ON services (status, updated_at DESC);
    `);
  }
  private row(row: Record<string, unknown>): Service {
    return { ...(JSON.parse(String(row.content)) as ServiceContent), id: String(row.id), builder: String(row.builder), revision: Number(row.revision), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }
  get(id: string): Service | null {
    const row = this.db.prepare('SELECT * FROM services WHERE id=?').get(id) as Record<string, unknown> | undefined;
    return row ? this.row(row) : null;
  }
  revision(id: string, revision: number): ServiceContent | null {
    const row = this.db.prepare('SELECT content FROM service_revisions WHERE service_id=? AND revision=?').get(id, revision) as { content: string } | undefined;
    return row ? JSON.parse(row.content) as ServiceContent : null;
  }
  byBuilder(builder: string): Service[] {
    return (this.db.prepare('SELECT * FROM services WHERE builder=? ORDER BY updated_at DESC').all(builder.toLowerCase()) as Record<string, unknown>[]).map((row) => this.row(row));
  }
  list(input: { q?: string; category?: string; chainId?: number; sort?: 'newest' | 'oldest' | 'title'; limit?: number; offset?: number } = {}): { items: Service[]; total: number } {
    const where = ['status = ?'];
    const values: Array<string | number> = ['active'];
    if (input.q) { where.push("(json_extract(content, '$.title') LIKE ? OR json_extract(content, '$.description') LIKE ? OR json_extract(content, '$.buyerProvides') LIKE ? OR json_extract(content, '$.delivers') LIKE ?)"); values.push(`%${input.q}%`, `%${input.q}%`, `%${input.q}%`, `%${input.q}%`); }
    if (input.category) { where.push('category = ?'); values.push(input.category); }
    if (input.chainId) { where.push('chain_id = ?'); values.push(input.chainId); }
    const sql = ` FROM services WHERE ${where.join(' AND ')}`;
    const total = (this.db.prepare(`SELECT COUNT(*) AS n${sql}`).get(...values) as { n: number }).n;
    const order = input.sort === 'oldest' ? 'created_at ASC' : input.sort === 'title' ? "json_extract(content, '$.title') COLLATE NOCASE ASC" : 'updated_at DESC';
    const rows = this.db.prepare(`SELECT *${sql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...values, input.limit ?? 24, input.offset ?? 0) as Record<string, unknown>[];
    return { items: rows.map((row) => this.row(row)), total };
  }
  save(id: string | null, builder: string, content: ServiceContent): Service {
    const now = new Date().toISOString();
    const current = id ? this.get(id) : null;
    if (id && (!current || current.builder.toLowerCase() !== builder.toLowerCase())) throw new Error('Service not found for this builder.');
    if (current && (current.chainId !== content.chainId || current.tokenId !== content.tokenId)) throw new Error('A published service cannot be moved to another agent.');
    if (current?.status === 'archived') throw new Error('Archived services cannot be changed.');
    const serviceId = id ?? crypto.randomUUID();
    const revision = (current?.revision ?? 0) + 1;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`INSERT INTO services (id,builder,chain_id,token_id,category,status,revision,content,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category=excluded.category,status=excluded.status,revision=excluded.revision,content=excluded.content,updated_at=excluded.updated_at`)
        .run(serviceId,builder.toLowerCase(),content.chainId,content.tokenId,content.category,content.status,revision,JSON.stringify(content),current?.createdAt ?? now,now);
      this.db.prepare('INSERT INTO service_revisions (service_id,revision,content,signed_at) VALUES (?,?,?,?)')
        .run(serviceId,revision,JSON.stringify(content),now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.get(serviceId)!;
  }
}

let singleton: ServiceStore | null = null;
export function getServiceStore(): ServiceStore { singleton ??= new ServiceStore(DB_PATH); return singleton; }
