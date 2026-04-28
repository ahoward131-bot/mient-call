/**
 * One-shot import of the practice's integrated call schedule workbook.
 *
 * Usage: tsx scripts/import_workbook.ts /abs/path/to/Integrated-Call-Schedule.xlsx
 *
 * Behavior:
 *  - Renames existing providers to match the spreadsheet spelling
 *  - Adds Mark Winkle (MRW) as outside ENT
 *  - Deactivates Erin Kevern (EMK) and Libby Cabrera — no longer with practice
 *  - Wipes shifts table, re-inserts from workbook
 *  - Raises flags for: missing THGH coverage, missing ZCH/NOCH/MIENT GR/GRENT coverage,
 *    unknown initials, and any rows that can't be mapped
 */
import ExcelJS from "exceljs";
import { storage, db } from "../server/storage";
import { providers, shifts, flags } from "../shared/schema";
import { eq } from "drizzle-orm";

type PoolId = "lakeshore" | "mientgr" | "grent" | "weekend" | "pa" | "corewell" | "peds_backup";

// Spreadsheet initials → canonical provider definition
// last_name is what will appear in the app; this is the source of truth.
const INITIALS_MAP: Record<
  string,
  { last: string; kind: "physician" | "pa"; credentials: string; primary: PoolId; eligible: PoolId[]; notes?: string; active?: boolean }
> = {
  // MIENT Lakeshore physicians
  RJS: { last: "Strabbing", kind: "physician", credentials: "MD", primary: "lakeshore", eligible: ["weekend"] },
  SCP: { last: "Palmer",    kind: "physician", credentials: "MD", primary: "lakeshore", eligible: ["weekend"] },
  TCO: { last: "Orton",     kind: "physician", credentials: "MD", primary: "lakeshore", eligible: ["weekend"] },
  MJK: { last: "Keenan",    kind: "physician", credentials: "MD", primary: "lakeshore", eligible: ["weekend"] },
  // MIENT GR physicians
  MFF: { last: "Foster",      kind: "physician", credentials: "MD", primary: "mientgr", eligible: ["weekend"] },
  ALH: { last: "Howard",      kind: "physician", credentials: "MD", primary: "mientgr", eligible: ["weekend"] },
  JBR: { last: "Riley",       kind: "physician", credentials: "MD", primary: "mientgr", eligible: ["weekend"] },
  NCC: { last: "Cameron",     kind: "physician", credentials: "MD", primary: "mientgr", eligible: ["weekend"] },
  SSB: { last: "Shah-Becker", kind: "physician", credentials: "MD", primary: "mientgr",
         eligible: ["weekend", "corewell", "peds_backup"],
         notes: "Peds ENT. Covers Corewell Butterworth/Blodgett (adult + peds). Peds ENT backup." },
  // GRENT physicians
  GJA: { last: "Artz",   kind: "physician", credentials: "MD", primary: "grent", eligible: ["weekend"] },
  AMB: { last: "Behler", kind: "physician", credentials: "MD", primary: "grent", eligible: ["weekend"] },
  DTM: { last: "Mistry", kind: "physician", credentials: "MD", primary: "grent", eligible: ["weekend"] },
  JCT: { last: "Taylor", kind: "physician", credentials: "MD", primary: "grent", eligible: ["weekend"] },
  CC:  { last: "Cox",    kind: "physician", credentials: "MD", primary: "grent", eligible: ["weekend"] },
  // Outside ENT
  MRW: { last: "Winkle", kind: "physician", credentials: "MD", primary: "weekend", eligible: ["weekend"],
         notes: "Outside ENT — covers Trinity Health St. Mary's call." },
  // PAs
  SK: { last: "Kuipers",   kind: "pa", credentials: "PA-C", primary: "pa", eligible: [] },
  AR: { last: "Rogghe",    kind: "pa", credentials: "PA-C", primary: "pa", eligible: [] },
  CL: { last: "Ludington", kind: "pa", credentials: "PA-C", primary: "pa", eligible: [] },
  AK: { last: "King",      kind: "pa", credentials: "PA-C", primary: "pa", eligible: [] },
  BO: { last: "Ophoff",    kind: "pa", credentials: "PA-C", primary: "pa", eligible: [] },
  AW: { last: "Wight",     kind: "pa", credentials: "PA-C", primary: "pa", eligible: [] },
  // No longer with practice — mark inactive if they appear
  EMK: { last: "Kevern",  kind: "physician", credentials: "MD", primary: "grent", eligible: [], active: false,
         notes: "No longer with the practice." },
};

