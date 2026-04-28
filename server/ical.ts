import type { Shift, Provider } from "@shared/schema";
import { POOL_META, type Pool } from "@shared/schema";

function toICSDate(iso: string) {
  // Convert ISO to UTC-ICS format: 20260421T120000Z
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

// All-day ICS dates use VALUE=DATE format: 20260421 (no time component).
// We anchor to the LOCAL calendar date the shift starts/ends on so that a shift
// running e.g. Mon 8am → Tue 8am shows as a single all-day block on Monday
// (DTEND is exclusive in all-day events, so we add 1 day to the local end date).
function toLocalDateOnly(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate())
  );
}

function addDaysDateOnly(yyyymmdd: string, days: number) {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    dt.getFullYear().toString() +
    pad(dt.getMonth() + 1) +
    pad(dt.getDate())
  );
}

function providerLabel(p: Provider | undefined, providerId: number) {
  if (!p) return `Provider ${providerId}`;
  // Honor the rule: PAs are not docs, do not prefix with "Dr."
  if (p.credentials === "PA-C") return `${p.lastName}, PA-C`;
  return `Dr. ${p.lastName}`;
}

function escapeICS(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// Practice-row pools that show up in the app's week view. Anything else
// (NOCH, ZCH, THGR, Corewell, U of M West, weekend, peds_backup) is hospital
// or rotation-internal noise that clutters subscribed calendars and is
// excluded by default. Pass `includeAll: true` to override.
const PRACTICE_POOLS = new Set(["pa", "grent", "lakeshore", "mientgr"]);

// Short titles that mirror the in-app week view ("Lakeshore — Keenan")
// rather than the longer formal labels. Falls back to POOL_META.label.
const SHORT_POOL_TITLE: Record<string, string> = {
  pa: "PA",
  grent: "GRENT",
  lakeshore: "Lakeshore",
  mientgr: "MIENT-GR",
};

// Mirror of LOCATION_SHORT in client/src/lib/shiftUtils.ts so the iCal feed
// uses the same compact site names ("Lakeshore, ZCH, NOCH") that show up in
// the app's week view.
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
function shortLocation(loc: string) {
  return LOCATION_SHORT[loc] ?? loc;
}

export function buildICal(opts: {
  shifts: Shift[];
  providers: Provider[];
  calendarName: string;
  includeAll?: boolean;
}) {
  const { shifts, providers, calendarName, includeAll = false } = opts;
  const provMap = new Map(providers.map((p) => [p.id, p]));

  // Filter to the four practice rows by default — matches what users see in
  // the week view of the app and keeps subscribed calendars uncluttered.
  const filtered = includeAll
    ? shifts
    : shifts.filter((s) => PRACTICE_POOLS.has(s.pool));
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//MIENT Call App//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(`X-WR-CALNAME:${escapeICS(calendarName)}`);
  lines.push(`NAME:${escapeICS(calendarName)}`);

  // ----------------------------------------------------------------------
  // Step 1: collapse same-key duplicates (provider + pool + start + end)
  // that exist only to record multiple locations.
  // ----------------------------------------------------------------------
  type MergedShift = {
    id: number;
    providerId: number;
    pool: string;
    startAt: string;
    endAt: string;
    updatedAt: string;
    note: string | null;
    locations: string[];
  };
  const exactGroups = new Map<string, MergedShift>();
  for (const s of filtered) {
    const key = `${s.providerId}|${s.pool}|${s.startAt}|${s.endAt}`;
    const existing = exactGroups.get(key);
    if (existing) {
      if (s.location && !existing.locations.includes(s.location)) {
        existing.locations.push(s.location);
      }
      if (s.updatedAt > existing.updatedAt) existing.updatedAt = s.updatedAt;
    } else {
      exactGroups.set(key, {
        id: s.id,
        providerId: s.providerId,
        pool: s.pool,
        startAt: s.startAt,
        endAt: s.endAt,
        updatedAt: s.updatedAt,
        note: s.note ?? null,
        locations: s.location ? [s.location] : [],
      });
    }
  }

  // ----------------------------------------------------------------------
  // Step 2: convert each shift into the set of "call days" it covers, then
  // merge consecutive call-days for the same (provider, pool, note) into a
  // single multi-day all-day event.
  //
  // "Call day" = the local calendar date the shift's coverage *belongs* to.
  // Convention: a 24-hour shift that starts at 8am on day D and ends at 8am
  // on D+1 is rendered as a single all-day event on day D — NOT spanning
  // both D and D+1 (which is what made the calendar look 2x cluttered).
  //
  // Thursday handoff (Thu 8a → Fri 5p) still counts as Thursday only; the
  // Friday assignment is a separate shift owned by the next provider.
  // ----------------------------------------------------------------------
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const ymdLocal = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  };
  const dateAdd = (yyyymmdd: string, days: number) => {
    const y = Number(yyyymmdd.slice(0, 4));
    const m = Number(yyyymmdd.slice(4, 6));
    const d = Number(yyyymmdd.slice(6, 8));
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}`;
  };

  type Stretch = {
    providerId: number;
    pool: string;
    callDay: string; // YYYYMMDD
    sourceShift: MergedShift;
  };
  const stretches: Stretch[] = [];
  for (const s of exactGroups.values()) {
    // Each shift maps to ONE call day = its local start date.
    stretches.push({
      providerId: s.providerId,
      pool: s.pool,
      callDay: ymdLocal(s.startAt),
      sourceShift: s,
    });
  }
  // Sort so consecutive same-(provider,pool) days are adjacent.
  stretches.sort((a, b) =>
    a.providerId !== b.providerId
      ? a.providerId - b.providerId
      : a.pool < b.pool
      ? -1
      : a.pool > b.pool
      ? 1
      : a.callDay.localeCompare(b.callDay),
  );

  // Walk the sorted list and merge consecutive call-days for the same
  // (provider, pool). Notes break a stretch (so a "also THGR ER" day stays
  // its own event and the user can see the override clearly).
  type Block = {
    id: number;
    providerId: number;
    pool: string;
    firstDay: string;
    lastDay: string;
    sourceShifts: MergedShift[];
    note: string | null;
  };
  const blocks: Block[] = [];
  for (const st of stretches) {
    const last = blocks[blocks.length - 1];
    const note = st.sourceShift.note;
    const sameRun =
      last &&
      last.providerId === st.providerId &&
      last.pool === st.pool &&
      (last.note ?? null) === (note ?? null) &&
      dateAdd(last.lastDay, 1) === st.callDay;
    if (sameRun) {
      last.lastDay = st.callDay;
      last.sourceShifts.push(st.sourceShift);
    } else {
      blocks.push({
        id: st.sourceShift.id,
        providerId: st.providerId,
        pool: st.pool,
        firstDay: st.callDay,
        lastDay: st.callDay,
        sourceShifts: [st.sourceShift],
        note,
      });
    }
  }

  // ----------------------------------------------------------------------
  // Step 3: emit one VEVENT per merged block.
  // ----------------------------------------------------------------------
  for (const b of blocks) {
    const prov = provMap.get(b.providerId);
    const poolMeta = POOL_META[b.pool as Pool];
    const poolLabel = poolMeta?.label ?? b.pool;
    const shortPool = SHORT_POOL_TITLE[b.pool] ?? poolMeta?.short ?? poolLabel;
    const titleName = prov
      ? prov.credentials === "PA-C"
        ? `${prov.lastName}, PA-C`
        : prov.lastName
      : `Provider ${b.providerId}`;
    const provName = providerLabel(prov, b.providerId);

    // Aggregate locations across the merged shifts.
    const locSet = new Set<string>();
    for (const s of b.sourceShifts) for (const l of s.locations) locSet.add(l);
    const locs = Array.from(locSet);
    const shortLocs = locs.map(shortLocation);

    // Use the most recent updatedAt across the merged shifts.
    let updatedAt = b.sourceShifts[0].updatedAt;
    for (const s of b.sourceShifts) if (s.updatedAt > updatedAt) updatedAt = s.updatedAt;

    // Compute hours for the human-readable description: the actual start of
    // the first shift → actual end of the last shift in the run.
    const firstShift = b.sourceShifts[0];
    const lastShift = b.sourceShifts[b.sourceShifts.length - 1];

    const summary = `${shortPool} — ${titleName}`;
    const description = [
      `Pool: ${poolLabel}`,
      `Provider: ${provName}`,
      shortLocs.length > 0 ? `Locations: ${shortLocs.join(", ")}` : null,
      locs.length > 0 && locs.join(",") !== shortLocs.join(",")
        ? `Full locations: ${locs.join(", ")}`
        : null,
      b.note ? `Note: ${b.note}` : null,
      `Hours: ${new Date(firstShift.startAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })} → ${new Date(lastShift.endAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`,
    ]
      .filter(Boolean)
      .join("\\n");

    // All-day event: DTSTART = first call day, DTEND = lastDay + 1 (exclusive).
    const dtendDay = dateAdd(b.lastDay, 1);

    // Stable UID: anchor on the (provider, pool, firstDay) tuple so that
    // re-rendering the calendar after edits doesn't churn UIDs (Apple
    // Calendar treats new UIDs as new events and old UIDs as orphans).
    const uid = `block-${b.providerId}-${b.pool}-${b.firstDay}@mientcall`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${toICSDate(updatedAt)}`);
    lines.push(`DTSTART;VALUE=DATE:${b.firstDay}`);
    lines.push(`DTEND;VALUE=DATE:${dtendDay}`);
    lines.push("TRANSP:TRANSPARENT");
    lines.push(`SUMMARY:${escapeICS(summary)}`);
    lines.push(`DESCRIPTION:${escapeICS(description)}`);
    if (shortLocs.length > 0) lines.push(`LOCATION:${escapeICS(shortLocs.join(", "))}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
