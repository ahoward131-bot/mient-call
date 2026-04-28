import { POOLS, POOL_META } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Rss } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiBase } from "@/lib/queryClient";

function absoluteUrl(path: string) {
  return `${window.location.origin}${apiBase()}${path}`;
}

function CopyRow({ label, description, url }: { label: string; description: string; url: string }) {
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap items-center gap-3 py-3 border-b last:border-b-0">
      <div className="flex-1 min-w-[220px]">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
        <div className="text-xs font-mono truncate mt-1 text-muted-foreground" title={url}>{url}</div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(url).catch(() => {});
          toast({ title: "Copied", description: "Paste into Google/Apple/Outlook Calendar → 'Subscribe to calendar'." });
        }}
        data-testid={`button-copy-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <Copy className="h-4 w-4 mr-1.5" /> Copy
      </Button>
    </div>
  );
}

export default function FeedsPage() {
  const { user } = useAuth();

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Rss className="h-5 w-5 text-primary" /> Calendar feeds
        </h1>
        <p className="text-sm text-muted-foreground">
          Subscribe in Google Calendar, Apple Calendar, or Outlook. Your calendar auto-refreshes every few hours —
          when the schedule changes here, it updates there.
        </p>
      </div>

      {user?.feedToken && user.providerId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your personal feed</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <CopyRow
              label="My on-call schedule"
              description="All shifts assigned to you across every pool."
              url={absoluteUrl(`/api/ical/me/${user.feedToken}.ics`)}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Practice-wide</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <CopyRow
            label="Everything"
            description="All shifts, all pools — for office managers, answering service, etc."
            url={absoluteUrl("/api/ical/all.ics")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-pool feeds</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {POOLS.map((pool) => (
            <CopyRow
              key={pool}
              label={POOL_META[pool].label}
              description={POOL_META[pool].description}
              url={absoluteUrl(`/api/ical/pool/${pool}.ics`)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How to subscribe</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3 text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">Apple Calendar (iOS/macOS)</div>
            File → New Calendar Subscription → paste URL → Subscribe. Set auto-refresh to every 15 minutes.
          </div>
          <div>
            <div className="font-medium text-foreground">Google Calendar</div>
            Other calendars → "+" → From URL → paste URL. Google refreshes every few hours (not configurable).
          </div>
          <div>
            <div className="font-medium text-foreground">Outlook</div>
            Add calendar → Subscribe from web → paste URL → Import.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