// Spreadsheet row labels → app pool + location text
// Two sheet layouts exist:
//   2025 sheet: PA, MIENT Lakeshore-Practice, ZCH, NOCH, MIENT GR, GRENT, Corewell, Trinity St. Mary's
//   2026 sheet: PA, MIENT Lakeshore-Practice, ZCH, Trinity Health - Grand Haven, MIENT GR, GRENT, Helen DeVos, Trinity St. Mary's
const ROW_LABEL_MAP: Record<string, { pool: PoolId; location: string | null }> = {
  "pa":                              { pool: "pa",          location: null },
  "mient lakeshore-practice":        { pool: "lakeshore",   location: "MIENT Lakeshore practice" },
  "zch":                             { pool: "lakeshore",   location: "Zeeland Community Hospital" },
  "noch":                            { pool: "lakeshore",   location: "North Ottawa Community Hospital" },
  "trinity health - grand haven":    { pool: "lakeshore",   location: "Trinity Health Grand Haven" },
  "mient gr practice":               { pool: "mientgr",     location: null },
  "grent practice":                  { pool: "grent",       location: null },
  "trinity health st. mary's":      { pool: "weekend",     location: "Trinity Health St. Mary's" },
  "corewell":                        { pool: "corewell",    location: "Corewell Butterworth/Blodgett" },
  "helen devos":                     { pool: "peds_backup", location: "Helen DeVos Children's" },
};

// Rows we expect every weekday (flag a missing date if no assignment).
// Per user guidance: THGH is the critical gap to surface, ZCH is secondary.
// Other rows (NOCH, MIENT Lakeshore practice, MIENT GR, GRENT, PA) frequently have
// weekdays without explicit assignment because coverage is implicit — flagging
// every such day would create hundreds of false-positive flags, so we skip them.
// THGH intentionally excluded — the practice simply doesn't provide services on
// unassigned days at Trinity Health Grand Haven, so these are not gaps to flag.
const COVERAGE_REQUIRED: { row: string; label: string }[] = [
  { row: "zch", label: "ZCH (Zeeland Community Hospital)" },
];

