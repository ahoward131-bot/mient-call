import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Provider, Pool } from "@shared/schema";
import { POOLS, POOL_META } from "@shared/schema";
import { providerDisplay } from "@/lib/shiftUtils";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Redirect } from "wouter";
import { Users } from "lucide-react";

// Hide legacy pools from the Providers roster view.
const HIDDEN_POOLS = new Set<string>(["weekend"]);
const VISIBLE_POOLS = POOLS.filter((p) => !HIDDEN_POOLS.has(p));
// Extra (non-POOL) eligibility labels that can appear on provider badges.
const EXTRA_ELIGIBLE_LABELS: Record<string, string> = {
  peds_backup: "Peds Backup",
};

export default function ProvidersPage() {
  const { user } = useAuth();
  if (!user) return <Redirect to="/login" />;
  if (user.role !== "admin") return <Redirect to="/" />;
  const { data: providers = [], isLoading, isError, error } = useQuery<Provider[]>({ queryKey: ["/api/providers"] });

  const byPool = useMemo(() => {
    const m = new Map<string, Provider[]>();
    for (const p of VISIBLE_POOLS) m.set(p, []);
    for (const p of providers) {
      if (!p.active) continue;
      const key = p.primaryPool;
      if (HIDDEN_POOLS.has(key)) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    }
    return m;
  }, [providers]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Providers
        </h1>
        <p className="text-sm text-muted-foreground">
          Roster grouped by primary call pool. Eligible pools show where a provider can cross-cover.
        </p>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground" data-testid="providers-loading">Loading providers...</div>
      )}
      {isError && (
        <div className="text-sm text-destructive" data-testid="providers-error">
          Failed to load providers: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}
      {!isLoading && !isError && providers.length === 0 && (
        <div className="text-sm text-muted-foreground" data-testid="providers-empty">
          No providers yet.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {VISIBLE_POOLS.map((pool) => {
          const meta = POOL_META[pool];
          const list = byPool.get(pool) || [];
          if (list.length === 0) return null;
          return (
            <Card key={pool} className={`pool-${pool}`} data-testid={`card-providers-${pool}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span
                    className="pool-dot w-2.5 h-2.5 rounded-full"
                    style={{ background: `hsl(var(--pool-${pool}))` }}
                  />
                  {meta.label}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{meta.description}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {list.map((p) => {
                  const eligibleRaw = (() => {
                    try { return JSON.parse(p.eligiblePools || "[]") as string[]; } catch { return []; }
                  })();
                  // Accept either a known Pool or an extra label like peds_backup
                  const eligible = eligibleRaw.filter((e) =>
                    !HIDDEN_POOLS.has(e) && (POOL_META[e as Pool] || EXTRA_ELIGIBLE_LABELS[e])
                  );
                  return (
                    <div key={p.id} className="border-b last:border-b-0 pb-2 last:pb-0">
                      <div className="text-sm font-medium" data-testid={`text-provider-${p.id}`}>
                        {providerDisplay(p)}
                      </div>
                      {eligible.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {eligible.map((e) => (
                            <Badge key={e} variant="secondary" className="text-[10px]">
                              {POOL_META[e as Pool]?.short ?? EXTRA_ELIGIBLE_LABELS[e]}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {p.notes && (
                        <p className="text-xs text-muted-foreground italic mt-1">{p.notes}</p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
