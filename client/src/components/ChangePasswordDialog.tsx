import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

/**
 * Change-password dialog.
 *
 * Shown automatically when the logged-in user has `mustChangePassword=true`
 * (e.g. on first login after admin issued a temp password).
 *
 * Also exposed via `window.__openChangePassword()` so the sidebar can offer
 * a manual "Change password" button. Users can dismiss it ONLY if they're
 * not in forced-change mode.
 */
declare global {
  interface Window {
    __openChangePassword?: () => void;
  }
}

export default function ChangePasswordDialog() {
  const { user, refresh, logout } = useAuth();
  const { toast } = useToast();

  const forced = !!user?.mustChangePassword;
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next1, setNext1] = useState("");
  const [next2, setNext2] = useState("");
  const [busy, setBusy] = useState(false);

  // If the user is required to change password, force the dialog open.
  useEffect(() => {
    if (user && forced) setOpen(true);
  }, [user, forced]);

  // Expose a manual opener for the sidebar.
  useEffect(() => {
    window.__openChangePassword = () => setOpen(true);
    return () => { window.__openChangePassword = undefined; };
  }, []);

  // Reset fields when dialog closes
  useEffect(() => {
    if (!open) {
      setCurrent("");
      setNext1("");
      setNext2("");
    }
  }, [open]);

  if (!user) return null;

  const tooShort = next1.length < 6;
  const mismatch = next1 !== next2;

  const submit = async () => {
    if (tooShort) {
      toast({ title: "Password too short", description: "Must be at least 6 characters.", variant: "destructive" });
      return;
    }
    if (mismatch) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", {
        currentPassword: current,
        newPassword: next1,
      });
      toast({ title: "Password changed" });
      await refresh();
      setOpen(false);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const friendly =
        msg.includes("wrong_current_password") ? "Current password is wrong." :
        msg.includes("new_password_too_short") ? "New password too short." :
        msg;
      toast({ title: "Couldn't change password", description: friendly, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // If forced, don't let them close
        if (forced && !o) return;
        setOpen(o);
      }}
    >
      <DialogContent
        className="sm:max-w-sm"
        // Prevent escape/outside-click dismissal when forced
        onEscapeKeyDown={(e) => { if (forced) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (forced) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>{forced ? "Set a new password" : "Change password"}</DialogTitle>
          <DialogDescription>
            {forced
              ? "Your admin set a temporary password. Choose a new one to continue."
              : "Pick a new password for your account."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!forced && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-current">Current password</Label>
              <Input id="cp-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} data-testid="input-current-password" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cp-new1">New password</Label>
            <Input id="cp-new1" type="password" value={next1} onChange={(e) => setNext1(e.target.value)} data-testid="input-new-password" />
            <p className="text-xs text-muted-foreground">Must be at least 6 characters.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-new2">Confirm new password</Label>
            <Input id="cp-new2" type="password" value={next2} onChange={(e) => setNext2(e.target.value)} data-testid="input-confirm-password" />
            {next2.length > 0 && mismatch && (
              <p className="text-xs text-destructive">Passwords don't match.</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {forced ? (
            <Button variant="ghost" onClick={() => { logout(); }} data-testid="button-cancel-forced-cp">Sign out</Button>
          ) : (
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          )}
          <Button
            onClick={submit}
            disabled={busy || tooShort || mismatch || (!forced && current.length === 0)}
            data-testid="button-submit-change-password"
          >
            {busy ? "Saving…" : "Change password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