function pad(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

// Convert a calendar date + pool into (startAt, endAt) local ISO strings
// Rules (user-defined):
//   Mon 8a → Tue 8a (and so on Mon, Tue, Wed)
//   Thu 8a → Fri 5p  (weekday shift ends Fri 5p when weekend starts)
//   Weekend: Fri 5p → Mon 8a  (represented as one shift starting Fri)
//   PA: same as weekday (8a → 8a next day); on Fri we let it run Fri 8a → Mon 8a to match spreadsheet continuity.
function shiftWindow(pool: PoolId, date: Date): { startAt: string; endAt: string } | null {
  const y = date.getFullYear(), m = pad(date.getMonth() + 1), d = pad(date.getDate());
  const dow = date.getDay(); // 0=Sun..6=Sat
  const start = new Date(date);
  const end = new Date(date);
  start.setHours(8, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  end.setHours(8, 0, 0, 0);

  if (pool === "weekend") {
    // We record the weekend shift only on Fri/Sat/Sun rows — treat every day the spreadsheet
    // has a weekend-pool assignment as a single-day block (Fri 5p–Sat, Sat 0–Sun, Sun–Mon 8a etc.),
    // so the UI still shows it on each weekend day. Simpler: always span that one day 0-24,
    // the provider is the same all weekend anyway.
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate()); // +1 day, midnight = next-day 0:00
    return { startAt: fmtLocal(start), endAt: fmtLocal(end) };
  }
  if (pool === "grent" || pool === "mientgr") {
    // Weekday only; Thu → Fri 5p, else +1d 8a
    if (dow === 4 /* Thu */) {
      end.setDate(date.getDate() + 1);
      end.setHours(17, 0, 0, 0);
    }
    return { startAt: fmtLocal(start), endAt: fmtLocal(end) };
  }
  if (pool === "lakeshore" || pool === "pa") {
    // 24h by default
    if (dow === 4 /* Thu */) {
      end.setDate(date.getDate() + 1);
      end.setHours(17, 0, 0, 0);
    }
    return { startAt: fmtLocal(start), endAt: fmtLocal(end) };
  }
  // corewell, peds_backup — full 24h day blocks
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return { startAt: fmtLocal(start), endAt: fmtLocal(end) };
}

function fmtLocal(d: Date): string {
  // YYYY-MM-DDTHH:MM:SS (no timezone — treated as local)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function norm(s: any): string {
  if (s == null) return "";
  return String(s).trim().toLowerCase();
}

type ParsedAssignment = {
  date: Date;                 // calendar date
  rowLabel: string;           // original spreadsheet row label (lowercased)
  pool: PoolId;
  location: string | null;
  initials: string;
};

type MissingCoverage = { date: Date; rowLabel: string; label: string };

// Extract a Date from a cell value, handling real Dates, formula results, and ISO strings.
function cellDate(v: any): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    // ISO string like "2026-01-01T00:00:00.000Z"
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "object" && v.result != null) {
    return cellDate(v.result);
  }
  return null;
}

// Extract a plain string label from a cell (handling formula results).
function cellText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (v instanceof Date) return "";
  if (typeof v === "object" && v.result != null) {
    if (typeof v.result === "string") return v.result;
    return "";
  }
  return String(v);
}

async function parseWorkbook(path: string): Promise<{ assignments: ParsedAssignment[]; missing: MissingCoverage[]; unknownLabels: Set<string>; }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);

  const assignments: ParsedAssignment[] = [];
  const missing: MissingCoverage[] = [];
  const unknownLabels = new Set<string>();

  for (const sheetName of ["2025 Call Schedule", "2026 Call Schedule"]) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;
    const maxRow = ws.rowCount;
    const maxCol = 40;

    // Track whether a block has any real assignment — we skip entire empty blocks
    // because the 2025 sheet has formula-driven date headers for Jan–Sep that resolve
    // to 2026 dates (the workbook's 2025 sheet was only populated from Oct 2025
    // onward). Parsing those empty blocks would produce duplicate missing-coverage
    // flags for every weekday in Jan–Sep 2026.
    const DOW_ABBREVS = new Set(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);

    let r = 1;
    while (r <= maxRow) {
      const bVal = ws.getCell(r, 2).value as any;
      const hdrDate = cellDate(bVal);
      if (hdrDate) {
        const dateRow = r;
        // Collect date columns (skip the header-spillover cols 3..6 which may show 01-01 from merged range)
        const colDates: { col: number; date: Date }[] = [];
        for (let c = 3; c <= maxCol; c++) {
          const v = ws.getCell(dateRow, c).value as any;
          const d = cellDate(v);
          if (d) colDates.push({ col: c, date: d });
        }
        if (colDates.length === 0) { r++; continue; }

        // Is this block populated? If every cell in the 8 data rows is blank,
        // treat the whole block as a template placeholder and skip it entirely.
        let blockHasData = false;
        blockCheck: for (let lr = r + 2; lr <= r + 9; lr++) {
          for (const { col } of colDates) {
            const v = ws.getCell(lr, col).value;
            if (typeof v === "string" && v.trim().length > 0 && !DOW_ABBREVS.has(v.trim())) {
              blockHasData = true;
              break blockCheck;
            }
          }
        }
        if (!blockHasData) {
          r += 11;
          continue;
        }

        // Walk label rows r+2 .. r+9 (8 pool rows per month block)
        for (let lr = r + 2; lr <= r + 9; lr++) {
          const rawLabel = ws.getCell(lr, 2).value;
          const label = norm(cellText(rawLabel));
          if (!label) continue;
          const map = ROW_LABEL_MAP[label];
          if (!map) {
            unknownLabels.add(label);
            continue;
          }

          for (const { col, date } of colDates) {
            const cell = ws.getCell(lr, col).value;
            const initialsRaw = cellText(cell).trim().toUpperCase();
            const isRequired = COVERAGE_REQUIRED.find((rc) => rc.row === label);
            const dow = date.getDay(); // 0=Sun..6=Sat
            const isWeekday = dow >= 1 && dow <= 5;

            if (!initialsRaw) {
              // Flag missing required coverage on weekdays only
              if (isRequired && isWeekday) {
                missing.push({ date, rowLabel: label, label: isRequired.label });
              }
              continue;
            }
            // Strip parenthetical annotations "(ABC)", keep the main initials
            const cleanInitials = initialsRaw.replace(/\(.+?\)/g, "").trim();
            if (!cleanInitials) continue;

            assignments.push({
              date,
              rowLabel: label,
              pool: map.pool,
              location: map.location,
              initials: cleanInitials,
            });
          }
        }
        r += 11;
      } else {
        r++;
      }
    }
  }
  return { assignments, missing, unknownLabels };
}

