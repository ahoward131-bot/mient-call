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

export function buildICal(opts: {
  shifts: Shift[];
  providers: Provider[];
  calendarName: string;
}) {
  const { shifts, providers, calendarName } = opts;
  const provMap = new Map(providers.map((p) => [p.id, p]));
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//MIENT Call App//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(`X-WR-CALNAME:${escapeICS(calendarName)}`);
  lines.push(`NAME:${escapeICS(calendarName)}`);

  for (const s of shifts) {
    const prov = provMap.get(s.providerId);
    const poolMeta = POOL_META[s.pool as Pool];
    const poolLabel = poolMeta?.label ?? s.pool;
    const provName = providerLabel(prov, s.providerId);
    const summary = `${poolLabel} — ${provName}${s.location ? ` @ ${s.location}` : ""}`;
    const description = [
      `Pool: ${poolLabel}`,
      `Provider: ${provName}`,
      s.location ? `Location: ${s.location}` : null,
      s.note ? `Note: ${s.note}` : null,
      // Include the actual on-call hours in the description since the event itself is all-day.
      `Hours: ${new Date(s.startAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })} → ${new Date(s.endAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`,
    ]
      .filter(Boolean)
      .join("\\n");

    // All-day event boundaries.
    // Floor to the start day; for the end, take the last day the shift covers and
    // add 1 (DTEND is EXCLUSIVE in iCalendar all-day events).
    const startDay = toLocalDateOnly(s.startAt);
    // If the shift ends exactly at midnight, it doesn't actually cover that final day —
    // back off 1 minute before deriving the last covered date.
    const endLocal = new Date(s.endAt);
    const lastCovered = new Date(endLocal.getTime() - 60 * 1000);
    const lastCoveredYmd =
      lastCovered.getFullYear().toString() +
      String(lastCovered.getMonth() + 1).padStart(2, "0") +
      String(lastCovered.getDate()).padStart(2, "0");
    const dtendDay = addDaysDateOnly(lastCoveredYmd, 1);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:shift-${s.id}@mientcall`);
    lines.push(`DTSTAMP:${toICSDate(s.updatedAt)}`);
    lines.push(`DTSTART;VALUE=DATE:${startDay}`);
    lines.push(`DTEND;VALUE=DATE:${dtendDay}`);
    lines.push("TRANSP:TRANSPARENT");
    lines.push(`SUMMARY:${escapeICS(summary)}`);
    lines.push(`DESCRIPTION:${escapeICS(description)}`);
    if (s.location) lines.push(`LOCATION:${escapeICS(s.location)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
