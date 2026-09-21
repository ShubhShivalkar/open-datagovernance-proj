import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, X, Loader2, AlertCircle, Crown, Shield,
  User, Trash2, Link, Unlink, ShieldOff,
} from "lucide-react";
import { authApi } from "../api/client";
import { useAuth } from "../context/AuthContext";

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60 transition-colors";

// ── Create User Modal ─────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    username: "", password: "", email: "",
    first_name: "", last_name: "",
    is_staff: false, is_superuser: false,
  });
  const [error, setError] = useState("");

  const createMut = useMutation({
    mutationFn: authApi.createUser,
    onSuccess: () => onSuccess?.(),
    onError: (err) => setError(err?.response?.data?.detail || "Failed to create user."),
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-bold text-foreground text-base flex items-center gap-2">
            <User size={15} className="text-primary" /> Create App User
          </h2>
          <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Username *</label>
              <input className={inputCls} value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="john_doe" autoFocus />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Password *</label>
              <input className={inputCls} type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">First name</label>
              <input className={inputCls} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} placeholder="John" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Last name</label>
              <input className={inputCls} value={form.last_name} onChange={(e) => set("last_name", e.target.value)} placeholder="Doe" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Email</label>
              <input className={inputCls} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="john@company.com" />
            </div>
          </div>

          {/* Role */}
          <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Platform Role</p>
            <div className="flex gap-2">
              {[
                { key: "none", label: "Standard", icon: User },
                { key: "staff", label: "Staff", icon: Shield },
                { key: "super", label: "Superuser", icon: Crown },
              ].map(({ key, label, icon: Icon }) => {
                const active = key === "super" ? form.is_superuser : key === "staff" ? (form.is_staff && !form.is_superuser) : (!form.is_staff && !form.is_superuser);
                return (
                  <button key={key} type="button"
                    onClick={() => set("is_staff", key !== "none") || set("is_superuser", key === "super")}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${active ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                  >
                    <Icon size={11} /> {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/30 border border-border">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Link size={11} className="shrink-0" />
              Database users are linked automatically when this user adds an environment.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
              <AlertCircle size={14} className="text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="btn-outline text-sm">Cancel</button>
          <button
            onClick={() => {
              if (!form.username.trim() || !form.password) { setError("Username and password are required."); return; }
              createMut.mutate({ ...form, db_user_id: form.db_user_id || null });
            }}
            disabled={createMut.isPending}
            className="btn-primary text-sm"
          >
            {createMut.isPending && <Loader2 size={13} className="animate-spin" />}
            Create User
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UserManagementPage() {
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();

  const usersQuery = useQuery({ queryKey: ["app-users"], queryFn: authApi.listUsers });
  const appUsers = usersQuery.data ?? [];

  const deleteMut = useMutation({
    mutationFn: authApi.deleteUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-users"] }),
  });

  const getRoleBadge = (u) => {
    if (u.is_superuser) return <span className="badge bg-primary/10 text-primary flex items-center gap-1"><Crown size={9} /> Superuser</span>;
    if (u.is_staff)     return <span className="badge bg-accent/10 text-accent-foreground flex items-center gap-1"><Shield size={9} /> Staff</span>;
    return <span className="badge bg-muted text-muted-foreground flex items-center gap-1"><User size={9} /> Standard</span>;
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">Application users and access policies</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={14} /> Add User
        </button>
      </div>

      {/* 75 / 25 split */}
      <div className="flex gap-5 items-start">

        {/* ── Left: Application Users (75%) ─────────────────────── */}
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 flex items-center gap-1.5">
            <Users size={11} /> Users ({appUsers.length})
          </p>

          {usersQuery.isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {!usersQuery.isLoading && appUsers.length === 0 && (
            <div className="card text-center py-8">
              <Users size={28} className="text-muted mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No users yet</p>
              <button onClick={() => setShowCreate(true)} className="btn-primary text-xs mt-3 inline-flex py-1.5">
                <Plus size={12} /> Add
              </button>
            </div>
          )}

          {appUsers.map((u) => {
            const displayName = u.first_name || u.last_name
              ? `${u.first_name} ${u.last_name}`.trim()
              : u.username;
            return (
              <div key={u.id} className="card p-3 space-y-2">
                {/* Avatar + name */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">{displayName}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">@{u.username}</p>
                  </div>
                  <button
                    onClick={() => { if (confirm(`Delete "${u.username}"?`)) deleteMut.mutate(u.id); }}
                    disabled={(deleteMut.isPending && deleteMut.variables === u.id) || u.id === currentUser?.id}
                    className="btn-ghost w-5 h-5 p-0 flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30 shrink-0"
                    title={u.id === currentUser?.id ? "Cannot delete yourself" : "Delete"}
                  >
                    {deleteMut.isPending && deleteMut.variables === u.id
                      ? <Loader2 size={10} className="animate-spin" />
                      : <Trash2 size={10} />}
                  </button>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1">
                  {getRoleBadge(u)}
                  {u.id === currentUser?.id && (
                    <span className="badge bg-success/10 text-success text-[9px]">You</span>
                  )}
                  {!u.is_active && (
                    <span className="badge bg-destructive/10 text-destructive text-[9px]">Inactive</span>
                  )}
                </div>

                {/* DB links */}
                {u.db_users?.length > 0 ? (
                  <div className="space-y-0.5">
                    {u.db_users.map((d) => (
                      <p key={d.id} className="text-[10px] text-success flex items-center gap-1">
                        <Link size={9} />
                        <span className="font-mono truncate">{d.username}</span>
                        {d.datasource_name && <span className="text-muted-foreground truncate">· {d.datasource_name}</span>}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Unlink size={9} /> No DB links
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Right: Policies (25%) ──────────────────────────────── */}
        <div className="w-1/4 shrink-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2 flex items-center gap-1.5">
            <ShieldOff size={11} /> Policies
          </p>
          <div className="card border-dashed min-h-[400px] flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center">
              <ShieldOff size={22} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Coming Soon</p>
              <p className="text-xs text-muted-foreground mt-1">
                Fine-grained permission policies per user or role.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 mt-1 w-full px-2">
              {["Row-level security", "Column masking", "Time-bound access", "Role inheritance"].map((label) => (
                <span key={label} className="badge bg-muted text-muted-foreground text-[10px] opacity-60 justify-center">{label}</span>
              ))}
            </div>
          </div>
        </div>

      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["app-users"] }); }}
        />
      )}
    </div>
  );
}
