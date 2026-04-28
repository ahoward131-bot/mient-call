import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Provider } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import { UserCog, UserPlus, KeyRound, Trash2, ShieldOff, ShieldCheck } from "lucide-react";

type AppUser = {
  id: number;
  username: string;
  name: string;
  role: "admin" | "physician" | "pa" | "viewer";
  providerId: number | null;
  feedToken: string;
  active: boolean;
  mustChangePassword: boolean;
};

export default function UsersPage() {
  const { user } = useAuth();
  if (!user) return <Redirect to="/login" />;
  if (user.role !== "admin") return <Redirect to="/" />;

  const { toast } = useToast();
  const { data: users = [], isLoading } = useQuery<AppUser[]>({ queryKey: ["/api/users"] });
  const { data: providers = [] } = useQuery<Provider[]>({ queryKey: ["/api/providers"] });

  // ---------- Create user dialog state ----------
  const [createOpen, setCreateOpen] = useState(false);
  const [cUsername, setCUsername] = useState("");
  const [cName, setCName] = useState("");
  const [cRole, setCRole] = useState<"admin" | "physician" | "pa" | "viewer">("physician");
  const [cProviderId, setCProviderId] = useState<string>("none");
  const [cPassword, setCPassword] = useState("");

  function resetCreate() {
    setCUsername("");
    setCName("");
    setCRole("physician");
    setCProviderId("none");
    setCPassword("");
  }

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/users", {
        username: cUsername.trim(),
        name: cName.trim(),
        role: cRole,
        providerId: cProviderId === "none" ? null : Number(cProviderId),
        password: cPassword,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User created", description: `Temporary password set. They'll be asked to change it on first login.` });
      setCreateOpen(false);
      resetCreate();
    },
    onError: (e: any) => toast({ title: "Could not create user", description: prettyError(e), variant: "destructive" }),
  });

  // ---------- Update user mutation ----------
  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<AppUser> }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: prettyError(e), variant: "destructive" }),
  });

  // ---------- Reset password mutation ----------
  const resetMut = useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) => {
      const res = await apiRequest("POST", `/api/users/${id}/reset-password`, { password });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Password reset", description: "User will be asked to change it on next login." });
    },
    onError: (e: any) => toast({ title: "Reset failed", description: prettyError(e), variant: "destructive" }),
  });

  // ---------- Delete user mutation ----------
  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/users/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: prettyError(e), variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" /> User accounts
          </h1>
          <p className="text-sm text-muted-foreground">
            Create, deactivate, and reset passwords for everyone with sign-in access.
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreate(); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-user">
              <UserPlus className="h-4 w-4 mr-2" /> New user
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create user</DialogTitle>
              <DialogDescription>
                The user will sign in with the temporary password you set, then be prompted to change it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cu">Username</Label>
                <Input id="cu" data-testid="input-new-username" value={cUsername} onChange={(e) => setCUsername(e.target.value)} placeholder="jdoe" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cn">Display name</Label>
                <Input id="cn" data-testid="input-new-name" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Dr. Jane Doe" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={cRole} onValueChange={(v) => setCRole(v as any)}>
                    <SelectTrigger data-testid="select-new-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="physician">Physician</SelectItem>
                      <SelectItem value="pa">PA</SelectItem>
                      <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Linked provider (optional)</Label>
                  <Select value={cProviderId} onValueChange={setCProviderId}>
                    <SelectTrigger data-testid="select-new-provider"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {providers.filter((p) => p.active).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.firstName ? `${p.firstName} ${p.lastName}` : p.lastName}
                          {p.credentials ? `, ${p.credentials}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp">Temporary password</Label>
                <Input id="cp" data-testid="input-new-password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} placeholder="At least 4 characters" />
                <p className="text-xs text-muted-foreground">User will be forced to change this on first login.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !cUsername.trim() || !cName.trim() || cPassword.length < 4}
                data-testid="button-submit-new-user"
              >
                {createMut.isPending ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading users…</div>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{users.length} account{users.length === 1 ? "" : "s"}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  u={u}
                  isMe={u.id === user.id}
                  providers={providers}
                  onUpdate={(patch) => updateMut.mutate({ id: u.id, patch })}
                  onResetPassword={(pw) => resetMut.mutate({ id: u.id, password: pw })}
                  onDelete={() => deleteMut.mutate(u.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UserRow({
  u, isMe, providers, onUpdate, onResetPassword, onDelete,
}: {
  u: AppUser;
  isMe: boolean;
  providers: Provider[];
  onUpdate: (patch: Partial<AppUser>) => void;
  onResetPassword: (pw: string) => void;
  onDelete: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(u.name);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPw, setNewPw] = useState("");

  const provider = providers.find((p) => p.id === u.providerId);

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 px-4 py-3" data-testid={`user-row-${u.id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="h-7 w-56"
                data-testid={`input-edit-name-${u.id}`}
              />
              <Button size="sm" onClick={() => { onUpdate({ name: nameDraft.trim() || u.name }); setEditingName(false); }}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setNameDraft(u.name); setEditingName(false); }}>Cancel</Button>
            </div>
          ) : (
            <button className="font-medium text-sm hover:underline text-left" onClick={() => setEditingName(true)} data-testid={`button-edit-name-${u.id}`}>
              {u.name}
            </button>
          )}
          {isMe && <Badge variant="outline" className="text-[10px]">You</Badge>}
          {!u.active && <Badge variant="destructive" className="text-[10px]">Disabled</Badge>}
          {u.mustChangePassword && <Badge variant="secondary" className="text-[10px]">Must change pw</Badge>}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          <span className="font-mono">{u.username}</span>
          {provider && <span> · linked to {provider.firstName ? `${provider.firstName} ${provider.lastName}` : provider.lastName}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={u.role} onValueChange={(v) => onUpdate({ role: v as any })} disabled={isMe}>
          <SelectTrigger className="h-8 w-32" data-testid={`select-role-${u.id}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="physician">Physician</SelectItem>
            <SelectItem value="pa">PA</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={u.providerId == null ? "none" : String(u.providerId)}
          onValueChange={(v) => onUpdate({ providerId: v === "none" ? null : (Number(v) as any) })}
        >
          <SelectTrigger className="h-8 w-44" data-testid={`select-provider-${u.id}`}><SelectValue placeholder="Linked provider" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— No provider —</SelectItem>
            {providers.filter((p) => p.active).map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.firstName ? `${p.firstName} ${p.lastName}` : p.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={resetOpen} onOpenChange={(o) => { setResetOpen(o); if (!o) setNewPw(""); }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" data-testid={`button-reset-${u.id}`}>
              <KeyRound className="h-3.5 w-3.5 mr-1.5" /> Reset password
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Reset password for {u.name}</DialogTitle>
              <DialogDescription>
                Set a temporary password. They'll be signed out and forced to choose a new one on next login.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor={`np-${u.id}`}>New temporary password</Label>
              <Input id={`np-${u.id}`} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 4 characters" data-testid={`input-new-pw-${u.id}`} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
              <Button onClick={() => { onResetPassword(newPw); setResetOpen(false); setNewPw(""); }} disabled={newPw.length < 4} data-testid={`button-submit-reset-${u.id}`}>
                Reset
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {!isMe && (
          <Button size="sm" variant="outline" onClick={() => onUpdate({ active: !u.active })} data-testid={`button-toggle-active-${u.id}`}>
            {u.active ? <><ShieldOff className="h-3.5 w-3.5 mr-1.5" /> Disable</> : <><ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Enable</>}
          </Button>
        )}

        {!isMe && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" data-testid={`button-delete-${u.id}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {u.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Removes their sign-in account permanently. The provider record (and any historical schedule data) is unaffected. Disable instead if you want to keep history of their account.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

function prettyError(e: any): string {
  const raw = e?.message ?? String(e);
  // err looks like "409: {"error":"username_taken"}"
  const m = raw.match(/\{.*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      switch (j.error) {
        case "username_taken": return "That username is already in use.";
        case "username_required": return "Username is required.";
        case "name_required": return "Name is required.";
        case "password_too_short": return "Password must be at least 4 characters.";
        case "cannot_remove_last_admin": return "Can't disable or demote the last admin. Make someone else an admin first.";
        case "cannot_delete_self": return "You can't delete your own account.";
        case "wrong_current_password": return "Current password is wrong.";
        case "new_password_too_short": return "New password must be at least 6 characters.";
        case "account_disabled": return "This account is disabled.";
        default: return j.error;
      }
    } catch {}
  }
  return raw;
}
