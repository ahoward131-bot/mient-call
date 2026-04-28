import type { Express, Request, Response, NextFunction } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage } from "./storage";
import {
  insertProviderSchema,
  insertShiftSchema,
  insertSwapRequestSchema,
  loginSchema,
  type User,
} from "@shared/schema";
import crypto from "node:crypto";
import { buildICal } from "./ical";
import { seedRoster } from "./seed";

// Simple in-memory session store for prototype (tokens -> userId)
// NOT for production — replace with signed cookies / proper auth later.
const sessions = new Map<string, number>();

function makeSessionToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getSessionUserId(req: Request): number | undefined {
  const auth = req.header("authorization");
  if (!auth?.startsWith("Bearer ")) return undefined;
  return sessions.get(auth.slice(7));
}

function csvEscape(v: string | number): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const uid = getSessionUserId(req);
  if (!uid) return res.status(401).json({ error: "unauthorized" });
  const user = await storage.getUser(uid);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  (req as any).user = user;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as User | undefined;
  if (!user || user.role !== "admin") return res.status(403).json({ error: "forbidden" });
  next();
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Seed roster + default admin on first boot
  await seedRoster(storage);

  // --------- Health check (used by Render) ----------
  app.get("/api/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // --------- Auth ----------
  app.post("/api/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid" });
    const user = await storage.getUserByUsername(parsed.data.username);
    if (!user || user.password !== parsed.data.password) {
      return res.status(401).json({ error: "invalid_credentials" });
    }
    if (user.active === false) {
      return res.status(403).json({ error: "account_disabled" });
    }
    const t = makeSessionToken();
    sessions.set(t, user.id);
    const { password: _pw, ...safeUser } = user;
    res.json({ token: t, user: safeUser });
  });

  app.post("/api/auth/logout", (req, res) => {
    const auth = req.header("authorization");
    if (auth?.startsWith("Bearer ")) sessions.delete(auth.slice(7));
    res.json({ ok: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    const uid = getSessionUserId(req);
    if (!uid) return res.json({ user: null });
    const user = await storage.getUser(uid);
    if (!user) return res.json({ user: null });
    const { password: _pw, ...safeUser } = user;
    res.json({ user: safeUser });
  });

  // --------- Self-service: change own password ----------
  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    const me = (req as any).user as User;
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({ error: "new_password_too_short" });
    }
    // If user is being forced to change pw, allow without verifying current (since they may have just been issued a temp pw they're typing now anyway).
    // Otherwise require correct current password.
    if (!me.mustChangePassword) {
      if (typeof currentPassword !== "string" || currentPassword !== me.password) {
        return res.status(401).json({ error: "wrong_current_password" });
      }
    }
    await storage.setUserPassword(me.id, newPassword, false);
    await storage.appendAudit({
      at: new Date().toISOString(),
      actorId: me.id,
      actorName: me.name,
      action: "user.change_password",
      details: JSON.stringify({ self: true }),
    });
    res.json({ ok: true });
  });

  // --------- Admin: User management ----------
  app.get("/api/users", requireAuth, requireAdmin, async (_req, res) => {
    const list = await storage.listUsers();
    res.json(list.map(({ password: _pw, ...u }) => u));
  });

  app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
    const me = (req as any).user as User;
    const { username, name, role, providerId, password } = req.body ?? {};
    if (typeof username !== "string" || username.trim().length < 1)
      return res.status(400).json({ error: "username_required" });
    if (typeof name !== "string" || name.trim().length < 1)
      return res.status(400).json({ error: "name_required" });
    if (typeof password !== "string" || password.length < 4)
      return res.status(400).json({ error: "password_too_short" });
    const validRoles = ["admin", "physician", "pa", "viewer"];
    const finalRole = validRoles.includes(role) ? role : "viewer";
    const existing = await storage.getUserByUsername(username.trim());
    if (existing) return res.status(409).json({ error: "username_taken" });
    try {
      const created = await storage.createUser({
        username: username.trim(),
        password,
        name: name.trim(),
        role: finalRole,
        providerId: providerId ?? null,
        active: true,
        mustChangePassword: true,
      } as any);
      await storage.appendAudit({
        at: new Date().toISOString(),
        actorId: me.id,
        actorName: me.name,
        action: "user.create",
        details: JSON.stringify({ id: created.id, username: created.username, role: finalRole }),
      });
      const { password: _pw, ...safe } = created;
      res.status(201).json(safe);
    } catch (e: any) {
      res.status(500).json({ error: "create_failed", detail: String(e?.message ?? e) });
    }
  });

  app.patch("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    const me = (req as any).user as User;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });
    const target = await storage.getUser(id);
    if (!target) return res.status(404).json({ error: "not_found" });
    const { name, role, providerId, active } = req.body ?? {};
    const patch: any = {};
    if (typeof name === "string" && name.trim().length > 0) patch.name = name.trim();
    if (typeof role === "string" && ["admin", "physician", "pa", "viewer"].includes(role)) patch.role = role;
    if (providerId === null || typeof providerId === "number") patch.providerId = providerId;
    if (typeof active === "boolean") {
      // Prevent the last active admin from being disabled / demoted
      if ((active === false || (patch.role && patch.role !== "admin" && target.role === "admin"))) {
        const allUsers = await storage.listUsers();
        const otherActiveAdmins = allUsers.filter(
          (u) => u.id !== id && u.role === "admin" && u.active !== false,
        );
        if (otherActiveAdmins.length === 0 && target.role === "admin") {
          return res.status(400).json({ error: "cannot_remove_last_admin" });
        }
      }
      patch.active = active;
    }
    const updated = await storage.updateUser(id, patch);
    await storage.appendAudit({
      at: new Date().toISOString(),
      actorId: me.id,
      actorName: me.name,
      action: "user.update",
      details: JSON.stringify({ id, patch }),
    });
    if (!updated) return res.status(404).json({ error: "not_found" });
    const { password: _pw, ...safe } = updated;
    res.json(safe);
  });

  app.post("/api/users/:id/reset-password", requireAuth, requireAdmin, async (req, res) => {
    const me = (req as any).user as User;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });
    const { password } = req.body ?? {};
    if (typeof password !== "string" || password.length < 4)
      return res.status(400).json({ error: "password_too_short" });
    const updated = await storage.setUserPassword(id, password, true);
    if (!updated) return res.status(404).json({ error: "not_found" });
    // Invalidate all existing sessions for this user, so they get kicked out and forced to log in again
    for (const [tok, uid] of sessions.entries()) {
      if (uid === id) sessions.delete(tok);
    }
    await storage.appendAudit({
      at: new Date().toISOString(),
      actorId: me.id,
      actorName: me.name,
      action: "user.reset_password",
      details: JSON.stringify({ id }),
    });
    res.json({ ok: true });
  });

  app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    const me = (req as any).user as User;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });
    if (id === me.id) return res.status(400).json({ error: "cannot_delete_self" });
    const target = await storage.getUser(id);
    if (!target) return res.status(404).json({ error: "not_found" });
    if (target.role === "admin") {
      const all = await storage.listUsers();
      const otherActiveAdmins = all.filter(
        (u) => u.id !== id && u.role === "admin" && u.active !== false,
      );
      if (otherActiveAdmins.length === 0) {
        return res.status(400).json({ error: "cannot_remove_last_admin" });
      }
    }
    const ok = await storage.deleteUser(id);
    for (const [tok, uid] of sessions.entries()) {
      if (uid === id) sessions.delete(tok);
    }
    await storage.appendAudit({
      at: new Date().toISOString(),
      actorId: me.id,
      actorName: me.name,
      action: "user.delete",
      details: JSON.stringify({ id, username: target.username }),
    });
    res.json({ ok });
  });

  // --------- Public read-only endpoints (for the practice-wide view) ----------
  app.get("/api/providers", async (_req, res) => {
    const list = await storage.listProviders();
    res.json(list);
  });

  app.get("/api/shifts", async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const list = await storage.listShifts(from, to);
    res.json(list);
  });

  // --------- Admin-only provider management ----------
  app.post("/api/providers", requireAuth, requireAdmin, async (req, res) => {
    const parsed = insertProviderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid", details: parsed.error.flatten() });
    const p = await storage.createProvider(parsed.data);
    await storage.appendAudit({
      at: new Date().toISOString(),
      actorId: (req as any).user.id,
      actorName: (req as any).user.name,
      action: "provider.create",
      details: JSON.stringify({ id: p.id, name: p.lastName }),
    });
    res.json(p);
  });

  app.patch("/api/providers/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const parsed = insertProviderSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid" });
    const p = await storage.updateProvider(id, parsed.data);
    if (!p) return res.status(404).json({ error: "not_found" });
    res.json(p);
  });

  // --------- Shifts (admin creates/edits, providers/viewers read) ----------
  app.post("/api/shifts", requireAuth, requireAdmin, async (req, res) => {
    const parsed = insertShiftSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid", details: parsed.error.flatten() });
    const s = await storage.createShift(parsed.data);
    await storage.appendAudit({
      at: new Date().toISOString(),
      actorId: (req as any).user.id,
      actorName: (req as any).user.name,
      action: "shift.create",
      details: JSON.stringify({ id: s.id, pool: s.pool, providerId: s.providerId, startAt: s.startAt }),
    });
    res.json(s);
  });

  app.patch("/api/shifts/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const parsed = insertShiftSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid" });
    const before = await storage.getShift(id);
    const s = await storage.updateShift(id, parsed.data);
    if (!s) return res.status(404).json({ error: "not_found" });
    await storage.appendAudit({
      at: new Date().toISOString(),
      actorId: (req as any).user.id,
      actorName: (req as any).user.name,
      action: "shift.edit",
      details: JSON.stringify({ id, before, after: s }),
    });
    res.json(s);
  });

  app.delete("/api/shifts/:id", requireAuth, requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const before = await storage.getShift(id);
    const ok = await storage.deleteShift(id);
    if (!ok) return res.status(404).json({ error: "not_found" });
    await storage.appendAudit({
      at: new Date().toISOString(),
      actorId: (req as any).user.id,
      actorName: (req as any).user.name,
      action: "shift.delete",
      details: JSON.stringify({ id, before }),
    });
    res.json({ ok: true });
  });

  // --------- Swaps ----------
  app.get("/api/swaps", async (_req, res) => {
    const list = await storage.listSwapRequests();
    res.json(list);
  });

  app.post("/api/swaps", requireAuth, async (req, res) => {
    const parsed = insertSwapRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid" });
    const user = (req as any).user as User;
    const data = parsed.data;
    // basic guard: requester must own the shift OR be admin
    const shift = await storage.getShift(data.shiftId);
    if (!shift) return res.status(404).json({ error: "shift_not_found" });
    if (user.role !== "admin" && shift.providerId !== user.providerId) {
      return res.status(403).json({ error: "not_your_shift" });
    }
    const r = await storage.createSwapRequest(data);
    await storage.appendAudit({
      at: new Date().toISOString(),
      actorId: user.id,
      actorName: user.name,
      action: "swap.request",
      details: JSON.stringify(r),
    });
    res.json(r);
  });

  app.post("/api/swaps/:id/approve", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const user = (req as any).user as User;
    const list = await storage.listSwapRequests();
    const sr = list.find((x) => x.id === id);
    if (!sr) return res.status(404).json({ error: "not_found" });
    const target = await storage.getProvider(sr.targetProviderId);
    // target provider OR admin can approve
    if (user.role !== "admin" && target && user.providerId !== target.id) {
      return res.status(403).json({ error: "not_target" });
    }
    const updated = await storage.updateSwapStatus(id, "approved", user.id);
    // actually perform the swap: reassign shift
    if (updated) {
      await storage.updateShift(updated.shiftId, { providerId: updated.targetProviderId });
    }
    await storage.appendAudit({
      at: new Date().toISOString(),
      actorId: user.id,
      actorName: user.name,
      action: "swap.approve",
      details: JSON.stringify(updated),
    });
    res.json(updated);
  });

  app.post("/api/swaps/:id/decline", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const user = (req as any).user as User;
    const updated = await storage.updateSwapStatus(id, "declined", user.id);
    await storage.appendAudit({
      at: new Date().toISOString(),
      actorId: user.id,
      actorName: user.name,
      action: "swap.decline",
      details: JSON.stringify(updated),
    });
    res.json(updated);
  });

  // --------- Audit log ----------
  app.get("/api/audit", requireAuth, async (_req, res) => {
    const list = await storage.listAudit(500);
    res.json(list);
  });

  // --------- Flags ----------
  app.get("/api/flags", async (req, res) => {
    const resolvedParam = req.query.resolved;
    const opts: { resolved?: boolean } = {};
    if (resolvedParam === "true") opts.resolved = true;
    if (resolvedParam === "false") opts.resolved = false;
    const list = await storage.listFlags(opts);
    res.json(list);
  });
  app.post("/api/flags", requireAuth, requireAdmin, async (req, res) => {
    const flag = await storage.createFlag(req.body);
    res.json(flag);
  });
  app.post("/api/flags/:id/resolve", requireAuth, requireAdmin, async (req, res) => {
    const user = (req as any).user;
    const id = parseInt(req.params.id, 10);
    const flag = await storage.resolveFlag(id, user?.id ?? null);
    if (!flag) return res.status(404).json({ message: "Not found" });
    await storage.appendAudit({
      at: new Date().toISOString(),
      actorId: user?.id ?? null,
      actorName: user?.name ?? "system",
      action: "flag.resolve",
      details: JSON.stringify({ flagId: id, message: flag.message }),
    });
    res.json(flag);
  });

  // --------- Reimbursement reports ----------
  // GET /api/reports/trinity-gr?month=YYYY-MM  -> Trinity Health GR weekend call (ER coverage)
  // GET /api/reports/uofm-west?month=YYYY-MM   -> UofM Health West facial trauma call
  //
  // Both reports normalize each call day to 8a → 8a+1 (24 hours).  Stored shifts
  // may be in any shape (e.g. midnight→8a chunks) — we dedupe by provider + call
  // day before counting.  The CSV begins with a per-provider summary
  // (Provider | Days | Total Hours) and then a detail table.
  //
  // Admin-only.
  async function buildCallLogReport(opts: {
    month: string;
    title: string;
    defaultLocation: string;
    filterShift: (s: { pool: string; location: string | null }) => boolean;
    excludeProviderIds?: Set<number>;
    generatedBy: string;
  }): Promise<string> {
    const { month, title, defaultLocation, filterShift, excludeProviderIds, generatedBy } = opts;
    const [y, m] = month.split("-").map((n) => parseInt(n, 10));
    const from = `${month}-01T00:00:00`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${month}-${String(lastDay).padStart(2, "0")}T23:59:59`;

    const shifts = await storage.listShifts(from, to);
    const providers = await storage.listProviders();
    const pById = new Map(providers.map((p) => [p.id, p]));

    const matching = shifts
      .filter(filterShift)
      .filter((s) => s.startAt >= from && s.startAt <= to)
      .filter((s) => !excludeProviderIds || !excludeProviderIds.has(s.providerId));

    // Normalize to one 24h (8a→8a+1) call day per provider per calendar date.
    // Key = callDay + providerId.  The callDay is the LOCAL date of the shift's
    // start_at unless start_at is before 08:00, in which case the call day
    // actually belongs to the previous date (the shift is the tail of an 8a
    // handoff from the day before).  We derive callDay conservatively as
    // "the date at which an 8a→8a+1 window containing startAt begins".
    type DayKey = string; // YYYY-MM-DD
    type Row = {
      day: DayKey;
      providerId: number;
      location: string;
      note: string;
    };
    const seen = new Map<string, Row>();
    for (const s of matching) {
      const start = new Date(s.startAt);
      // If the stored shift starts before 8am, treat it as a continuation of
      // the previous call day (which began at 8am the day before).
      const callDayDate = new Date(start);
      if (callDayDate.getHours() < 8) {
        callDayDate.setDate(callDayDate.getDate() - 1);
      }
      callDayDate.setHours(0, 0, 0, 0);
      const day = `${callDayDate.getFullYear()}-${String(callDayDate.getMonth() + 1).padStart(2, "0")}-${String(
        callDayDate.getDate(),
      ).padStart(2, "0")}`;
      // Only include if the call day itself falls in the requested month.
      if (!day.startsWith(month)) continue;
      const key = `${day}|${s.providerId}`;
      if (seen.has(key)) {
        // Merge notes / prefer non-empty location.
        const existing = seen.get(key)!;
        if (s.note && !existing.note.includes(s.note)) {
          existing.note = existing.note ? `${existing.note}; ${s.note}` : s.note;
        }
        if (!existing.location && s.location) existing.location = s.location;
        continue;
      }
      seen.set(key, {
        day,
        providerId: s.providerId,
        location: s.location || defaultLocation,
        note: s.note || "",
      });
    }

    const rows = Array.from(seen.values()).sort((a, b) => {
      if (a.day !== b.day) return a.day.localeCompare(b.day);
      const an = pById.get(a.providerId)?.lastName ?? "";
      const bn = pById.get(b.providerId)?.lastName ?? "";
      return an.localeCompare(bn);
    });

    const providerName = (id: number) => {
      const p = pById.get(id);
      if (!p) return `#${id}`;
      const cred = p.credentials === "PA-C" ? ", PA-C" : p.credentials ? `, ${p.credentials}` : "";
      return `${p.lastName}${p.firstName ? `, ${p.firstName}` : ""}${cred}`;
    };

    // Per-provider summary (days + total hours = days * 24).
    type Summary = { providerId: number; name: string; days: number };
    const summaryMap = new Map<number, Summary>();
    for (const r of rows) {
      const cur = summaryMap.get(r.providerId);
      if (cur) cur.days += 1;
      else summaryMap.set(r.providerId, { providerId: r.providerId, name: providerName(r.providerId), days: 1 });
    }
    const summary = Array.from(summaryMap.values()).sort((a, b) => {
      if (b.days !== a.days) return b.days - a.days;
      return a.name.localeCompare(b.name);
    });

    const totalDays = rows.length;
    const totalHours = totalDays * 24;

    const monthLabel = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    const lines: string[] = [];
    lines.push(`# ${title} — ${monthLabel}`);
    lines.push(`# Practice: Michigan ENT & Allergy Specialists`);
    lines.push(`# Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} by ${generatedBy}`);
    lines.push(`# Call windows normalized to 8:00a → 8:00a next day (24h per day)`);
    lines.push(`# Total providers: ${summary.length}   Total days: ${totalDays}   Total hours: ${totalHours}`);
    lines.push("");
    lines.push("Summary by Provider");
    lines.push(["Provider", "Total Hours", "Days Responsible"].map(csvEscape).join(","));
    for (const s of summary) {
      lines.push([s.name, String(s.days * 24), String(s.days)].map(csvEscape).join(","));
    }
    lines.push(["TOTAL", String(totalHours), String(totalDays)].map(csvEscape).join(","));
    lines.push("");
    lines.push("Detail");
    lines.push(
      ["Call Day", "Provider", "Location", "Start", "End", "Hours", "Notes"].map(csvEscape).join(","),
    );
    for (const r of rows) {
      // End = next day, same 08:00
      const [yy, mm, dd] = r.day.split("-").map((n) => parseInt(n, 10));
      const endDate = new Date(yy, mm - 1, dd + 1);
      const endDay = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(
        endDate.getDate(),
      ).padStart(2, "0")}`;
      lines.push(
        [
          r.day,
          providerName(r.providerId),
          r.location,
          `${r.day} 08:00`,
          `${endDay} 08:00`,
          "24",
          r.note.replace(/\r?\n/g, " "),
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    return lines.join("\n");
  }

  app.get("/api/reports/trinity-gr", requireAuth, requireAdmin, async (req, res) => {
    const month = typeof req.query.month === "string" ? req.query.month : "";
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month must be YYYY-MM" });

    // Exclude any provider not in the practice (e.g. Dr. Winkle — outside coverage).
    const providers = await storage.listProviders();
    const excluded = new Set<number>();
    for (const p of providers) {
      if (p.lastName.toLowerCase() === "winkle") excluded.add(p.id);
    }

    const csv = await buildCallLogReport({
      month,
      title: "Trinity Health GR Monthly Call Log",
      defaultLocation: "Trinity Health St. Mary's",
      filterShift: (s) => s.pool === "weekend" && s.location === "Trinity Health St. Mary's",
      excludeProviderIds: excluded,
      generatedBy: (req as any).user.name,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="trinity-gr-call-log-${month}.csv"`,
    );
    res.send(csv);
  });

  app.get("/api/reports/uofm-west", requireAuth, requireAdmin, async (req, res) => {
    const month = typeof req.query.month === "string" ? req.query.month : "";
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month must be YYYY-MM" });

    const csv = await buildCallLogReport({
      month,
      title: "UofM Health West Facial Trauma Call Log",
      defaultLocation: "UofM Health West",
      filterShift: (s) => s.pool === "uofm_west",
      generatedBy: (req as any).user.name,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="uofm-west-facial-trauma-${month}.csv"`,
    );
    res.send(csv);
  });

  // --------- iCal feeds ----------
  // /api/ical/all.ics — practice-wide feed (no auth; opaque URL can still be distributed)
  // /api/ical/pool/:pool.ics — per-pool feed
  // /api/ical/me/:token.ics — per-provider feed using personal feed token
  app.get("/api/ical/all.ics", async (_req, res) => {
    const shifts = await storage.listShifts();
    const providers = await storage.listProviders();
    const ics = buildICal({
      shifts,
      providers,
      calendarName: "MIENT & Allergy — All On-Call",
    });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.send(ics);
  });

  app.get("/api/ical/pool/:pool.ics", async (req, res) => {
    const pool = req.params.pool;
    const allShifts = await storage.listShifts();
    const providers = await storage.listProviders();
    const ics = buildICal({
      shifts: allShifts.filter((s) => s.pool === pool),
      providers,
      calendarName: `MIENT & Allergy — ${pool.toUpperCase()} On-Call`,
    });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.send(ics);
  });

  app.get("/api/ical/me/:token.ics", async (req, res) => {
    const user = await storage.getUserByFeedToken(req.params.token);
    if (!user || !user.providerId) return res.status(404).send("Not found");
    const allShifts = await storage.listShifts();
    const providers = await storage.listProviders();
    const ics = buildICal({
      shifts: allShifts.filter((s) => s.providerId === user.providerId),
      providers,
      calendarName: `MIENT & Allergy — ${user.name} On-Call`,
    });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.send(ics);
  });

  return httpServer;
}
