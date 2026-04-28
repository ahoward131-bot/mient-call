import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Shift, Provider, Pool, Flag } from "@shared/schema";
import { POOLS, POOL_META } from "@shared/schema";
import { Link } from "wouter";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  startOfMonth,
  startOfWeek,
  addDays,
  addMonths,
  monthLabel,
  sameDay,
  providerDisplay,
  fmtDayLabel,
  groupShiftsForDay,
  fridayWeekendHandoff,
  shortLocation,
  type DisplayShift,
} from "@/lib/shiftUtils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

type View = "month" | "week" | "agenda";

// Shared display order for pools across all views (month/week/agenda).
// Practice rows first, then hospital rows; weekend + peds_backup are hidden.
const POOL_DISPLAY_ORDER: Record<string, number> = {
  pa: 0,
  grent: 1,
  lakeshore: 2,
  mientgr: 3,
  zch: 4,
  noch: 5,
  thgr: 6,
  corewell: 7,
  uofm_west: 8,
  weekend: 99,
  peds_backup: 99,
};

export default function CalendarPage() {
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<View>("month");
  const [userPickedView, setUserPickedView] = useState(false);

  // Auto-switch to agenda on mobile unless the user has explicitly chosen a view.
  useEffect(() => {
    if (userPickedView) return;
    setView(isMobile ? "agenda" : "month");
  }, [isMobile, userPickedView]);

  const [enabledPools, setEnabledPools] = useState<Record<Pool, boolean>>(() =>
    Object.fromEntries(POOLS.map((p) => [p, true])) as Record<Pool, boolean>,
  );
  const [selectedShift, setSelectedShift] = useState<DisplayShift | null>(null);

  const [showAllPools, setShowAllPools] = useState(false);

  const { data: shifts = [] } = useQuery<Shift[]>({ queryKey: ["/api/shifts"] });
  const { data: providers = [] } = useQuery<Provider[]>({ queryKey: ["/api/providers"] });
  const { data: flags = [] } = useQuery<Flag[]>({
    queryKey: ["/api/flags", "unresolved"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/flags?resolved=false");
      return r.json();
    },
  });
  const provById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);

  // Map YYYY-MM-DD → ZCH coverage gap flags (THGH is intentionally not flagged).
  const flagsByDate = useMemo(() => {
    const m = new Map<string, Flag[]>();
    for (const f of flags) {
      if (!f.date || f.kind !== "missing_coverage") continue;
      if (!f.location?.includes("Zeeland")) continue;
      if (!m.has(f.date)) m.set(f.date, []);
      m.get(f.date)!.push(f);
    }
    return m;
  }, [flags]);

  const zchFlags = flags.filter(
    (f) => f.kind === "missing_coverage" && f.location?.includes("Zeeland"),
  );

  // Completeness flags: pool-coverage-ending-soon warnings
  const completenessFlags = flags.filter(
    (f) => f.kind === "pool-coverage-ending-soon" || f.severity === "error"
  ).filter(
    (f) => f.kind === "pool-coverage-ending-soon"
  );

  const visibleShifts = useMemo(
    () => shifts.filter((s) => s.pool !== "weekend" && s.pool !== "peds_backup" && enabledPools[s.pool as Pool]),
    [shifts, enabledPools],
  );

  // Practice-coverage gaps: warn when ANY practice pool (PA, lakeshore, MIENT-GR, GRENT)
  // has no provider assigned on a given day. Only checks days within the currently
  // populated window (first → last shift date) to avoid flagging every future date forever.
  const PRACTICE_POOLS = ["pa", "lakeshore", "mientgr", "grent"] as const;
  const practiceGapsByDate = useMemo(() => {
    const gaps = new Map<string, string[]>();
    if (shifts.length === 0) return gaps;

    // Derive YYYY-MM-DD from startAt (local) so it matches what the calendar renders.
    const dateFromIso = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    const byDatePool = new Map<string, Set<string>>();
    for (const s of shifts) {
      if (!s.startAt) continue;
      const d = dateFromIso(s.startAt);
      if (!byDatePool.has(d)) byDatePool.set(d, new Set());
      byDatePool.get(d)!.add(s.pool);
    }
    // Only check dates up to the last populated date per pool (avoid flagging forever).
    const lastDateByPool: Record<string, string> = {};
    for (const p of PRACTICE_POOLS) lastDateByPool[p] = "";
    for (const s of shifts) {
      if (!s.startAt) continue;
      if ((PRACTICE_POOLS as readonly string[]).includes(s.pool)) {
        const d = dateFromIso(s.startAt);
        if (d > lastDateByPool[s.pool]) lastDateByPool[s.pool] = d;
      }
    }
    for (const [date, pools] of byDatePool) {
      const missing: string[] = [];
      for (const p of PRACTICE_POOLS) {
        if (lastDateByPool[p] && date <= lastDateByPool[p] && !pools.has(p)) {
          missing.push(POOL_META[p as Pool].label);
        }
      }
      if (missing.length) gaps.set(date, missing);
    }
    return gaps;
  }, [shifts]);

  const dateKeyFor = (day: Date) =>
    `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;

  // Build grid.
  const gridStart =
    view === "month"
      ? startOfWeek(startOfMonth(cursor))
      : view === "week"
      ? startOfWeek(cursor)
      : cursor;
  const gridDays = view === "month" ? 42 : view === "week" ? 7 : 14;
  const days = Array.from({ length: gridDays }, (_, i) => addDays(gridStart, i));

  const pickView = (v: View) => {
    setUserPickedView(true);
    setView(v);
  };

  const stepBack = () => {
    if (view === "month") setCursor(addMonths(cursor, -1));
    else if (view === "week") setCursor(addDays(cursor, -7));
    else setCursor(addDays(cursor, -14));
  };
  const stepForward = () => {
    if (view === "month") setCursor(addMonths(cursor, 1));
    else if (view === "week") setCursor(addDays(cursor, 7));
    else setCursor(addDays(cursor, 14));
  };

  const headerLabel =
    view === "month"
      ? monthLabel(cursor)
      : view === "week"
      ? `Week of ${fmtDayLabel(startOfWeek(cursor))}`
      : `From ${fmtDayLabel(cursor)}`;

  const visiblePools = POOLS.filter((p) => p !== "weekend" && p !== "peds_backup");
  const practiceGapCount = practiceGapsByDate.size;

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
      {/* Header — single row: title + nav + view toggle, all inline */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <CalendarIcon className="h-7 w-7 sm:h-8 sm:w-8 text-primary shrink-0" />
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate" data-testid="text-page-title">
            {headerLabel}
          </h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          <div className="flex items-center rounded-lg border bg-card shadow-sm">
            <Button variant="ghost" size="icon" onClick={stepBack} data-testid="button-prev" aria-label="Previous" className="h-11 w-11">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())} data-testid="button-today" className="h-11 px-3.5 text-sm font-medium">
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={stepForward} data-testid="button-next" aria-label="Next" className="h-11 w-11">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex items-center rounded-lg border bg-card shadow-sm">
            <Button
              variant={view === "agenda" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => pickView("agenda")}
              data-testid="button-view-agenda"
              className="h-11 px-4 text-sm font-medium"
            >
              List
            </Button>
            <Button
              variant={view === "week" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => pickView("week")}
              data-testid="button-view-week"
              className="h-11 px-4 text-sm font-medium"
            >
              Week
            </Button>
            <Button
              variant={view === "month" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => pickView("month")}
              data-testid="button-view-month"
              className="h-11 px-4 text-sm font-medium"
            >
              Month
            </Button>
          </div>
        </div>
      </div>

      {/* Compact alerts strip: practice gaps (red) · ZCH gaps (amber) · coverage ending (yellow) */}
      {(practiceGapCount > 0 || zchFlags.length > 0 || completenessFlags.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {practiceGapCount > 0 && (
            <Link
              href="/flags"
              data-testid="banner-practice-gaps"
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1 hover-elevate"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
              <span className="font-medium text-destructive">{practiceGapCount} practice gap{practiceGapCount === 1 ? "" : "s"}</span>
              <span className="text-muted-foreground hidden sm:inline">· PA / Lakeshore / MIENT-GR / GRENT</span>
            </Link>
          )}
          {zchFlags.length > 0 && (
            <Link
              href="/flags"
              data-testid="banner-flags"
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 hover-elevate"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="font-medium text-amber-900 dark:text-amber-200">{zchFlags.length} ZCH gap{zchFlags.length === 1 ? "" : "s"}</span>
            </Link>
          )}
          {completenessFlags.length > 0 && (
            <Link
              href="/flags"
              data-testid="banner-completeness"
              className="inline-flex items-center gap-1.5 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1 hover-elevate"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 shrink-0" />
              <span className="font-medium text-yellow-900 dark:text-yellow-200">Schedule ending soon</span>
              <span className="text-muted-foreground hidden sm:inline">· {completenessFlags.length} pool{completenessFlags.length === 1 ? "" : "s"}</span>
            </Link>
          )}
        </div>
      )}

      {/* Pool legend — compact, collapsible when many pools */}
      <div className="rounded-md border bg-card/50 px-2.5 py-2">
        <div className="flex items-start gap-2">
          <div className="flex flex-wrap gap-1.5 flex-1" role="group" aria-label="Filter by pool">
            {(showAllPools ? visiblePools : visiblePools.slice(0, 6)).map((pool) => {
              const meta = POOL_META[pool];
              const on = enabledPools[pool];
              return (
                <button
                  key={pool}
                  type="button"
                  data-testid={`toggle-pool-${pool}`}
                  onClick={() => setEnabledPools((s) => ({ ...s, [pool]: !s[pool] }))}
                  className={`pool-${pool} inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border transition-all ${
                    on ? "opacity-100" : "opacity-40"
                  } hover-elevate`}
                  style={{
                    borderColor: on ? `hsl(var(--pool-${pool}) / 0.4)` : "hsl(var(--border))",
                    background: on ? `hsl(var(--pool-${pool}) / 0.10)` : "transparent",
                  }}
                  title={meta.description}
                >
                  <span className="pool-dot inline-block w-1.5 h-1.5 rounded-full" />
                  <span className="font-medium whitespace-nowrap">{meta.short || meta.label}</span>
                </button>
              );
            })}
          </div>
          {visiblePools.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAllPools((s) => !s)}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 shrink-0 py-1"
              data-testid="toggle-all-pools"
            >
              {showAllPools ? (
                <>Less <ChevronUp className="h-3 w-3" /></>
              ) : (
                <>+{visiblePools.length - 6} <ChevronDown className="h-3 w-3" /></>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Agenda view — iCal-style list */}
      {view === "agenda" && (
        <div className="rounded-lg border bg-card overflow-hidden">
          {days.map((day, dayIdx) => {
            const isToday = sameDay(day, new Date());
            const dayShifts = groupShiftsForDay(visibleShifts, day).sort((a, b) => {
              const pa = POOL_DISPLAY_ORDER[a.pool] ?? 99;
              const pb = POOL_DISPLAY_ORDER[b.pool] ?? 99;
              if (pa !== pb) return pa - pb;
              const an = provById.get(a.providerId)?.lastName ?? "";
              const bn = provById.get(b.providerId)?.lastName ?? "";
              return an.localeCompare(bn);
            });
            const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
              day.getDate(),
            ).padStart(2, "0")}`;
            const dayFlags = flagsByDate.get(dateKey) ?? [];
            const hasZCH = dayFlags.some((f) => f.location?.includes("Zeeland"));
            const practiceGaps = practiceGapsByDate.get(dateKey);
            return (
              <div
                key={day.toISOString()}
                data-testid={`day-${day.toISOString().slice(0, 10)}`}
                className={`flex gap-4 px-3 sm:px-4 py-3 ${dayIdx > 0 ? "border-t" : ""} ${
                  isToday ? "bg-primary/5" : ""
                }`}
              >
                {/* Left: date column */}
                <div className="w-14 shrink-0 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    {day.toLocaleDateString(undefined, { weekday: "short" })}
                  </div>
                  <div
                    className={`text-2xl font-semibold tabular-nums leading-none mt-0.5 ${
                      isToday ? "text-primary" : ""
                    }`}
                  >
                    {day.getDate()}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {day.toLocaleDateString(undefined, { month: "short" })}
                  </div>
                </div>
                {/* Right: events */}
                <div className="flex-1 min-w-0">
                  {practiceGaps && (
                    <div className="mb-1.5 flex items-center gap-1 text-[11px] text-destructive font-medium" data-testid={`practice-gap-${dateKey}`}>
                      <AlertTriangle className="h-3 w-3" />
                      <span>No coverage: {practiceGaps.join(", ")}</span>
                    </div>
                  )}
                  {hasZCH && (
                    <div className="mb-1.5 flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" />
                      <span>No ZCH coverage</span>
                    </div>
                  )}
                  {dayShifts.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic pt-1">No shifts</div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {dayShifts.map((s) => {
                        const prov = provById.get(s.providerId);
                        const meta = POOL_META[s.pool];
                        const locs = s.locations.map(shortLocation).join(", ");
                        const outgoingId = (s.pool === "mientgr" || s.pool === "grent")
                          ? fridayWeekendHandoff(visibleShifts, day, s, provById)
                          : undefined;
                        const outgoing = outgoingId !== undefined && outgoingId !== s.providerId
                          ? provById.get(outgoingId)
                          : undefined;
                        return (
                          <button
                            key={s.id}
                            onClick={() => setSelectedShift(s)}
                            data-testid={`shift-${s.id}`}
                            className="flex items-stretch gap-2.5 text-left text-sm rounded px-2 py-1.5 hover-elevate"
                          >
                            <span
                              className="w-1 self-stretch rounded-full shrink-0"
                              style={{ background: `hsl(var(--pool-${s.pool}))` }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="font-medium">
                                  {outgoing ? (
                                    <>
                                      {outgoing.lastName} / {prov?.lastName ?? "—"}
                                      <span className="text-xs text-muted-foreground font-normal"> (@5p)</span>
                                    </>
                                  ) : (
                                    providerDisplay(prov)
                                  )}
                                </span>
                                <span className="text-xs text-muted-foreground">{meta.short}</span>
                              </div>
                              {locs && (
                                <div className="text-xs text-muted-foreground truncate">{locs}</div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Month view — iCal style */}
      {view === "month" && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-[10px] sm:text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center"
              >
                {d.slice(0, isMobile ? 1 : 3)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 grid-rows-6">
            {days.map((day) => {
              const inMonth = day.getMonth() === cursor.getMonth();
              const isToday = sameDay(day, new Date());
              const dayShifts = groupShiftsForDay(visibleShifts, day).sort((a, b) => {
                const pa = POOL_DISPLAY_ORDER[a.pool] ?? 99;
                const pb = POOL_DISPLAY_ORDER[b.pool] ?? 99;
                if (pa !== pb) return pa - pb;
                const an = provById.get(a.providerId)?.lastName ?? "";
                const bn = provById.get(b.providerId)?.lastName ?? "";
                return an.localeCompare(bn);
              });
              const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
                day.getDate(),
              ).padStart(2, "0")}`;
              const dayFlags = flagsByDate.get(dateKey) ?? [];
              const hasZCH = inMonth && dayFlags.some((f) => f.location?.includes("Zeeland"));
              const practiceGaps = inMonth ? practiceGapsByDate.get(dateKey) : undefined;
              const maxShown = isMobile ? 4 : 4;

              const openDayInWeek = () => {
                pickView("week");
                setCursor(day);
              };
              return (
                <div
                  key={day.toISOString()}
                  data-testid={`day-${day.toISOString().slice(0, 10)}`}
                  onClick={openDayInWeek}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDayInWeek();
                    }
                  }}
                  title="Open in week view"
                  className={`min-h-[96px] sm:min-h-[120px] border-b border-r last:border-r-0 p-1 sm:p-1.5 flex flex-col gap-1 cursor-pointer transition-colors hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${
                    inMonth ? "bg-card" : "bg-muted/20"
                  } ${practiceGaps ? "ring-1 ring-inset ring-destructive/30" : ""}`}
                >
                  {/* Date header */}
                  <div className="flex items-center justify-between px-0.5 min-h-[22px]">
                    {isToday ? (
                      <span className="inline-grid place-items-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold tabular-nums">
                        {day.getDate()}
                      </span>
                    ) : (
                      <span
                        className={`text-[11px] sm:text-xs font-medium tabular-nums px-1 ${
                          inMonth ? "text-foreground" : "text-muted-foreground/60"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                    )}
                    <div className="flex items-center gap-0.5">
                      {practiceGaps && (
                        <span
                          className="text-destructive"
                          title={`No coverage: ${practiceGaps.join(", ")}`}
                          data-testid={`practice-gap-${dateKey}`}
                        >
                          <AlertTriangle className="h-3 w-3" />
                        </span>
                      )}
                      {hasZCH && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400" title="No ZCH coverage">
                          ⚠
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Events: pool dot + last name + pool tag */}
                  <div className="flex flex-col gap-[2px] overflow-hidden">
                    {dayShifts.slice(0, maxShown).map((s) => {
                      const prov = provById.get(s.providerId);
                      const meta = POOL_META[s.pool];
                      const name = prov?.lastName ?? "—";
                      const locs = s.locations.map(shortLocation).join(", ");
                      const outgoingId = (s.pool === "mientgr" || s.pool === "grent")
                        ? fridayWeekendHandoff(visibleShifts, day, s, provById)
                        : undefined;
                      const outgoing = outgoingId !== undefined && outgoingId !== s.providerId
                        ? provById.get(outgoingId)
                        : undefined;
                      const displayName = outgoing ? `${outgoing.lastName} / ${name}` : name;
                      const titleName = outgoing
                        ? `${providerDisplay(outgoing)} until 5p, then ${providerDisplay(prov)}`
                        : providerDisplay(prov);
                      return (
                        <button
                          key={s.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedShift(s);
                          }}
                          data-testid={`shift-${s.id}`}
                          className="flex items-center gap-1 sm:gap-1.5 text-left text-[10px] sm:text-[11px] leading-tight rounded px-0.5 sm:px-1 py-[2px] hover-elevate"
                          title={`${meta.label} · ${titleName}${locs ? ` · ${locs}` : ""}`}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: `hsl(var(--pool-${s.pool}))` }}
                          />
                          <span className="font-medium truncate">{displayName}</span>
                          {outgoing && (
                            <span className="text-muted-foreground shrink-0 hidden sm:inline">@5p</span>
                          )}
                          <span className="text-muted-foreground truncate hidden sm:inline">{meta.short}</span>
                        </button>
                      );
                    })}
                    {dayShifts.length > maxShown && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDayInWeek();
                        }}
                        className="text-[14px] leading-none text-muted-foreground hover:text-foreground px-1 text-left tracking-widest"
                        title={`${dayShifts.length - maxShown} more — tap to open week view`}
                        aria-label={`${dayShifts.length - maxShown} more shifts, open in week view`}
                        data-testid={`more-${dateKey}`}
                      >
                        •••
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week view — hour-based time grid (Google/Apple Calendar style) */}
      {view === "week" && (
        <WeekGrid
          days={days}
          visibleShifts={visibleShifts}
          flagsByDate={flagsByDate}
          practiceGapsByDate={practiceGapsByDate}
          provById={provById}
          onSelectShift={setSelectedShift}
          focusDay={cursor}
        />
      )}

      {/* Shift detail dialog */}
      <Dialog open={!!selectedShift} onOpenChange={(o) => !o && setSelectedShift(null)}>
        <DialogContent>
          {selectedShift && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ background: `hsl(var(--pool-${selectedShift.pool}))` }}
                  />
                  {POOL_META[selectedShift.pool].label}
                </DialogTitle>
                <DialogDescription>{POOL_META[selectedShift.pool].description}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">On call</span>
                  <span className="font-medium" data-testid="text-shift-provider">
                    {providerDisplay(provById.get(selectedShift.providerId))}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Starts</span>
                  <span className="font-medium tabular-nums">
                    {new Date(selectedShift.startAt).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Ends</span>
                  <span className="font-medium tabular-nums">
                    {new Date(selectedShift.endAt).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {selectedShift.locations.length > 0 && (
                  <div className="border-b pb-2">
                    <div className="text-muted-foreground mb-1">Covering</div>
                    <ul className="space-y-0.5">
                      {selectedShift.locations.map((loc) => (
                        <li key={loc} className="font-medium">
                          • {loc}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedShift(null)} data-testid="button-close-shift">
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Week view: tall day columns, each a clean vertical list of shifts.
 *
 * Call shifts are almost all 24-hour blocks, so we don't try to position them
 * on an hour grid. Each day column is a simple stack of rows — one row per
 * shift — showing a tiny pool-colored dot, the provider's last name, and the
 * location. Rows are grouped by pool (practice call first, then hospital) and
 * light horizontal rules separate the groups so the eye can scan quickly.
 */
function WeekGrid({
  days,
  visibleShifts,
  flagsByDate,
  practiceGapsByDate,
  provById,
  onSelectShift,
  focusDay,
}: {
  days: Date[];
  visibleShifts: Shift[];
  flagsByDate: Map<string, Flag[]>;
  practiceGapsByDate: Map<string, string[]>;
  provById: Map<number, Provider>;
  onSelectShift: (s: DisplayShift) => void;
  focusDay?: Date;
}) {
  const mobileStripRef = useRef<HTMLDivElement | null>(null);

  // When focusDay changes (e.g. user tapped ••• on a month cell), scroll the
  // mobile strip so that day's column is the left-most visible one.
  useEffect(() => {
    const el = mobileStripRef.current;
    if (!el || !focusDay) return;
    const idx = days.findIndex((d) => sameDay(d, focusDay));
    if (idx < 0) return;
    // Each day column is 40% of the strip's clientWidth.
    const target = Math.round(idx * el.clientWidth * 0.4);
    el.scrollTo({ left: target, behavior: "smooth" });
  }, [focusDay, days]);
  const today = new Date();

  // Use shared POOL_DISPLAY_ORDER (module-level) — same order as month view.
  const POOL_ORDER = POOL_DISPLAY_ORDER;

  // Per-day sorted shift list.
  const perDay = days.map((day) => {
    const dayGroups = groupShiftsForDay(visibleShifts, day).slice().sort((a, b) => {
      const pa = POOL_ORDER[a.pool] ?? 99;
      const pb = POOL_ORDER[b.pool] ?? 99;
      if (pa !== pb) return pa - pb;
      const an = provById.get(a.providerId)?.lastName ?? "";
      const bn = provById.get(b.providerId)?.lastName ?? "";
      return an.localeCompare(bn);
    });
    return { day, shifts: dayGroups };
  });

  // Each day column is at least MIN_DAY_HEIGHT_PX tall so "empty" days still feel balanced.
  const MIN_DAY_HEIGHT_PX = 520;

  // Build the per-day column renderer once; used for both desktop grid and mobile swipe strip.
  const renderDayColumn = ({ day, shifts }: { day: Date; shifts: DisplayShift[] }) => {
          const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
            day.getDate(),
          ).padStart(2, "0")}`;
          const dayFlags = flagsByDate.get(dateKey) ?? [];
          const hasZCH = dayFlags.some((f) => f.location?.includes("Zeeland"));
          const practiceGaps = practiceGapsByDate.get(dateKey);
          const isToday = sameDay(day, today);

          return (
            <div
              key={day.toISOString()}
              className={`border-l first:border-l-0 p-1.5 flex flex-col gap-1 ${isToday ? "bg-primary/5" : ""} ${practiceGaps ? "ring-1 ring-inset ring-destructive/30" : ""}`}
              style={{ minHeight: `${MIN_DAY_HEIGHT_PX}px` }}
            >
              {practiceGaps && (
                <div
                  className="flex items-center gap-1 text-[10px] text-destructive bg-destructive/10 border border-destructive/30 rounded px-1.5 py-0.5 font-medium"
                  title={`No coverage: ${practiceGaps.join(", ")}`}
                  data-testid={`practice-gap-${dateKey}`}
                >
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span className="truncate">No: {practiceGaps.map((l) => l.replace("MIENT-", "").replace(" Practice", "")).join(", ")}</span>
                </div>
              )}
              {hasZCH && (
                <div className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span className="truncate">No ZCH coverage</span>
                </div>
              )}
              {shifts.length === 0 && !hasZCH && (
                <div className="text-[11px] text-muted-foreground/60 italic px-1 py-2">
                  No call
                </div>
              )}
              {shifts.map((s, idx) => {
                const prov = provById.get(s.providerId);
                const meta = POOL_META[s.pool];
                const name = prov?.lastName ?? "—";
                const locs = s.locations.map(shortLocation).join(", ");
                const prev = shifts[idx - 1];
                const dividerAbove = prev && prev.pool !== s.pool;
                const outgoingId = (s.pool === "mientgr" || s.pool === "grent")
                  ? fridayWeekendHandoff(visibleShifts, day, s, provById)
                  : undefined;
                const outgoing = outgoingId !== undefined && outgoingId !== s.providerId
                  ? provById.get(outgoingId)
                  : undefined;
                const displayName = outgoing ? `${outgoing.lastName} / ${name}` : name;
                const titleName = outgoing
                  ? `${providerDisplay(outgoing)} until 5p, then ${providerDisplay(prov)}`
                  : providerDisplay(prov);
                return (
                  <div key={s.id} className={dividerAbove ? "pt-1 border-t border-border/50" : ""}>
                    <button
                      onClick={() => onSelectShift(s)}
                      data-testid={`shift-${s.id}`}
                      className="w-full text-left rounded px-1.5 py-1 hover:bg-muted/60 transition-colors flex items-start gap-1.5"
                      title={`${meta.label} · ${titleName}${locs ? ` · ${locs}` : ""}`}
                    >
                      <span
                        className="mt-[5px] h-2 w-2 rounded-full shrink-0"
                        style={{ background: `hsl(var(--pool-${s.pool}))` }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold leading-tight truncate">
                          {displayName}
                          {outgoing && <span className="text-muted-foreground font-normal"> @5p</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground leading-tight truncate">
                          {locs || meta.short}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          );
  };

  const renderDayHeader = (day: Date) => {
    const isToday = sameDay(day, today);
    return (
      <div className="px-2 py-2 text-center">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {day.toLocaleDateString(undefined, { weekday: "short" })}
        </div>
        <div
          className={`mt-0.5 inline-grid place-items-center w-7 h-7 rounded-full text-sm font-semibold tabular-nums ${
            isToday ? "bg-primary text-primary-foreground" : "text-foreground"
          }`}
        >
          {day.getDate()}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* DESKTOP / TABLET: 7-column grid */}
      <div className="hidden md:block">
        <div
          className="grid border-b bg-muted/30"
          style={{ gridTemplateColumns: `repeat(7, minmax(0, 1fr))` }}
        >
          {days.map((day) => (
            <div key={day.toISOString()} className="border-l first:border-l-0">
              {renderDayHeader(day)}
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `repeat(7, minmax(0, 1fr))` }}>
          {perDay.map((pd) => (
            <div key={pd.day.toISOString()} className="contents">
              {renderDayColumn(pd)}
            </div>
          ))}
        </div>
      </div>

      {/* MOBILE: horizontal swipe, ~2.5 days visible per screen so scroll is implied */}
      <div
        ref={mobileStripRef}
        className="md:hidden overflow-x-auto snap-x snap-mandatory scroll-smooth overscroll-x-contain"
        data-testid="week-mobile-strip"
        style={{ WebkitOverflowScrolling: "touch" as const }}
      >
        <div className="flex">
          {perDay.map((pd) => {
            const isToday = sameDay(pd.day, today);
            return (
              <div
                key={pd.day.toISOString()}
                className="snap-start shrink-0 border-l first:border-l-0"
                style={{ flex: "0 0 40%", minWidth: "40%" }}
              >
                <div className={`border-b bg-muted/30 ${isToday ? "bg-primary/10" : ""}`}>
                  {renderDayHeader(pd.day)}
                </div>
                {renderDayColumn(pd)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
