import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Flag } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, AlertCircle, Info, Check, Flag as FlagIcon } from "lucide-react";

type Tab = "unresolved" | "resolved" | "all";

const KIND_META: Record<string, { label: string; order: number }> = {
  missing_coverage: { label: "Missing coverage", order: 1 },
  unknown_initials: { label: "Unknown initials", order: 2 },
  conflict:         { label: "Schedule conflict", order: 3 },
  import_warning:   { label: "Import note", order: 4 },
};

function sevIcon(sev: string) {
  if (sev === "error") return <AlertCircle className="h-4 w-4 text-destructive shrink-0" />;
  if (sev === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
  return <Info className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function sevBadge(sev: string) {
  if (sev === "error") return <Badge variant="destructive">Error</Badge>;
  if (sev === "warn") return <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/20">Warning</Badge>;
  return <Badge variant="secondary">Info</Badge>;
}

function fmtDate(d: string | null) {
  if (!d) return null;
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function FlagsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("unresolved");

  const { data: flags = [], isLoading } = useQuery<Flag[]>({
    queryKey: ["/api/flags", tab],
    queryFn: async () => {
      const q = tab === "all" ? "" : `?resolved=${tab === "resolved"}`;
      const res = await apiRequest("GET", `/api/flags${q}`);
      return res.json();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/flags/${id}/resolve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flags"] });
      toast({ title: "Flag resolved" });
    },
  });

  // Group flags by kind for the UI
  const grouped = useMemo(() => {
    const groups: Record<string, Flag[]> = {};
    for (const f of flags) {
      (groups[f.kind] = groups[f.kind] ?? []).push(f);
    }
    // Within each group, sort by date ascending (nulls first), then by severity
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => {
        if (!a.date && b.date) return -1;
        if (a.date && !b.date) return 1;
        return (a.date ?? "").localeCompare(b.date ?? "");
      });
    }
    return groups;
  }, [flags]);

  const kindsOrdered = Object.keys(grouped).sort(
    (a, b) => (KIND_META[a]?.order ?? 99) - (KIND_META[b]?.order ?? 99),
  );

  const unresolvedCount = tab === "unresolved" ? flags.length : flags.filter((f) => !f.resolved).length;

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FlagIcon className="h-5 w-5 text-primary" />
          <h1 className="text-lg sm:text-xl font-semibold" data-testid="text-page-title">
            Flags
          </h1>
          {tab === "unresolved" && flags.length > 0 && (
            <Badge variant="secondary" data-testid="badge-flag-count">{flags.length}</Badge>
          )}
        </div>
        <div className="flex items-center rounded-md border bg-card">
          {(["unresolved", "resolved", "all"] as Tab[]).map((t) => (
            <Button
              key={t}
              variant={tab === t ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setTab(t)}
              data-testid={`button-tab-${t}`}
              className="capitalize"
            >
              {t}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Data-quality issues from the imported schedule — missing hospital coverage, unknown provider initials, and scheduling conflicts.
        Admins can mark items resolved once reviewed.
      </p>

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!isLoading && flags.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-center">
          <Check className="h-8 w-8 text-primary mx-auto mb-2" />
          <div className="font-medium">No flags</div>
          <div className="text-sm text-muted-foreground mt-1">
            {tab === "unresolved" ? "Everything looks good." : "Nothing to show."}
          </div>
        </div>
      )}

      {kindsOrdered.map((kind) => {
        const items = grouped[kind];
        const meta = KIND_META[kind] ?? { label: kind, order: 99 };
        return (
          <section key={kind} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {meta.label}
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
            </div>
            <div className="rounded-lg border bg-card divide-y">
              {items.map((f) => (
                <div
                  key={f.id}
                  data-testid={`flag-${f.id}`}
                  className={`flex items-start gap-3 p-3 ${f.resolved ? "opacity-60" : ""}`}
                >
                  {sevIcon(f.severity)}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {sevBadge(f.severity)}
                      {f.date && (
                        <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(f.date)}</span>
                      )}
                      {f.pool && (
                        <span className={`pool-${f.pool} pool-pill text-[10px] px-1.5 py-0.5 rounded uppercase font-medium`}>
                          {f.pool}
                        </span>
                      )}
                      {f.resolved && <Badge variant="outline" className="text-xs">Resolved</Badge>}
                    </div>
                    <div className="text-sm">{f.message}</div>
                    {f.location && (
                      <div className="text-xs text-muted-foreground">{f.location}</div>
                    )}
                  </div>
                  {isAdmin && !f.resolved && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveMutation.mutate(f.id)}
                      disabled={resolveMutation.isPending}
                      data-testid={`button-resolve-${f.id}`}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Resolve
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
