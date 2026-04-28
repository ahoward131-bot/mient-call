import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FileText, Download, FileSpreadsheet, Lock } from "lucide-react";

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonthKey() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map((n) => parseInt(n, 10));
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

type ReportKind = "trinity-gr" | "uofm-west";

const REPORT_META: Record<ReportKind, { title: string; subtitle: string; filenamePrefix: string }> = {
  "trinity-gr": {
    title: "Trinity Health GR monthly call log",
    subtitle:
      "Weekend-pool call days covering Trinity Health St. Mary's ER, normalized to 8a–8a. Outside coverage (Dr. Winkle) is excluded. Submit to Trinity for reimbursement.",
    filenamePrefix: "trinity-gr-call-log",
  },
  "uofm-west": {
    title: "UofM Health West facial trauma call",
    subtitle: "UofM Health West facial trauma call days for the month, normalized to 8a–8a. Submit for reimbursement.",
    filenamePrefix: "uofm-west-facial-trauma",
  },
};

export default function ReportsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [month, setMonth] = useState<string>(prevMonthKey());
  const [busy, setBusy] = useState<ReportKind | null>(null);

  const isAdmin = user?.role === "admin";

  const monthOptions = useMemo(() => {
    // 18 months: 12 back + current + 5 forward
    const opts: { key: string; label: string }[] = [];
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 12);
    for (let i = 0; i < 18; i++) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      opts.push({ key, label: monthLabel(key) });
      d.setMonth(d.getMonth() + 1);
    }
    return opts;
  }, []);

  async function downloadReport(kind: ReportKind) {
    if (!isAdmin) return;
    setBusy(kind);
    try {
      const res = await apiRequest("GET", `/api/reports/${kind}?month=${encodeURIComponent(month)}`);
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${REPORT_META[kind].filenamePrefix}-${month}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "Report exported",
        description: `${REPORT_META[kind].title} for ${monthLabel(month)} downloaded.`,
      });
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message ?? "Could not generate report.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4" /> Admin only
            </CardTitle>
            <CardDescription>
              Reimbursement reports are only available to admins. Sign in with an admin account to export monthly call
              logs.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> Reimbursement reports
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Export monthly call logs as CSV. Open in Excel, Numbers, or Google Sheets — or attach directly to a
          reimbursement submission.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report month</CardTitle>
          <CardDescription>Choose the month to include in the report.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="report-month" className="text-xs">
                Month
              </Label>
              <select
                id="report-month"
                data-testid="select-report-month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[200px]"
              >
                {monthOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMonth(prevMonthKey())}
                data-testid="button-month-previous"
              >
                Previous month
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMonth(currentMonthKey())}
                data-testid="button-month-current"
              >
                This month
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <ReportCard
          title={REPORT_META["trinity-gr"].title}
          subtitle={REPORT_META["trinity-gr"].subtitle}
          accent="hsl(22 82% 48%)"
          monthLabel={monthLabel(month)}
          busy={busy === "trinity-gr"}
          onExport={() => downloadReport("trinity-gr")}
          testId="button-export-trinity-gr"
        />
        <ReportCard
          title={REPORT_META["uofm-west"].title}
          subtitle={REPORT_META["uofm-west"].subtitle}
          accent="hsl(300 55% 48%)"
          monthLabel={monthLabel(month)}
          busy={busy === "uofm-west"}
          onExport={() => downloadReport("uofm-west")}
          testId="button-export-uofm-west"
        />
      </div>

      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-sm">What's in the report</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Each call day is normalized to 8:00a → 8:00a next day (24 hours).</p>
          <p className="font-medium text-foreground pt-1">Summary by Provider (top of CSV)</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>Provider (last name, first, credentials)</li>
            <li>Total Hours</li>
            <li>Days Responsible</li>
          </ul>
          <p className="font-medium text-foreground pt-1">Detail (below summary)</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>Call Day, Provider, Location</li>
            <li>Start (YYYY-MM-DD 08:00), End (next day 08:00)</li>
            <li>Hours (24), Notes</li>
          </ul>
          <p className="pt-1">
            Trinity GR excludes Dr. Winkle (outside coverage, not in the practice).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportCard({
  title,
  subtitle,
  accent,
  monthLabel,
  busy,
  onExport,
  testId,
}: {
  title: string;
  subtitle: string;
  accent: string;
  monthLabel: string;
  busy: boolean;
  onExport: () => void;
  testId: string;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 h-10 w-10 rounded-md grid place-items-center shrink-0"
            style={{ background: accent, color: "white" }}
          >
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base leading-snug">{title}</CardTitle>
            <CardDescription className="mt-1 text-xs leading-relaxed">{subtitle}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-end gap-3">
        <div className="text-xs text-muted-foreground">
          Exporting: <span className="font-medium text-foreground">{monthLabel}</span>
        </div>
        <Button
          type="button"
          onClick={onExport}
          disabled={busy}
          className="w-full"
          data-testid={testId}
        >
          <Download className="h-4 w-4 mr-2" />
          {busy ? "Generating…" : "Export CSV"}
        </Button>
      </CardContent>
    </Card>
  );
}
