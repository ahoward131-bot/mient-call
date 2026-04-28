/**
 * seed-from-xls.ts
 * Reads Integrated-Call-Schedule.xlsx and seeds the DB with shifts
 * for all months found in both sheets.
 *
 * Run: tsx scripts/seed-from-xls.ts
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const XLS_PATH = path.resolve(__dirname, "../../Integrated-Call-Schedule.xlsx");
const DB_PATH = path.resolve(__dirname, "../data.db");

// ─── Provider initials → last_name map ──────────────────────────────────────
const INITIALS_MAP: Record<string, string> = {
  // MIENT Lakeshore
  RJS: "Strabbing",
  SCP: "Palmer",
  TCO: "Orton",
  MJK: "Keenan",
  // MIENT-GR
  ALH: "Howard",
  MFF: "Foster",
  JBR: "Riley",
  NCC: "Cameron",
  SSB: "Shah-Becker",
  // GRENT
  GJA: "Artz",
  AMB: "Behler",
  DTM: "Mistry",
  JCT: "Taylor",
  EMK: "Kevern",
  CC: "Cox",
  // PA
  SK: "Kuipers",
  AR: "Rogghe",
  CL: "Ludington",
  AK: "King",
  BO: "Ophoff",
  AW: "Wight",
  // ENT Center outside coverage
  MRW: "Winkle",
};

// ─── XLS row label → pool + location ────────────────────────────────────────
type PoolLocation = { pool: string; location: string | null };

function rowLabelToPoolLocation(label: string): PoolLocation | null {
  const lc = label.toLowerCase().trim();
  if (lc === "pa") return { pool: "pa", location: null };
  if (lc.startsWith("mient lakeshore")) return { pool: "lakeshore", location: "MIENT Lakeshore Practice" };
  if (lc === "zch") return { pool: "zch", location: "Zeeland Community Hospital" };
  if (lc.startsWith("trinity health - grand") || lc === "noch" || lc.startsWith("trinity health grand haven"))
    return { pool: "noch", location: "Trinity Health Grand Haven" };
  if (lc.startsWith("mient gr") || lc.startsWith("mient-gr")) return { pool: "mientgr", location: null };
  if (lc.startsWith("grent")) return { pool: "grent", location: null };
  if (lc === "helen devos" || lc === "corewell")
    return { pool: "corewell", location: "Corewell Butterworth/Blodgett/HDVCH" };
  if (lc.startsWith("trinity health st.") || lc.startsWith("trinity health st mary") || lc.startsWith("trinity health st. mar"))
    return { pool: "thgr", location: "Trinity Health St. Mary's" };
  return null;
}

// ─── Parse date value from cell ─────────────────────────────────────────────
function parseDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "string") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof val === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return new Date(d.y, d.m - 1, d.d);
  }
  return null;
}

// ─── Format a Date to local YYYY-MM-DDTHH:MM:SS ─────────────────────────────
function fmtISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

// ─── Build startAt / endAt for a shift ──────────────────────────────────────
function buildWindow(date: Date, pool: string): { startAt: string; endAt: string } {
  const start = new Date(date);
  start.setHours(8, 0, 0, 0);
  const end = new Date(date);

  // MIENT-GR and GRENT Thursday shifts extend to Fri 17:00
  const dow = date.getDay(); // 0=Sun…6=Sat
  if ((pool === "mientgr" || pool === "grent") && dow === 4) {
    end.setDate(end.getDate() + 1);
    end.setHours(17, 0, 0, 0);
  } else {
    end.setDate(end.getDate() + 1);
    end.setHours(8, 0, 0, 0);
  }

  return { startAt: fmtISO(start), endAt: fmtISO(end) };
}

// ─── Parse a month block from a worksheet ────────────────────────────────────
type ShiftRow = {
  pool: string;
  providerId: number;
  startAt: string;
  endAt: string;
  location: string | null;
};

interface ParsedMonthBlock {
  shifts: ShiftRow[];
  unknownInitials: string[];
}

function parseMonthBlock(
  rows: XLSX.CellObject[][],
  hdrRowIdx: number, // 0-indexed
  providerByLastName: Map<string, number>,
): ParsedMonthBlock {
  const shifts: ShiftRow[] = [];
  const unknownInitials: string[] = [];

  // Header row contains dates in cols C+ (col idx 2+)
  const hdrRow = rows[hdrRowIdx] as any[];
  // Collect (colIdx, date) pairs
  const datesByCol = new Map<number, Date>();
  for (let col = 2; col < hdrRow.length; col++) {
    const cell = hdrRow[col];
    if (!cell) continue;
    const d = parseDate(cell.v ?? cell);
    if (d && d.getFullYear() >= 2025) {
      datesByCol.set(col, d);
    }
  }

  if (datesByCol.size === 0) return { shifts: [], unknownInitials: [] };

  // Data rows are hdrRowIdx+2 through hdrRowIdx+9 (8 rows)
  for (let offset = 2; offset <= 9; offset++) {
    const dataRowIdx = hdrRowIdx + offset;
    if (dataRowIdx >= rows.length) break;
    const dataRow = rows[dataRowIdx] as any[];
    if (!dataRow) continue;

    // Column B (idx 1) is the row label
    const labelCell = dataRow[1];
    const label = labelCell?.v ?? labelCell;
    if (!label || typeof label !== "string") continue;

    const pl = rowLabelToPoolLocation(label);
    if (!pl) continue;

    // Process each date column
    for (const [col, date] of datesByCol) {
      const cell = dataRow[col];
      const initials = (cell?.v ?? cell) as string;
      if (!initials || typeof initials !== "string" || initials.trim() === "") continue;

      const trimmed = initials.trim();
      const lastName = INITIALS_MAP[trimmed];
      if (!lastName) {
        if (!unknownInitials.includes(trimmed)) unknownInitials.push(trimmed);
        continue;
      }

      const providerId = providerByLastName.get(lastName.toLowerCase());
      if (providerId === undefined) {
        console.warn(`  Provider not found in DB for initials ${trimmed} → ${lastName}`);
        continue;
      }

      const { startAt, endAt } = buildWindow(date, pl.pool);
      shifts.push({
        pool: pl.pool,
        providerId,
        startAt,
        endAt,
        location: pl.location,
      });
    }
  }

  return { shifts, unknownInitials };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const db = new Database(DB_PATH);
  const now = new Date().toISOString();

  // Load providers (include inactive — historical shifts may reference them)
  const provRows = db.prepare("SELECT id, last_name FROM providers").all() as {
    id: number;
    last_name: string;
  }[];
  const providerByLastName = new Map<string, number>();
  for (const p of provRows) {
    providerByLastName.set(p.last_name.toLowerCase(), p.id);
  }
  console.log(`Loaded ${providerByLastName.size} providers from DB`);

  // Load workbook
  const wb = XLSX.readFile(XLS_PATH, { cellDates: false, dense: false });
  console.log(`Loaded workbook: sheets = ${wb.SheetNames.join(", ")}`);

  // Sheet configs
  const sheetConfigs: { name: string; hdrRows: number[] }[] = [
    {
      name: "2025 Call Schedule",
      hdrRows: [104, 115, 126].map((r) => r - 1), // convert to 0-indexed
    },
    {
      name: "2026 Call Schedule",
      hdrRows: [5, 16, 27, 38, 49, 60, 71, 82, 93, 104, 115, 126].map((r) => r - 1),
    },
  ];

  let allShifts: ShiftRow[] = [];
  const allUnknownInitials: string[] = [];
  let totalRowsPerPool: Record<string, number> = {};

  for (const config of sheetConfigs) {
    const sheet = wb.Sheets[config.name];
    if (!sheet) {
      console.warn(`Sheet "${config.name}" not found`);
      continue;
    }

    // Convert to 2D array of cell objects
    const ref = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
    const rows: any[][] = [];
    for (let r = ref.s.r; r <= ref.e.r; r++) {
      const row: any[] = [];
      for (let c = ref.s.c; c <= ref.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        row.push(sheet[addr] ?? null);
      }
      rows.push(row);
    }

    console.log(`\nSheet: ${config.name}, ${rows.length} rows`);

    for (const hdrRowIdx of config.hdrRows) {
      if (hdrRowIdx >= rows.length) continue;
      // Get month label from header
      const hdrRow = rows[hdrRowIdx];
      let monthLabel = "";
      for (let c = 1; c < hdrRow.length; c++) {
        const cell = hdrRow[c];
        if (cell && cell.v) {
          const d = parseDate(cell.v);
          if (d && d.getFullYear() >= 2025) {
            monthLabel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            break;
          }
        }
      }

      const { shifts, unknownInitials } = parseMonthBlock(rows, hdrRowIdx, providerByLastName);

      console.log(`  Month ${monthLabel || `row${hdrRowIdx + 1}`}: ${shifts.length} shifts parsed`);
      if (unknownInitials.length > 0) {
        console.warn(`  Unknown initials: ${unknownInitials.join(", ")}`);
        for (const u of unknownInitials) {
          if (!allUnknownInitials.includes(u)) allUnknownInitials.push(u);
        }
      }

      for (const s of shifts) {
        totalRowsPerPool[s.pool] = (totalRowsPerPool[s.pool] ?? 0) + 1;
      }
      allShifts.push(...shifts);
    }
  }

  console.log(`\nTotal shifts to insert: ${allShifts.length}`);
  console.log("Per pool:", totalRowsPerPool);

  // ─── Delete existing shifts from 2025-10-01 onwards ───────────────────────
  const deleteResult = db
    .prepare("DELETE FROM shifts WHERE start_at >= '2025-10-01'")
    .run();
  console.log(`\nDeleted ${deleteResult.changes} existing shifts from 2025-10-01 onwards`);

  // ─── Insert new shifts ─────────────────────────────────────────────────────
  const insert = db.prepare(
    `INSERT INTO shifts (pool, provider_id, start_at, end_at, location, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
  );

  const insertMany = db.transaction((rows: ShiftRow[]) => {
    let count = 0;
    for (const s of rows) {
      insert.run(s.pool, s.providerId, s.startAt, s.endAt, s.location, now, now);
      count++;
    }
    return count;
  });

  const inserted = insertMany(allShifts);
  console.log(`Inserted ${inserted} shifts`);

  // ─── Create flags for unknown initials ────────────────────────────────────
  if (allUnknownInitials.length > 0) {
    // Clear existing unknown_initials flags
    db.prepare("DELETE FROM flags WHERE kind = 'unknown_initials' AND source = 'import'").run();

    const insertFlag = db.prepare(
      `INSERT INTO flags (kind, severity, date, pool, location, message, source, resolved, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    );
    for (const u of allUnknownInitials) {
      insertFlag.run(
        "unknown_initials",
        "warn",
        null,
        null,
        null,
        `Unknown initials in XLS: "${u}" — no provider mapping found`,
        "import",
        now,
      );
    }
    console.log(`Created ${allUnknownInitials.length} unknown_initials flags`);
  }

  // ─── Schedule completeness check ──────────────────────────────────────────
  console.log("\n=== Schedule completeness check ===");
  const visiblePools = ["pa", "lakeshore", "mientgr", "grent", "zch", "noch", "thgr", "corewell", "uofm_west"];

  // Clear existing pool-coverage-ending-soon flags
  db.prepare("DELETE FROM flags WHERE kind = 'pool-coverage-ending-soon'").run();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const completenessInsert = db.prepare(
    `INSERT INTO flags (kind, severity, date, pool, location, message, source, resolved, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  );

  for (const pool of visiblePools) {
    const row = db
      .prepare("SELECT MAX(start_at) as lastDate FROM shifts WHERE pool = ?")
      .get(pool) as { lastDate: string | null };
    const lastDate = row?.lastDate ? new Date(row.lastDate) : null;

    if (!lastDate) {
      console.log(`  ${pool}: NO DATA`);
      completenessInsert.run(
        "pool-coverage-ending-soon",
        "error",
        null,
        pool,
        null,
        `${pool} call schedule has NO shifts — please add coverage`,
        "import",
        now,
      );
      continue;
    }

    const lastDateStr = lastDate.toISOString().slice(0, 10);
    const daysFromNow = Math.floor((lastDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    let severity = "info";
    if (daysFromNow < 0) severity = "error";
    else if (daysFromNow <= 14) severity = "error";
    else if (daysFromNow <= 30) severity = "warn";

    console.log(`  ${pool}: last shift ${lastDateStr} (${daysFromNow} days from now) → ${severity}`);

    if (severity === "warn" || severity === "error") {
      completenessInsert.run(
        "pool-coverage-ending-soon",
        severity,
        lastDateStr,
        pool,
        null,
        `${pool} call schedule only completed until ${lastDateStr} (${daysFromNow} days from now)`,
        "import",
        now,
      );
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("\n=== Seed complete ===");
  console.log("Shifts per pool:");
  const poolCounts = db
    .prepare(
      "SELECT pool, COUNT(*) as cnt, MIN(start_at) as first, MAX(start_at) as last FROM shifts GROUP BY pool ORDER BY pool",
    )
    .all() as { pool: string; cnt: number; first: string; last: string }[];
  for (const r of poolCounts) {
    console.log(`  ${r.pool}: ${r.cnt} shifts  [${r.first?.slice(0, 10)} … ${r.last?.slice(0, 10)}]`);
  }

  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
