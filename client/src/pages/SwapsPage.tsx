import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Shift, Provider, SwapRequest, Pool } from "@shared/schema";
import { POOL_META } from "@shared/schema";
import { providerDisplay } from "@/lib/shiftUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeftRight, Check, X } from "lucide-react";

export default function SwapsPage() {
  const { user } = useAuth();
  const { data: shifts = [] } = useQuery<Shift[]>({ queryKey: ["/api/shifts"] });
  const { data: providers = [] } = useQuery<Provider[]>({ queryKey: ["/api/providers"] });
  const { data: swaps = [] } = useQuery<SwapRequest[]>({ queryKey: ["/api/swaps"] });
  const provById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [shiftId, setShiftId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [reason, setReason] = useState("");

  const createMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/swaps", {
        shiftId: Number(shiftId),
        requesterId: user?.providerId ?? 0,
        targetProviderId: Number(targetId),
        reason,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swaps"] });
      setOpen(false);
      setShiftId(""); setTargetId(""); setReason("");
      toast({ title: "Swap request sent" });
    },
    onError: (e: any) => toast({ title: "Could not submit", description: e.message, variant: "destructive" }),
  });

  const approveMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("POST", `/api/swaps/${id}/approve`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swaps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      toast({ title: "Swap approved" });
    },
  });

  const declineMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("POST", `/api/swaps/${id}/decline`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swaps"] });
      toast({ title: "Swap declined" });
    },
  });

  const myShifts = useMemo(() => {
    if (!user?.providerId) return [];
    return shifts
      .filter((s) => s.providerId === user.providerId && new Date(s.endAt) > new Date())
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [shifts, user]);

  const pending = swaps.filter((s) => s.status === "pending");
  const decided = swaps.filter((s) => s.status !== "pending");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" /> Call swaps
          </h1>
          <p className="text-sm text-muted-foreground">
            Request coverage from a colleague. Approved swaps reassign the shift automatically.
          </p>
        </div>
        {user && (user.providerId || user.role === "admin") && (
          <Button onClick={() => setOpen(true)} data-testid="button-new-swap">
            Request swap
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 && (
            <div className="text-sm text-muted-foreground">No pending swap requests.</div>
          )}
          {pending.map((sw) => {
            const shift = shiftById.get(sw.shiftId);
            if (!shift) return null;
            const canDecide =
              user?.role === "admin" ||
              (user?.providerId && user.providerId === sw.targetProviderId);
            return (
              <div key={sw.id} className={`pool-${shift.pool} border rounded-md p-3 flex flex-wrap items-center justify-between gap-3`}>
                <div className="flex items-start gap-3">
                  <span className="pool-dot w-2.5 h-2.5 rounded-full mt-1.5" />
                  <div className="text-sm">
                    <div className="font-medium">{POOL_META[shift.pool as Pool].label}</div>
                    <div className="text-muted-foreground tabular-nums">
                      {new Date(shift.startAt).toLocaleString(undefined, {
                        weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                      })}{" "}
                      → {new Date(shift.endAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium">{providerDisplay(provById.get(sw.requesterId))}</span>{" "}
                      <span className="text-muted-foreground">→</span>{" "}
                      <span className="font-medium">{providerDisplay(provById.get(sw.targetProviderId))}</span>
                    </div>
                    {sw.reason && (
                      <div className="mt-1 text-xs text-muted-foreground italic">"{sw.reason}"</div>
                    )}
                  </div>
                </div>
                {canDecide && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => declineMut.mutate(sw.id)}
                      data-testid={`button-decline-${sw.id}`}
                    >
                      <X className="h-4 w-4 mr-1" /> Decline
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => approveMut.mutate(sw.id)}
                      data-testid={`button-approve-${sw.id}`}
                    >
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {decided.length === 0 && (
            <div className="text-sm text-muted-foreground">No past swaps yet.</div>
          )}
          {decided.slice(0, 20).map((sw) => {
            const shift = shiftById.get(sw.shiftId);
            return (
              <div key={sw.id} className="text-sm flex items-center justify-between border-b last:border-b-0 py-2">
                <div>
                  <span className="font-medium">{providerDisplay(provById.get(sw.requesterId))}</span>{" "}
                  <span className="text-muted-foreground">→</span>{" "}
                  <span className="font-medium">{providerDisplay(provById.get(sw.targetProviderId))}</span>{" "}
                  <span className="text-muted-foreground">
                    ({shift ? POOL_META[shift.pool as Pool].short : "?"} ·{" "}
                    {shift ? new Date(shift.startAt).toLocaleDateString() : "?"})
                  </span>
                </div>
                <Badge variant={sw.status === "approved" ? "default" : "secondary"} className="capitalize">
                  {sw.status}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a swap</DialogTitle>
            <DialogDescription>
              Pick one of your upcoming shifts and the colleague you're asking to cover. They (or an admin) can approve.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Your shift</label>
              <Select value={shiftId} onValueChange={setShiftId}>
                <SelectTrigger data-testid="select-swap-shift">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {myShifts.length === 0 ? (
                    <SelectItem value="none" disabled>No upcoming shifts</SelectItem>
                  ) : myShifts.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {POOL_META[s.pool as Pool].short} ·{" "}
                      {new Date(s.startAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} →{" "}
                      {new Date(s.endAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Cover provider</label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger data-testid="select-swap-target">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.filter((p) => p.active && p.id !== user?.providerId).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {providerDisplay(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-swap-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!shiftId || !targetId || createMut.isPending}
              data-testid="button-submit-swap"
            >
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
