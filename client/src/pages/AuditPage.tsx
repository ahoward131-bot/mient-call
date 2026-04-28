import { useQuery } from "@tanstack/react-query";
import type { AuditEntry } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";

export default function AuditPage() {
  const { user } = useAuth();
  if (!user) return <Redirect to="/login" />;
  if (user.role !== "admin") return <Redirect to="/" />;
  const { data: entries = [] } = useQuery<AuditEntry[]>({ queryKey: ["/api/audit"] });

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <History className="h-5 w-5 text-primary" /> Audit log
        </h1>
        <p className="text-sm text-muted-foreground">Every schedule change and swap decision is recorded here.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          {entries.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">No activity yet.</div>
          )}
          <div className="divide-y">
            {entries.map((e) => (
              <div key={e.id} className="px-4 py-3 text-sm flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize text-[10px]">{e.action.replace(/\./g, " · ")}</Badge>
                    <span className="font-medium">{e.actorName}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate mt-0.5">{e.details}</div>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {new Date(e.at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
