import type { Shift, Provider, Pool } from "@shared/schema";
import { POOL_META } from "@shared/schema";

export function fmtDateISO(d: Date) {
  // Build an ISO-ish local datetime string (no TZ conversion) in YYYY-MM-DDTHH:MM
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeek(d: Date) {
  // Week starts Monday (as practice week begins Monday 8a)
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(x, diff);
}

export function startOfMonth(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x;
}

export function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function fmtDayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Does the [startAt, endAt) window overlap with the given calendar day?
 */
export function shiftOverlapsDay(shift: Shift, day: Date) {
  const ds = startOfDay(day).getTime();
  const de = addDays(ds as any, 1).getTime ? addDays(new Date(ds), 1).getTime() : ds + 24 * 3600 * 1000;
  const s = new Date(shift.startAt).getTime();
  const e = new Date(shift.endAt).getTime();
  return s < de && e > ds;
}

export function providerDisplay(p: Provider | undefined) {
  if (!p) return "—";
  return `${p.credentials === "PA-C" ? "" : "Dr. "}${p.lastName}${p.credentials === "PA-C" ? ", PA-C" : ""}`;
}

export function poolColor(pool: string) {
  return `hsl(var(--pool-${pool}))`;
}

export function poolLabel(pool: string) {
  return POOL_META[pool as Pool]?.label ?? pool;
}

/**
 * Given a reference Monday (8:00 local), produce default weekday + weekend windows
 * per the practice's rules:
 *   - Mon 8a → Tue 8a
 *   - Tue 8a → Wed 8a
 *   - Wed 8a → Thu 8a
 *   - Thu 8a → Fri 8a  (default — same as other weekdays)
 *   - Thu 8a → Fri 5p  ONLY for MIENT-GR / GRENT practice call (their weekday
 *                      coverage runs until the weekend pool takes over Fri 5p)
 *   - Fri 5p → Mon 8a  (WEEKEND)
 *
 * @param monday  the Monday reference date at 00:00 local
 * @param offset  0=Mon, 1=Tue, 2=Wed, 3=Thu
 * @param pool    optional — when "mientgr" or "grent", Thu extends to Fri 5p
 */
export function weekdayWindow(monday: Date, offset: 0 | 1 | 2 | 3, pool?: Pool) {
  const start = new Date(monday);
  start.setDate(start.getDate() + offset);
  start.setHours(8, 0, 0, 0);
  const end = new Date(start);
  const practiceWeekdayPool = pool === "mientgr" || pool === "grent";
  if (offset === 3 && practiceWeekdayPool) {
    // Thu 8a → Fri 5p (only for MIENT-GR and GRENT — hands off to weekend at Fri 5p)
    end.setDate(end.getDate() + 1);
    end.setHours(17, 0, 0, 0);
  } else {
    // All other weekday shifts are a standard 8a → 8a+1 (24 hours).
    end.setDate(end.getDate() + 1);
    end.setHours(8, 0, 0, 0);
  }
  return { start, end };
}

export function weekendWindow(monday: Date) {
  const start = new Date(monday);
  start.setDate(start.getDate() + 4); // Friday
  start.setHours(17, 0, 0, 0);
  const end = new Date(monday);
  end.setDate(end.getDate() + 7); // next Monday
  end.setHours(8, 0, 0, 0);
  return { start, end };
}

export const WEEKDAY_POOLS: Pool[] = ["pa", "lakeshore", "mientgr", "grent", "zch", "noch"];
export const WEEKEND_POOLS: Pool[] = ["thgr"];

/**
 * A single row to display on the calendar: one entry per provider per pool per day.
 * Combines multiple location-specific shifts into a single row so Dr. Palmer covering
 * MIENT Lakeshore practice + Trinity Health Grand Haven + Zeeland Community Hospital
 * shows as ONE row labeled "Lakeshore — Practice, THGH, ZCH" instead of three.
 */
export type DisplayShift = {
  id: number;              // representative shift id (first one in the group)
  shiftIds: number[];      // all underlying shift ids in this group
  pool: Pool;
  providerId: number;
  startAt: string;         // earliest start
  endAt: string;           // latest end
  locations: string[];     // unique locations (in stable order)
};

const LOCATION_SHORT: Record<string, string> = {
  "MIENT Lakeshore practice": "Lakeshore",
  "MIENT Lakeshore Practice": "Lakeshore",
  "Zeeland Community Hospital": "ZCH",
  "Trinity Health Grand Haven": "NOCH",
  "North Ottawa Community Hospital": "NOCH",
  "Trinity Health St. Mary's": "Trinity GR",
  "Trinity Health Grand Rapids": "THGR",
  "Corewell Butterworth/Blodgett/HDVCH": "HDVCH",
  "Helen DeVos": "Helen DeVos",
  "UofM Health West": "UofM West",
};

export function shortLocation(loc: string | null | undefined): string {
  if (!loc) return "";
  return LOCATION_SHORT[loc] ?? loc;
}

/**
 * Does this shift's "call day" equal the given calendar day?
 *
 * On-call schedules conventionally assign each shift to ONE day based on when
 * the shift begins. A shift that starts at Mon 8am "belongs" to Monday even
 * though it ends Tuesday morning. This avoids every day listing both the
 * outgoing and incoming provider for the same pool.
 *
 * Rule: the shift's call day is the local date of its start_at.
 */
export function shiftOnCallDay(shift: Shift, day: Date): boolean {
  const start = new Date(shift.startAt);
  return fmtLocalDateKey(start) === fmtLocalDateKey(day);
}

function fmtLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Group an array of raw shifts into display rows for a specific calendar day.
 * Only includes shifts whose "call day" is this day (see shiftOnCallDay).
 * Two shifts collapse into one row when they share (pool, providerId) AND their
 * time windows are identical. Location becomes a comma-joined list of short names.
 */
export function groupShiftsForDay(raw: Shift[], day: Date): DisplayShift[] {
  const onCall = raw.filter((s) => shiftOnCallDay(s, day));
  const keyed = new Map<string, DisplayShift>();
  for (const s of onCall) {
    const key = `${s.pool}|${s.providerId}|${s.startAt}|${s.endAt}`;
    const existing = keyed.get(key);
    if (existing) {
      existing.shiftIds.push(s.id);
      if (s.location && !existing.locations.includes(s.location)) {
        existing.locations.push(s.location);
      }
    } else {
      keyed.set(key, {
        id: s.id,
        shiftIds: [s.id],
        pool: s.pool as Pool,
        providerId: s.providerId,
        startAt: s.startAt,
        endAt: s.endAt,
        locations: s.location ? [s.location] : [],
      });
    }
  }
  return Array.from(keyed.values());
}

/**
 * Practice membership — MIENT-GR and GRENT are separate practices that are
 * integrating but not yet combined for weeknight call. Lakeshore (including
 * PAs) is the Lakeshore arm of MIENT but not the GR portion.
 *
 * Keyed by provider last name (case-insensitive). Providers not listed here
 * (e.g. Corewell rotators, Peds backup-only) have no practice affiliation.
 */
export type Practice = "mient_gr" | "grent" | "lakeshore";

const PROVIDER_PRACTICE: Record<string, Practice> = {
  // MIENT-GR practice
  foster: "mient_gr",
  howard: "mient_gr",
  riley: "mient_gr",
  cameron: "mient_gr",
  "shah-becker": "mient_gr",
  // GRENT practice
  artz: "grent",
  taylor: "grent",
  cox: "grent",
  mistry: "grent",
  behler: "grent",
  // Lakeshore (MIENT but not GR)
  orton: "lakeshore",
  palmer: "lakeshore",
  strabbing: "lakeshore",
  keenan: "lakeshore",
};

export function providerPractice(p: Provider | undefined): Practice | undefined {
  if (!p?.lastName) return undefined;
  const direct = PROVIDER_PRACTICE[p.lastName.toLowerCase()];
  if (direct) return direct;
  // PAs cover all of Lakeshore + MIENT patients — treat them as Lakeshore for
  // practice-affiliation purposes.
  if (p.credentials === "PA-C") return "lakeshore";
  return undefined;
}

/**
 * For Fridays on the MIENT-GR or GRENT pool rows: when the Friday-scheduled
 * doc in that pool differs from the Thursday doc in the same pool AND they're
 * from different GR practices, the Thursday doc covers until Fri 5p and the
 * Friday doc takes over at 5p. Display as "Thu doc / Fri doc @5p" on the
 * Friday pool row.
 *
 * Same-practice rolls (or same person Thu and Fri) show a single doc.
 *
 * Returns the outgoing (Thursday) providerId to pair with the given Friday
 * shift, or undefined if no pairing applies.
 */
export function fridayWeekendHandoff(
  raw: Shift[],
  day: Date,
  fridayShift: Shift | DisplayShift,
  provById: Map<number, Provider>,
): number | undefined {
  if (day.getDay() !== 5) return undefined;
  // Only applies to the GR practice pool rows.
  if (fridayShift.pool !== "mientgr" && fridayShift.pool !== "grent") return undefined;

  const fridayProv = provById.get(fridayShift.providerId);
  const fridayPractice = providerPractice(fridayProv);
  if (fridayPractice !== "mient_gr" && fridayPractice !== "grent") return undefined;

  // Find the Thursday shift in the same pool row.
  const thursday = addDays(day, -1);
  const thuKey = fmtLocalDateKey(thursday);
  const thuShift = raw.find((x) => {
    if (x.pool !== fridayShift.pool) return false;
    return fmtLocalDateKey(new Date(x.startAt)) === thuKey;
  });
  if (!thuShift) return undefined;
  if (thuShift.providerId === fridayShift.providerId) return undefined;

  const thuPractice = providerPractice(provById.get(thuShift.providerId));
  if (!thuPractice) return undefined;

  // Only pair when the two providers are from different GR practices.
  if (
    (thuPractice === "mient_gr" && fridayPractice === "grent") ||
    (thuPractice === "grent" && fridayPractice === "mient_gr")
  ) {
    return thuShift.providerId;
  }
  return undefined;
}
