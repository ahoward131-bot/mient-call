import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Shift, Provider, Pool } from "@shared/schema";
import { POOLS, POOL_META } from "@shared/schema";
import {
  startOfWeek,
  addDays,
  weekdayWindow,
  fmtDateISO,
  fmtDayLabel,
  providerDisplay,
} from "@/lib/shiftUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Trash2, Save } from "lucide-react";
import { Redirect } from "wouter";

/**
 * Weekly schedule builder: shows a Mon–Sun week and one row per pool.
 * Each row shows shifts across days, with quick-assign dropdowns that generate
 * the standard windows from the practice rules (Mon 8a–Tue 8a, etc.).
 */
export default function SchedulePage() {
  const { user } = useAuth();
  if (!user) return <Redirect to="/login" />;
  if (user.role !== "admin") return <Redirect to="/" />;

  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const { data: providers = [] } = useQuery<Provider[]>({ queryKey: ["/api/providers"] });
  const { data: shifts = [] } = useQuery<Shift[]>({ queryKey: ["/api/shifts"] });
  const { toast } = useToast();

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(anchor, i));
  const byPool = useMemo(() => {
    const m = new Map<Pool, Shift[]>();
    for (const p of POOLS) m.set(p, []);
    for (const s of shifts) {
      const start = new Date(s.startAt);
      if (start >= anchor && start < addDays(anchor, 7)) {
        m.get(s.pool as Pool)?.push(s);
      }
    }
    return m;
  }, [shifts, anchor]);

  const createMut = useMutation({
    mutationFn: async (payload: any) => {
      const r = await apiRequest("POST", "/api/shifts", payload);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
    },
    onError: (e: any) => toast({ title: "Failed to create shift", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, ...payload }: any) => {
      const r = await apiRequest("PATCH", `/api/shifts/${id}`, payload);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/shifts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({ title: "Shift deleted" });
    },
  });

  const eligibleProviders = (pool: Pool) =>
    providers.filter((p) => {
      if (!p.active) return false;
      if (p.primaryPool === pool) return true;
      try {
        const arr = JSON.parse(p.eligiblePools || "[]") as string[];
        return arr.includes(pool);
      } catch {
        return false;
      }
    });

  const assignCell = (pool: Pool, day: Date, providerId: number) => {
    // Weekday cells on Mon/Tue/Wed/Thu create weekday window; Friday (index 4) creates weekend
    const dayIdx = Math.floor((day.getTime() - anchor.getTime()) / (24 * 3600 * 1000));
    let start: Date, end: Date, location: string | undefined;
    if (pool === "pa") {
      // PA follows weekday 8a–8a pattern, daily assignment
      const s = new Date(day); s.setHours(8, 0, 0, 0);
      const e = new Date(day); e.setDate(e.getDate() + 1); e.setHours(8, 0, 0, 0);
      start = s; end = e;
    } else if (pool === "lakeshore") {
      // Lakeshore runs weekdays (M-Th)
      if (dayIdx < 0 || dayIdx > 3) {
        toast({ title: "Lakeshore weekday call runs Mon–Thu" });
        return;
      }
      const w = weekdayWindow(anchor, dayIdx as 0 | 1 | 2 | 3, "lakeshore");
      start = w.start;
      end = w.end;
      location = "MIENT Lakeshore Practice";
    } else if (pool === "mientgr" || pool === "grent") {
      if (dayIdx < 0 || dayIdx > 3) {
        toast({ title: `${POOL_META[pool].label} is weekday only` });
        return;
      }
      const w = weekdayWindow(anchor, dayIdx as 0 | 1 | 2 | 3, pool);
      start = w.start;
      end = w.end;
    } else if (pool === "zch") {
      const s = new Date(day); s.setHours(8, 0, 0, 0);
      const e = new Date(day); e.setDate(e.getDate() + 1); e.setHours(8, 0, 0, 0);
      start = s; end = e;
      location = "Zeeland Community Hospital";
    } else if (pool === "noch") {
      const s = new Date(day); s.setHours(8, 0, 0, 0);
      const e = new Date(day); e.setDate(e.getDate() + 1); e.setHours(8, 0, 0, 0);
      start = s; end = e;
      location = "Trinity Health Grand Haven";
    } else if (pool === "thgr") {
      const s = new Date(day); s.setHours(8, 0, 0, 0);
      const e = new Date(day); e.setDate(e.getDate() + 1); e.setHours(8, 0, 0, 0);
      start = s; end = e;
      location = "Trinity Health St. Mary's";
    } else if (pool === "corewell") {
      const s = new Date(day); s.setHours(8, 0, 0, 0);
      const e = new Date(day); e.setDate(e.getDate() + 1); e.setHours(8, 0, 0, 0);
      start = s; end = e;
      location = "Corewell Butterworth/Blodgett/HDVCH";
    } else {
      // uofm_west and others: free-form daily 8a-8a
      const s = new Date(day); s.setHours(8, 0, 0, 0);
      const e = new Date(day); e.setDate(e.getDate() + 1); e.setHours(8, 0, 0, 0);
      start = s; end = e;
    }

    createMut.mutate({
      pool,
      providerId,
      startAt: fmtDateISO(start),
      endAt: fmtDateISO(end),
      location: location ?? null,
      note: null,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Build schedule</h1>
          <p className="text-sm text-muted-foreground">
            Assign providers to pools week-by-week. Shift windows follow the practice rules automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border bg-card">
            <Button variant="ghost" size="icon" onClick={() => setAnchor(addDays(anchor, -7))} data-testid="button-prev-week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(startOfWeek(new Date()))} data-testid="button-this-week">
              This week
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setAnchor(addDays(anchor, 7))} data-testid="button-next-week">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-sm font-medium text-muted-foreground tabular-nums">
            {fmtDayLabel(anchor)} — {fmtDayLabel(addDays(anchor, 6))}
          </div>
        </div>
      </div>

      {/* Grid: rows = pools, columns = days */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-48">Pool</th>
              {weekDays.map((d) => (
                <th key={d.toISOString()} className="text-left px-3 py-2 font-medium text-muted-foreground tabular-nums">
                  {d.toLocaleDateString(undefined, { weekday: "short" })}{" "}
                  <span className="text-foreground">{d.getDate()}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {POOLS.filter((p) => p !== "weekend" && p !== "peds_backup").map((pool) => {
              const meta = POOL_META[pool];
              const poolShifts = byPool.get(pool) || [];
              return (
                <tr key={pool} className="border-b last:border-b-0">
                  <td className="px-3 py-3 align-top">
                    <div className={`pool-${pool} flex items-start gap-2`}>
                      <span className="pool-dot w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" />
                      <div>
                        <div className="font-medium">{meta.label}</div>
                        <div className="text-xs text-muted-foreground">{meta.description}</div>
                      </div>
                    </div>
                  </td>
                  {weekDays.map((d) => {
                    // Which shifts of this pool overlap day d?
                    const cell = poolShifts.find((s) => {
                      const sa = new Date(s.startAt);
                      const ea = new Date(s.endAt);
                      const ds = new Date(d); ds.setHours(0, 0, 0, 0);
                      const de = new Date(ds); de.setDate(de.getDate() + 1);
                      return sa < de && ea > ds;
                    });
                    return (
                      <td key={d.toISOString()} className="px-2 py-2 align-top min-w-[140px]">
                        {cell ? (
                          <CellAssigned
                            shift={cell}
                            providers={providers}
                            onChange={(pid) => updateMut.mutate({ id: cell.id, providerId: pid })}
                            onDelete={() => deleteMut.mutate(cell.id)}
                          />
                        ) : (
                          <Select
                            onValueChange={(v) => assignCell(pool, d, Number(v))}
                          >
                            <SelectTrigger data-testid={`select-assign-${pool}-${d.toISOString().slice(0, 10)}`} className="h-8 text-xs">
                              <SelectValue placeholder="+ assign" />
                            </SelectTrigger>
                            <SelectContent>
                              {eligibleProviders(pool).map((p) => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                  {providerDisplay(p)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shift timing rules</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1.5">
          <p>• Weekday call (Lakeshore, MIENT GR, GRENT, PA): <span className="text-foreground font-medium">Mon 8a → Tue 8a</span>, and so on through Wed 8a → Thu 8a.</p>
          <p>• Thursday weekday call runs <span className="text-foreground font-medium">Thu 8a → Fri 5p</span>, then hands off to weekend.</p>
          <p>• Weekend pool covers <span className="text-foreground font-medium">Fri 5p → Mon 8a</span>, including Trinity Health Grand Rapids ER.</p>
          <p>• Lakeshore weekday call defaults to <span className="text-foreground font-medium">Trinity Health Grand Haven</span> as the location.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function CellAssigned({
  shift,
  providers,
  onChange,
  onDelete,
}: {
  shift: Shift;
  providers: Provider[];
  onChange: (pid: number) => void;
  onDelete: () => void;
}) {
  return (
    <div className={`pool-${shift.pool} pool-pill rounded-md px-2 py-1.5 flex items-center justify-between gap-2`}>
      <Select value={String(shift.providerId)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger data-testid={`select-provider-${shift.id}`} className="h-7 text-xs border-0 bg-transparent p-0 shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providers.filter((p) => p.active).map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {providerDisplay(p)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDelete} data-testid={`button-delete-shift-${shift.id}`} aria-label="Delete shift">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
