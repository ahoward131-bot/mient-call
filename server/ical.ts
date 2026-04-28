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
    const provName = prov ? `Dr. ${prov.lastName}` : `Provider ${s.providerId}`;
    const summary = `${poolLabel} — ${provName}${s.location ? ` @ ${s.location}` : ""}`;
    const description = [
      `Pool: ${poolLabel}`,
      `Provider: ${provName}${prov?.credentials ? `, ${prov.credentials}` : ""}`,
      s.location ? `Location: ${s.location}` : null,
      s.note ? `Note: ${s.note}` : null,
    ]
      .filter(Boolean)
      .join("\\n");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:shift-${s.id}@mientcall`);
    lines.push(`DTSTAMP:${toICSDate(s.updatedAt)}`);
    lines.push(`DTSTART:${toICSDate(s.startAt)}`);
    lines.push(`DTEND:${toICSDate(s.endAt)}`);
    lines.push(`SUMMARY:${escapeICS(summary)}`);
    lines.push(`DESCRIPTION:${escapeICS(description)}`);
    if (s.location) lines.push(`LOCATION:${escapeICS(s.location)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
