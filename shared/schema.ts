import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Call pools at Michigan ENT & Allergy Specialists.
 *  Practice rows (display first):
 *  - pa:        PA on call covering Lakeshore + GR
 *  - lakeshore: MIENT Lakeshore physician practice only
 *  - mientgr:   MIENT Grand Rapids (established pts, M-F)
 *  - grent:     GRENT (established pts, M-F)
 *  Hospital rows:
 *  - zch:       Zeeland Community Hospital
 *  - noch:      Trinity Health Grand Haven (historically NOCH)
 *  - thgr:      Trinity Health St. Mary's GR ER
 *  - corewell:  Corewell Butterworth/Blodgett/HDVCH (Helen DeVos)
 *  - uofm_west: UofM Health West Facial Trauma
 *  Legacy (hidden from UI):
 *  - weekend:   Legacy weekend pool (hidden, kept to avoid DB type errors)
 */
export const POOLS = [
  "pa",
  "lakeshore",
  "mientgr",
  "grent",
  "zch",
  "noch",
  "thgr",
  "corewell",
  "uofm_west",
  "weekend",
] as const;
export type Pool = (typeof POOLS)[number];

export const ROLES = ["admin", "physician", "pa", "viewer"] as const;
export type Role = (typeof ROLES)[number];

// ---------- Users / Providers ----------
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("viewer"), // admin | physician | pa | viewer
  providerId: integer("provider_id"), // link to providers.id if this user IS a provider
  feedToken: text("feed_token").notNull().unique(), // random token for their personal iCal feed
});

export const providers = sqliteTable("providers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lastName: text("last_name").notNull(),
  firstName: text("first_name"),
  credentials: text("credentials").notNull().default("MD"), // MD, DO, PA-C
  kind: text("kind").notNull().default("physician"), // physician | pa
  primaryPool: text("primary_pool").notNull(), // one of POOLS
  // JSON array of additional pools they can cover (e.g. weekend for all physicians, peds/corewell for Shah-Becker)
  eligiblePools: text("eligible_pools").notNull().default("[]"),
  notes: text("notes"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  color: text("color"), // optional custom color override
});

// ---------- Shifts ----------
// Each shift assigns ONE provider to ONE pool for a time window.
// Weekday shifts: 08:00 on day N → 08:00 on day N+1 (Mon 8a → Tue 8a, etc.)
// Thursday weekday shift ends Friday 17:00 (handing off to weekend)
// Weekend shift: Friday 17:00 → Monday 08:00
export const shifts = sqliteTable("shifts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pool: text("pool").notNull(), // one of POOLS
  providerId: integer("provider_id").notNull(),
  startAt: text("start_at").notNull(), // ISO string (local time encoded)
  endAt: text("end_at").notNull(),
  location: text("location"), // e.g. "Trinity Health Grand Haven", "Trinity GR ER", "Corewell Butterworth"
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ---------- Swap Requests ----------
export const swapRequests = sqliteTable("swap_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shiftId: integer("shift_id").notNull(),
  requesterId: integer("requester_id").notNull(), // provider requesting
  targetProviderId: integer("target_provider_id").notNull(), // provider asked to cover
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending | approved | declined | cancelled | admin_override
  decidedById: integer("decided_by_id"),
  decidedAt: text("decided_at"),
  createdAt: text("created_at").notNull(),
});

// ---------- Flags ----------
// Data-quality flags raised during import or ongoing validation
// (e.g. "No THGH coverage on Apr 23", unknown initials, unmatched providers).
export const flags = sqliteTable("flags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(), // 'missing_coverage' | 'unknown_initials' | 'import_warning' | 'conflict'
  severity: text("severity").notNull().default("warn"), // 'info' | 'warn' | 'error'
  date: text("date"), // YYYY-MM-DD when the flag relates to a specific day
  pool: text("pool"),
  location: text("location"),
  message: text("message").notNull(),
  source: text("source"), // 'import' | 'manual' | 'validator'
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
  resolvedById: integer("resolved_by_id"),
});

// ---------- Audit Log ----------
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: text("at").notNull(),
  actorId: integer("actor_id"),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(), // shift.create | shift.edit | shift.delete | swap.request | swap.approve | swap.decline | admin.override
  details: text("details").notNull(), // JSON-stringified summary
});

// ---------- Zod schemas ----------
export const insertUserSchema = createInsertSchema(users).omit({ id: true, feedToken: true });
export const insertProviderSchema = createInsertSchema(providers).omit({ id: true });
export const insertShiftSchema = createInsertSchema(shifts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFlagSchema = createInsertSchema(flags).omit({ id: true, createdAt: true, resolved: true, resolvedAt: true, resolvedById: true });
export const insertSwapRequestSchema = createInsertSchema(swapRequests).omit({
  id: true,
  status: true,
  decidedById: true,
  decidedAt: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Provider = typeof providers.$inferSelect;
export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Shift = typeof shifts.$inferSelect;
export type InsertSwapRequest = z.infer<typeof insertSwapRequestSchema>;
export type SwapRequest = typeof swapRequests.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type InsertFlag = z.infer<typeof insertFlagSchema>;
export type Flag = typeof flags.$inferSelect;

// Login schema
export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Pool display metadata
export const POOL_META: Record<Pool, { label: string; short: string; description: string; hue: number }> = {
  pa: {
    label: "PA",
    short: "PA",
    description: "Single PA on call covering MIENT Lakeshore and GR patients.",
    hue: 330, // pink/magenta
  },
  lakeshore: {
    label: "MIENT-Lakeshore",
    short: "LAKE",
    description: "MIENT Lakeshore physician practice call (established patients).",
    hue: 200, // blue
  },
  mientgr: {
    label: "MIENT-GR",
    short: "MIENT-GR",
    description: "MIENT Grand Rapids weekday call (Mon 8a – Fri 5p, established patients).",
    hue: 175, // teal
  },
  grent: {
    label: "GRENT",
    short: "GRENT",
    description: "GRENT weekday call (Mon 8a – Fri 5p, established patients).",
    hue: 22, // orange
  },
  zch: {
    label: "Zeeland Community Hospital",
    short: "ZCH",
    description: "Zeeland Community Hospital ENT coverage.",
    hue: 190, // cyan/light-blue
  },
  noch: {
    label: "Trinity Health Grand Haven (NOCH)",
    short: "NOCH",
    description: "Trinity Health Grand Haven (historically NOCH) ENT coverage.",
    hue: 350, // maroon
  },
  thgr: {
    label: "Trinity Health Grand Rapids (THGR)",
    short: "THGR",
    description: "Trinity Health Grand Rapids / St. Mary's ER ENT coverage.",
    hue: 0, // fire truck red
  },
  corewell: {
    label: "Corewell (Butterworth/Blodgett/HDVCH)",
    short: "CORE",
    description: "Corewell Butterworth/Blodgett/Helen DeVos Children's Hospital — adult + pediatric ENT call.",
    hue: 42, // gold
  },
  uofm_west: {
    label: "UofM Health West Facial Trauma",
    short: "UofM West",
    description: "Facial trauma call coverage at University of Michigan Health West.",
    hue: 48, // maize (U of M)
  },
  weekend: {
    label: "GR Call Pool (Legacy)",
    short: "GR Call",
    description: "Legacy GR call pool — hidden from UI. Data retained for historical reference.",
    hue: 265, // purple
  },
};