async function reconcileProviders(usedInitials: Set<string>): Promise<Record<string, number>> {
  const existing = await storage.listProviders();
  const byLast = new Map<string, typeof existing[number]>();
  for (const p of existing) byLast.set(p.lastName.toLowerCase(), p);

  const initialsToId: Record<string, number> = {};

  // 1) For each initial, ensure the provider exists / is up to date
  for (const initials of usedInitials) {
    const def = INITIALS_MAP[initials];
    if (!def) continue;

    // Try to find by last name (case-insensitive)
    let provider = byLast.get(def.last.toLowerCase());

    // Also try old misspellings that we seeded
    if (!provider) {
      const aliases: Record<string, string> = {
        "Keenan": "kennan",
        "Rogghe": "rogie",
        "Ludington": "luddington",
        "Behler": "bueller",
      };
      const oldName = aliases[def.last];
      if (oldName) provider = byLast.get(oldName);
    }

    const payload = {
      lastName: def.last,
      firstName: null,
      credentials: def.credentials,
      kind: def.kind,
      primaryPool: def.primary,
      eligiblePools: JSON.stringify(def.eligible),
      notes: def.notes ?? null,
      active: def.active !== false,
      color: null,
    };

    if (provider) {
      const updated = await storage.updateProvider(provider.id, payload);
      initialsToId[initials] = updated?.id ?? provider.id;
    } else {
      const created = await storage.createProvider(payload);
      initialsToId[initials] = created.id;
    }
  }

  // 2) Deactivate providers who are no longer with the practice:
  //    anyone whose name matches an INITIALS_MAP entry marked active:false,
  //    or older seed names we never matched ("Bueller", "Kennan" etc will have been renamed above).
  //    Also proactively deactivate Kevern (EMK) and Libby Cabrera if they exist.
  const deactivateByLast = ["kevern", "cabrera"];
  const refreshed = await storage.listProviders();
  for (const p of refreshed) {
    if (deactivateByLast.includes(p.lastName.toLowerCase()) && p.active) {
      await storage.updateProvider(p.id, { active: false, notes: "No longer with the practice." });
    }
  }

  return initialsToId;
}

