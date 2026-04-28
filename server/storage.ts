import {
  users,
  providers,
  shifts,
  swapRequests,
  auditLog,
  flags,
} from "@shared/schema";
import type {
  User,
  InsertUser,
  Provider,
  InsertProvider,
  Shift,
  InsertShift,
  SwapRequest,
  InsertSwapRequest,
  AuditEntry,
  Flag,
  InsertFlag,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import crypto from "node:crypto";

const DB_PATH = process.env.DB_PATH || "data.db";
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

// Create tables if they don't exist (simple migration for prototype)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    provider_id INTEGER,
    feed_token TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    last_name TEXT NOT NULL,
    first_name TEXT,
    credentials TEXT NOT NULL DEFAULT 'MD',
    kind TEXT NOT NULL DEFAULT 'physician',
    primary_pool TEXT NOT NULL,
    eligible_pools TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    color TEXT
  );
  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pool TEXT NOT NULL,
    provider_id INTEGER NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    location TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS swap_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL,
    requester_id INTEGER NOT NULL,
    target_provider_id INTEGER NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by_id INTEGER,
    decided_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    actor_id INTEGER,
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warn',
    date TEXT,
    pool TEXT,
    location TEXT,
    message TEXT NOT NULL,
    source TEXT,
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by_id INTEGER
  );
`);

export const db = drizzle(sqlite);

function now() {
  return new Date().toISOString();
}

function token() {
  return crypto.randomBytes(16).toString("hex");
}

export interface IStorage {
  // users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByFeedToken(token: string): Promise<User | undefined>;
  listUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  // providers
  listProviders(): Promise<Provider[]>;
  getProvider(id: number): Promise<Provider | undefined>;
  createProvider(p: InsertProvider): Promise<Provider>;
  updateProvider(id: number, p: Partial<InsertProvider>): Promise<Provider | undefined>;
  // shifts
  listShifts(fromIso?: string, toIso?: string): Promise<Shift[]>;
  getShift(id: number): Promise<Shift | undefined>;
  createShift(s: InsertShift): Promise<Shift>;
  updateShift(id: number, s: Partial<InsertShift>): Promise<Shift | undefined>;
  deleteShift(id: number): Promise<boolean>;
  // swaps
  listSwapRequests(): Promise<SwapRequest[]>;
  createSwapRequest(r: InsertSwapRequest): Promise<SwapRequest>;
  updateSwapStatus(id: number, status: string, decidedById: number): Promise<SwapRequest | undefined>;
  // audit
  appendAudit(entry: Omit<AuditEntry, "id">): Promise<AuditEntry>;
  listAudit(limit?: number): Promise<AuditEntry[]>;
  // flags
  listFlags(opts?: { resolved?: boolean }): Promise<Flag[]>;
  createFlag(f: InsertFlag): Promise<Flag>;
  resolveFlag(id: number, resolvedById: number | null): Promise<Flag | undefined>;
  clearFlagsBySource(source: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number) {
    return db.select().from(users).where(eq(users.id, id)).get();
  }
  async getUserByUsername(username: string) {
    return db.select().from(users).where(eq(users.username, username)).get();
  }
  async getUserByFeedToken(t: string) {
    return db.select().from(users).where(eq(users.feedToken, t)).get();
  }
  async listUsers() {
    return db.select().from(users).all();
  }
  async createUser(u: InsertUser) {
    return db.insert(users).values({ ...u, feedToken: token() }).returning().get();
  }

  async listProviders() {
    return db.select().from(providers).all();
  }
  async getProvider(id: number) {
    return db.select().from(providers).where(eq(providers.id, id)).get();
  }
  async createProvider(p: InsertProvider) {
    return db.insert(providers).values(p).returning().get();
  }
  async updateProvider(id: number, p: Partial<InsertProvider>) {
    return db.update(providers).set(p).where(eq(providers.id, id)).returning().get();
  }

  async listShifts(fromIso?: string, toIso?: string) {
    if (fromIso && toIso) {
      return db
        .select()
        .from(shifts)
        .where(and(gte(shifts.startAt, fromIso), lte(shifts.startAt, toIso)))
        .all();
    }
    return db.select().from(shifts).all();
  }
  async getShift(id: number) {
    return db.select().from(shifts).where(eq(shifts.id, id)).get();
  }
  async createShift(s: InsertShift) {
    const t = now();
    return db.insert(shifts).values({ ...s, createdAt: t, updatedAt: t }).returning().get();
  }
  async updateShift(id: number, s: Partial<InsertShift>) {
    return db
      .update(shifts)
      .set({ ...s, updatedAt: now() })
      .where(eq(shifts.id, id))
      .returning()
      .get();
  }
  async deleteShift(id: number) {
    const res = db.delete(shifts).where(eq(shifts.id, id)).run();
    return res.changes > 0;
  }

  async listSwapRequests() {
    return db.select().from(swapRequests).orderBy(desc(swapRequests.createdAt)).all();
  }
  async createSwapRequest(r: InsertSwapRequest) {
    return db
      .insert(swapRequests)
      .values({ ...r, status: "pending", createdAt: now() })
      .returning()
      .get();
  }
  async updateSwapStatus(id: number, status: string, decidedById: number) {
    return db
      .update(swapRequests)
      .set({ status, decidedById, decidedAt: now() })
      .where(eq(swapRequests.id, id))
      .returning()
      .get();
  }

  async appendAudit(entry: Omit<AuditEntry, "id">) {
    return db.insert(auditLog).values(entry).returning().get();
  }
  async listAudit(limit = 200) {
    return db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(limit).all();
  }

  async listFlags(opts?: { resolved?: boolean }) {
    if (opts?.resolved !== undefined) {
      return db.select().from(flags).where(eq(flags.resolved, opts.resolved)).orderBy(desc(flags.createdAt)).all();
    }
    return db.select().from(flags).orderBy(desc(flags.createdAt)).all();
  }
  async createFlag(f: InsertFlag) {
    return db.insert(flags).values({ ...f, createdAt: now() }).returning().get();
  }
  async resolveFlag(id: number, resolvedById: number | null) {
    return db
      .update(flags)
      .set({ resolved: true, resolvedAt: now(), resolvedById: resolvedById ?? undefined })
      .where(eq(flags.id, id))
      .returning()
      .get();
  }
  async clearFlagsBySource(source: string) {
    const res = db.delete(flags).where(eq(flags.source, source)).run();
    return res.changes;
  }
}

export const storage = new DatabaseStorage();
