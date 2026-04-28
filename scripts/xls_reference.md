# XLS Schedule Reference

Spreadsheet: `/home/user/workspace/Integrated-Call-Schedule.xlsx`

## Sheet Structure

Two sheets:
- `2025 Call Schedule` — Q4 2025 data populated (Oct, Nov, Dec 2025). Uses "NOCH" label.
- `2026 Call Schedule` — Jan–Dec 2026 mostly populated. Uses "Trinity Health - Grand Haven" label (= NOCH = THGH, same hospital).

Per month there's a block of ~10 rows:
- Row with month header date (`B` col = e.g. `2026-04-01`)
- Row with date cells across (e.g. row 38 has dates Apr 1, Apr 2, … in cols C onwards)
- Row with weekday labels Su/Mo/Tu/… (e.g. row 39)
- Then 8 data rows labeled in column B:
  1. `PA`
  2. `MIENT Lakeshore-Practice`
  3. `ZCH`
  4. `Trinity Health - Grand Haven` (2026) or `NOCH` (2025) — same hospital
  5. `MIENT GR Practice`
  6. `GRENT Practice`
  7. `HELEN DEVOS` (2026) or `Corewell` (2025) — peds backup-ish
  8. `Trinity Health St. Mary's` — Trinity GR (THGR)

Month block header rows (the row containing the month date in col B):
- 2026: rows 5, 16, 27, 38, 49, 60, 71, 82, 93, 104, 115, 126 for Jan-Dec respectively
- 2025 (Oct-Dec only populated): rows 104, 115, 126

Data row offsets from month header row: +2 through +9 (i.e. data at hdr+2..hdr+9)
Date row is the header row itself (dates in cols C onwards starting col index 2-based)
DOW row is hdr+1

## Initial → Provider Mapping (from "Provider Key" sheet)

MIENT:
- RJS = Richard Strabbing (Lakeshore)
- SCP = Seth Palmer (Lakeshore)
- TCO = Tracy Orton (Lakeshore)
- ALH = Anthony Howard (MIENT-GR)
- MFF = Michael Foster (MIENT-GR)
- JBR = John Riley (MIENT-GR)
- NCC = Nicholas Cameron (MIENT-GR)
- SSB = Shivani Shah-Becker (MIENT-GR)
- MJK = Michael Keenan (Lakeshore)
- SK = Stefan Kuipers (PA)
- AR = Amy Rogghe (PA)
- CL = Cutler Ludington (PA)
- AK = Aaron King (PA)
- BO = Brad Ophoff (PA)
- AW = Allison Wight (PA)

GRENT:
- GJA = Greg Artz
- AMB = Andy Behler
- DTM = Devon Mistry
- JCT = John Taylor
- EMK = Erin Kevern
- CC = Claudel Cox

ENT Center:
- MRW = Mark R. Winkle (outside coverage)

## Row → Pool mapping

| XLS row label                    | Pool (new)      | Location                                  |
|----------------------------------|-----------------|-------------------------------------------|
| PA                               | `pa`            | null (practice-wide)                      |
| MIENT Lakeshore-Practice         | `lakeshore`     | `MIENT Lakeshore practice`                |
| ZCH                              | `zch`           | `Zeeland Community Hospital`              |
| Trinity Health - Grand Haven     | `noch`          | `Trinity Health Grand Haven` (= NOCH)     |
| NOCH (2025 sheet)                | `noch`          | `Trinity Health Grand Haven`              |
| MIENT GR Practice                | `mientgr`       | null                                      |
| GRENT Practice                   | `grent`         | null                                      |
| HELEN DEVOS (2026 sheet)         | `corewell`      | `Corewell Butterworth/Blodgett/HDVCH`     |
| Corewell (2025 sheet)            | `corewell`      | `Corewell Butterworth/Blodgett/HDVCH`     |
| Trinity Health St. Mary's        | `thgr`          | `Trinity Health St. Mary's`               |

## Call Window Rules

- `pa`, `lakeshore`, `zch`, `noch`, `mientgr`, `grent`, `peds_backup`, `corewell`, `thgr`:
  default 8:00 local → next day 8:00
- `mientgr` and `grent` Thursday shifts extend to Fri 17:00 (existing weekdayWindow() rule)
- `uofm_west`: weekday 8a → next-day 8a (facial trauma call)
- `thgr` shifts may span weekend (the XLS shows one provider for Fri/Sat/Sun on Trinity St Mary's row — combine consecutive days for same provider)