async function main() {
  const path = process.argv[2] || "/home/user/workspace/Integrated-Call-Schedule.xlsx";
  console.log(`Importing ${path}`);

  const { assignments, missing, unknownLabels } = await parseWorkbook(path);
  console.log(`Parsed ${assignments.length} assignments`);
  console.log(`Missing-coverage candidates: ${missing.length}`);
  console.log(`Unknown row labels: ${[...unknownLabels].join(", ") || "(none)"}`);

  // Used initials (including unmatched ones, for flagging)
  const usedInitials = new Set(assignments.map((a) => a.initials));
  const unknown = [...usedInitials].filter((i) => !INITIALS_MAP[i]);
  console.log(`Known initials: ${[...usedInitials].filter((i) => INITIALS_MAP[i]).length}`);
  console.log(`Unknown initials: ${unknown.length > 0 ? unknown.join(", ") : "(none)"}`);

  // Sync providers
  const initialsToId = await reconcileProviders(usedInitials);
  console.log(`Providers resolved: ${Object.keys(initialsToId).length}`);

  // Wipe existing shifts
  const existingShifts = await storage.listShifts();
  console.log(`Wiping ${existingShifts.length} existing shifts...`);
  for (const s of existingShifts) await storage.deleteShift(s.id);

  // Also clear any prior import flags so re-running is idempotent
  await storage.clearFlagsBySource("import");

  // Insert shifts
  let inserted = 0, skipped = 0;
  const skipExamples: string[] = [];
  for (const a of assignments) {
    const providerId = initialsToId[a.initials];
    if (!providerId) {
      skipped++;
      if (skipExamples.length < 5) skipExamples.push(`${a.initials} on ${a.date.toISOString().slice(0,10)} (${a.rowLabel})`);
      continue;
    }
    const w = shiftWindow(a.pool, a.date);
    if (!w) { skipped++; continue; }
    await storage.createShift({
      pool: a.pool,
      providerId,
      startAt: w.startAt,
      endAt: w.endAt,
      location: a.location,
      note: null,
    });
    inserted++;
  }
  console.log(`Inserted ${inserted} shifts (skipped ${skipped}).`);
  if (skipExamples.length) console.log(`Skip examples: ${skipExamples.join("; ")}`);

  // Raise flags ---------------------------------------
  // a) missing coverage
  // Dedup by (date+label) — the parser can emit multiple per day for pools that have
  // multiple rows (e.g. Lakeshore has both ZCH and THGH rows).
  const missingKey = (mc: MissingCoverage) => `${mc.date.toISOString().slice(0,10)}|${mc.rowLabel}`;
  const seen = new Set<string>();
  let missingFlags = 0;
  for (const mc of missing) {
    const k = missingKey(mc);
    if (seen.has(k)) continue;
    seen.add(k);
    const map = ROW_LABEL_MAP[mc.rowLabel];
    await storage.createFlag({
      kind: "missing_coverage",
      severity: "warn",
      date: mc.date.toISOString().slice(0,10),
      pool: map?.pool ?? null,
      location: map?.location ?? null,
      message: mc.rowLabel === "trinity health - grand haven"
        ? `No THGH coverage — Trinity Health Grand Haven has no ENT coverage on this date.`
        : mc.rowLabel === "zch"
        ? `No ZCH coverage — Zeeland Community Hospital has no assigned ENT on this date.`
        : `No ${mc.label} listed on this date.`,
      source: "import",
    });
    missingFlags++;
  }

  // b) unknown initials
  for (const init of unknown) {
    const sample = assignments.filter((a) => a.initials === init).slice(0, 3)
      .map((a) => a.date.toISOString().slice(0,10)).join(", ");
    await storage.createFlag({
      kind: "unknown_initials",
      severity: "error",
      date: null,
      pool: null,
      location: null,
      message: `Unknown initials "${init}" in spreadsheet (e.g. ${sample}). Not imported — please add this provider or check spelling.`,
      source: "import",
    });
  }

  // c) summary flag
  await storage.createFlag({
    kind: "import_warning",
    severity: "info",
    date: null,
    pool: null,
    location: null,
    message: `Imported ${inserted} shifts from workbook (${new Date().toLocaleString()}). ${missingFlags} coverage gaps flagged, ${unknown.length} unknown initials.`,
    source: "import",
  });

  console.log(`Flags: ${missingFlags} coverage gaps + ${unknown.length} unknown-initial flags`);
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
