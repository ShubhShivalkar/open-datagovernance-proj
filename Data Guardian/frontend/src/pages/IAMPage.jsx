import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, ShieldCheck, Plus, X, Loader2, AlertCircle, ChevronDown,
  ChevronRight, UserCheck, UserX, Layers, Database, Crown, Shield,
  User, Trash2, CheckCircle, Clock, RefreshCw,
} from "lucide-react";
import { iamApi, islandsApi } from "../api/client";
import { useEnv } from "../context/EnvContext";

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60 transition-colors";
const selectCls = inputCls;

// ── Badges ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  return status === "active" ? (
    <span className="badge bg-success/10 text-success flex items-center gap-1">
      <CheckCircle size={9} /> Active
    </span>
  ) : (
    <span className="badge bg-muted text-muted-foreground flex items-center gap-1">
      <Clock size={9} /> Inactive
    </span>
  );
}

function PlatformBadge({ role }) {
  if (!role) return null;
  return role === "administrator" ? (
    <span className="badge bg-primary/10 text-primary flex items-center gap-1">
      <Crown size={9} /> Admin
    </span>
  ) : (
    <span className="badge bg-accent/10 text-accent-foreground flex items-center gap-1">
      <Shield size={9} /> Assistant
    </span>
  );
}

// ── Create User Modal ─────────────────────────────────────────────────────────

const PRIVILEGE_LEVELS = [
  { value: "read_only",  label: "Read Only",   desc: "SELECT on all tables" },
  { value: "read_write", label: "Read & Write", desc: "SELECT, INSERT, UPDATE, DELETE" },
  { value: "full",       label: "Full Access",  desc: "ALL PRIVILEGES on the database" },
];

function CreateUserModal({ onClose, onSuccess, groups }) {
  const { activeEnv } = useEnv();
  const [form, setForm] = useState({
    username: "", email: "", name: "",
    privilege_level: "read_only",
    is_platform_user: false, platform_role: "",
    notes: "",
  });
  const [groupMode, setGroupMode] = useState("skip");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [error, setError] = useState("");
  const qc = useQueryClient();

  const canCreate = activeEnv && ["mysql", "postgresql"].includes(activeEnv.db_type);

  const createGroupMut = useMutation({ mutationFn: iamApi.createGroup });
  const addMemberMut   = useMutation({ mutationFn: ({ groupId, userId }) => iamApi.addMember(groupId, userId) });

  const createMut = useMutation({
    mutationFn: () => iamApi.createUserInDb({
      datasource_id:    activeEnv.id,
      username:         form.username,
      email:            form.email,
      privilege_level:  form.privilege_level,
      name:             form.name,
      is_platform_user: form.is_platform_user,
      platform_role:    form.is_platform_user ? form.platform_role : "",
      notes:            form.notes,
    }),
    onSuccess: async (user) => {
      try {
        if (groupMode === "existing" && selectedGroup) {
          await addMemberMut.mutateAsync({ groupId: selectedGroup, userId: user.id });
        } else if (groupMode === "new" && newGroupName.trim()) {
          const group = await createGroupMut.mutateAsync({ name: newGroupName.trim() });
          await addMemberMut.mutateAsync({ groupId: group.id, userId: user.id });
        }
      } catch (_) {}
      qc.invalidateQueries({ queryKey: ["iam-users"] });
      qc.invalidateQueries({ queryKey: ["iam-groups"] });
      onSuccess?.();
    },
    onError: (err) => {
      const data = err?.response?.data;
      setError(data?.detail || (typeof data === "string" ? data : "Failed to create user."));
    },
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-bold text-foreground text-base flex items-center gap-2">
            <User size={15} className="text-primary" /> Create Database User
          </h2>
          <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Active environment banner */}
          {activeEnv ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-xs">
              <Database size={12} className="text-primary shrink-0" />
              <span className="text-muted-foreground">Creating in:</span>
              <span className="font-semibold text-foreground">{activeEnv.name}</span>
              <span className="text-muted-foreground capitalize">({activeEnv.db_type})</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20 text-xs text-warning">
              <AlertCircle size={12} className="shrink-0" />
              No environment selected. Pick one from the sidebar before creating a user.
            </div>
          )}

          {/* DB credentials */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">DB Username *</label>
              <input className={inputCls} value={form.username}
                onChange={(e) => set("username", e.target.value)}
                placeholder="jane_doe" autoFocus />
              <p className="text-[10px] text-muted-foreground mt-1">Letters, digits, underscores only</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Email Address *</label>
              <input className={inputCls} type="email" value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="jane@company.com" />
              <p className="text-[10px] text-muted-foreground mt-1">A secure password will be sent here</p>
            </div>
          </div>

          {/* Privilege level */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Privilege Level</p>
            <div className="flex gap-2">
              {PRIVILEGE_LEVELS.map(({ value, label, desc }) => (
                <button key={value} onClick={() => set("privilege_level", value)}
                  className={`flex-1 p-2.5 text-left rounded-lg border transition-all ${
                    form.privilege_level === value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}>
                  <p className={`text-xs font-semibold ${form.privilege_level === value ? "text-primary" : "text-foreground"}`}>{label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Display identity (optional) */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Display Name</label>
            <input className={inputCls} value={form.name}
              onChange={(e) => set("name", e.target.value)} placeholder="Jane Doe" />
          </div>

          {/* Platform access — disabled: platform login feature coming soon
          <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div onClick={() => set("is_platform_user", !form.is_platform_user)}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${form.is_platform_user ? "bg-primary" : "bg-border"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_platform_user ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <span className="text-sm font-medium text-foreground">Platform User</span>
              <span className="text-xs text-muted-foreground">(can log in to DGP)</span>
            </label>
            {form.is_platform_user && (
              <div className="flex gap-2">
                {["administrator", "assistant"].map((role) => (
                  <button key={role} onClick={() => set("platform_role", role)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                      form.platform_role === role ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                    }`}>
                    {role === "administrator" ? <Crown size={11} /> : <Shield size={11} />}
                    {role === "administrator" ? "Administrator" : "Assistant"}
                  </button>
                ))}
              </div>
            )}
          </div>
          */}

          {/* Access Group */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Access Group</p>
            <div className="flex gap-2">
              {[{ key: "skip", label: "Skip" }, { key: "existing", label: "Add to existing" }, { key: "new", label: "Create new" }].map(({ key, label }) => (
                <button key={key} onClick={() => setGroupMode(key)}
                  className={`flex-1 px-2 py-2 text-xs font-medium rounded-lg border transition-all ${
                    groupMode === key ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                  }`}>{label}</button>
              ))}
            </div>
            {groupMode === "existing" && (
              <select className={`${selectCls} mt-2`} value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
                <option value="">— Select group —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
            {groupMode === "new" && (
              <input className={`${inputCls} mt-2`} value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)} placeholder="New group name…" />
            )}
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
              setError("");
              if (!form.username.trim()) { setError("DB username is required."); return; }
              if (!form.email.trim()) { setError("Email address is required."); return; }
              createMut.mutate();
            }}
            disabled={createMut.isPending || !canCreate}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {createMut.isPending && <Loader2 size={13} className="animate-spin" />}
            Create in {activeEnv?.name ?? "DB"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create Group Modal ────────────────────────────────────────────────────────

function CreateGroupModal({ onClose, onSuccess }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: iamApi.createGroup,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iam-groups"] });
      onSuccess?.();
    },
    onError: (err) => {
      const data = err?.response?.data;
      setError(data?.name?.[0] || data?.detail || "Failed to create group.");
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-bold text-foreground text-base flex items-center gap-2">
            <ShieldCheck size={15} className="text-primary" /> Create Access Group
          </h2>
          <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Group Name *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Analytics Team" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Description</label>
            <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this group access?" />
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
            onClick={() => { setError(""); createMut.mutate({ name: name.trim(), description }); }}
            disabled={!name.trim() || createMut.isPending}
            className="btn-primary text-sm"
          >
            {createMut.isPending && <Loader2 size={13} className="animate-spin" />}
            Create Group
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Access Group Card ─────────────────────────────────────────────────────────

function AccessGroupCard({ group }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const { data: detail, isLoading } = useQuery({
    queryKey: ["iam-group", group.id],
    queryFn: () => iamApi.getGroup(group.id),
    enabled: expanded,
  });

  const { data: usersData } = useQuery({ queryKey: ["iam-users"], queryFn: iamApi.listUsers });
  const { data: islandsData } = useQuery({ queryKey: ["islands"], queryFn: islandsApi.list });
  const allUsers = usersData?.results ?? usersData ?? [];
  const allIslands = islandsData?.results ?? islandsData ?? [];

  const members = detail?.members ?? [];
  const islands = detail?.data_islands ?? [];
  const memberIds = new Set(members.map((m) => m.id));
  const islandIds = new Set(islands.map((i) => String(i.id)));

  const removeMemberMut = useMutation({
    mutationFn: (userId) => iamApi.removeMember(group.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iam-group", group.id] });
      qc.invalidateQueries({ queryKey: ["iam-groups"] });
    },
  });
  const addMemberMut = useMutation({
    mutationFn: (userId) => iamApi.addMember(group.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["iam-group", group.id] });
      qc.invalidateQueries({ queryKey: ["iam-groups"] });
    },
  });
  const removeIslandMut = useMutation({
    mutationFn: (islandId) => iamApi.removeIsland(group.id, islandId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["iam-group", group.id] }),
  });
  const addIslandMut = useMutation({
    mutationFn: (islandId) => iamApi.addIsland(group.id, islandId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["iam-group", group.id] }),
  });
  const deleteMut = useMutation({
    mutationFn: () => iamApi.deleteGroup(group.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["iam-groups"] }),
  });

  const nonMembers = allUsers.filter((u) => !memberIds.has(u.id) && u.status === "active");
  const nonIslands = allIslands.filter((i) => !islandIds.has(String(i.id)));

  return (
    <div className="card">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldCheck size={17} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{group.name}</p>
            {group.description && (
              <p className="text-xs text-muted-foreground truncate">{group.description}</p>
            )}
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground shrink-0 ml-2">
            <span className="flex items-center gap-1"><Users size={11} /> {group.member_count}</span>
            <span className="flex items-center gap-1"><Layers size={11} /> {group.island_count}</span>
          </div>
          {expanded
            ? <ChevronDown size={14} className="text-muted-foreground shrink-0 ml-1" />
            : <ChevronRight size={14} className="text-muted-foreground shrink-0 ml-1" />}
        </button>
        <button
          onClick={() => { if (confirm(`Delete group "${group.name}"?`)) deleteMut.mutate(); }}
          className="btn-ghost w-8 h-8 p-0 flex items-center justify-center text-muted-foreground hover:text-destructive ml-2 shrink-0"
          title="Delete group"
        >
          {deleteMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-6">
          {isLoading && <div className="col-span-2 flex justify-center py-4"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>}

          {/* Members */}
          {!isLoading && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Users size={11} /> Members ({members.length})
              </p>
              <div className="space-y-1.5 mb-3">
                {members.length === 0 && (
                  <p className="text-xs text-muted-foreground py-3 text-center">No members yet</p>
                )}
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{m.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{m.email}</p>
                    </div>
                    <button
                      onClick={() => removeMemberMut.mutate(m.id)}
                      disabled={removeMemberMut.isPending}
                      className="btn-ghost w-5 h-5 p-0 flex items-center justify-center text-muted-foreground hover:text-destructive"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
              {nonMembers.length > 0 && (
                <select
                  className="w-full px-2.5 py-1.5 text-xs border border-dashed border-border rounded-lg bg-background text-muted-foreground focus:outline-none focus:border-primary focus:text-foreground"
                  value=""
                  onChange={(e) => { if (e.target.value) addMemberMut.mutate(e.target.value); }}
                >
                  <option value="">+ Add member…</option>
                  {nonMembers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </select>
              )}
            </div>
          )}

          {/* Data Islands */}
          {!isLoading && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Layers size={11} /> Data Islands ({islands.length})
              </p>
              <div className="space-y-1.5 mb-3">
                {islands.length === 0 && (
                  <p className="text-xs text-muted-foreground py-3 text-center">No islands granted</p>
                )}
                {islands.map((isle) => (
                  <div key={isle.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                    <Layers size={12} className="text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{isle.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{isle.datasource_name}</p>
                    </div>
                    <span className={`badge text-[9px] ${isle.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {isle.status}
                    </span>
                    <button
                      onClick={() => removeIslandMut.mutate(isle.id)}
                      disabled={removeIslandMut.isPending}
                      className="btn-ghost w-5 h-5 p-0 flex items-center justify-center text-muted-foreground hover:text-destructive"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
              {nonIslands.length > 0 && (
                <select
                  className="w-full px-2.5 py-1.5 text-xs border border-dashed border-border rounded-lg bg-background text-muted-foreground focus:outline-none focus:border-primary focus:text-foreground"
                  value=""
                  onChange={(e) => { if (e.target.value) addIslandMut.mutate(e.target.value); }}
                >
                  <option value="">+ Grant island access…</option>
                  {nonIslands.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function IAMPage() {
  const [tab, setTab] = useState("users"); // "users" | "groups"
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const qc = useQueryClient();
  const { activeEnv } = useEnv();

  const canSync = activeEnv && ["mysql", "postgresql"].includes(activeEnv.db_type);

  const syncMut = useMutation({
    mutationFn: () => iamApi.syncUsers(activeEnv.id),
    onSuccess: (data) => {
      setSyncResult(data);
      qc.invalidateQueries({ queryKey: ["iam-users"] });
      setTimeout(() => setSyncResult(null), 12000);
    },
  });

  const usersQuery = useQuery({ queryKey: ["iam-users"], queryFn: iamApi.listUsers });
  const groupsQuery = useQuery({ queryKey: ["iam-groups"], queryFn: iamApi.listGroups });

  const users = usersQuery.data?.results ?? usersQuery.data ?? [];
  const groups = groupsQuery.data?.results ?? groupsQuery.data ?? [];
  const activeUsers = users.filter((u) => u.status === "active").length;
  const platformUsers = users.filter((u) => u.is_platform_user).length;

  const toggleMut = useMutation({
    mutationFn: iamApi.toggleStatus,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["iam-users"] }),
  });
  const deleteMut = useMutation({
    mutationFn: iamApi.deleteUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["iam-users"] }),
  });

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">IAM & Access Management</h1>
          <p className="text-sm text-muted-foreground">Manage database users, platform roles, and access groups</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "users" && (
            <>
              <span className="badge bg-success/10 text-success px-3 py-1.5">{activeUsers} active</span>
              <span className="badge bg-primary/10 text-primary px-3 py-1.5">{platformUsers} platform</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setSyncResult(null); syncMut.mutate(); }}
                  disabled={!canSync || syncMut.isPending}
                  title={!activeEnv ? "No environment selected" : !canSync ? `${activeEnv.db_type} does not support user sync` : `Sync users from ${activeEnv.name}`}
                  className="btn-outline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={14} className={syncMut.isPending ? "animate-spin" : ""} />
                  Sync Users
                </button>

                {/* Inline sync status */}
                {syncMut.isPending && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                    Syncing from {activeEnv?.name}…
                  </span>
                )}
                {syncResult && !syncMut.isPending && (
                  <span className="flex items-center gap-1.5 text-xs text-success">
                    <CheckCircle size={13} className="shrink-0" />
                    {syncResult.created + syncResult.updated} synced · {syncResult.unchanged} unchanged
                  </span>
                )}
                {syncMut.isError && !syncMut.isPending && (
                  <span className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle size={13} className="shrink-0" />
                    Sync failed
                  </span>
                )}
              </div>
              <button onClick={() => setShowCreateUser(true)} className="btn-primary">
                <Plus size={14} /> New User
              </button>
            </>
          )}
          {tab === "groups" && (
            <button onClick={() => setShowCreateGroup(true)} className="btn-primary">
              <Plus size={14} /> New Group
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
        {[
          { key: "users", label: "Database Users", Icon: Users },
          { key: "groups", label: "Access Groups", Icon: ShieldCheck },
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              tab === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Sync result / error banner */}
      {syncResult && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-4 flex items-start gap-3">
          <CheckCircle size={16} className="text-success shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Synced from {syncResult.datasource_name} — {syncResult.created} created, {syncResult.updated} updated, {syncResult.unchanged} unchanged
            </p>
            {syncResult.users?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {syncResult.users.filter((u) => u.action !== "unchanged").map((u) => (
                  <span key={u.username} className={`badge text-[10px] font-mono ${u.action === "created" ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>
                    {u.username} · {u.action}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setSyncResult(null)} className="btn-ghost w-6 h-6 p-0 flex items-center justify-center text-muted-foreground shrink-0">
            <X size={13} />
          </button>
        </div>
      )}
      {syncMut.isError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 flex items-center gap-2">
          <AlertCircle size={14} className="text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            {syncMut.error?.response?.data?.detail || syncMut.error?.message || "Sync failed."}
          </p>
        </div>
      )}

      {/* ── Database Users Tab ─────────────────────────────────── */}
      {tab === "users" && (
        <div>
          {usersQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground mt-20">
              <Loader2 className="animate-spin" size={18} /> Loading users…
            </div>
          )}
          {usersQuery.isError && (
            <div className="flex items-center justify-center gap-2 text-destructive mt-20">
              <AlertCircle size={18} /> Failed to load users.
            </div>
          )}

          {!usersQuery.isLoading && users.length === 0 && (
            <div className="card text-center py-20">
              <Users size={48} className="text-muted mx-auto mb-4" />
              <p className="text-foreground font-semibold">No database users yet</p>
              <p className="text-sm text-muted-foreground mt-1 mb-6">Create your first user to get started.</p>
              <button onClick={() => setShowCreateUser(true)} className="btn-primary inline-flex">
                <Plus size={14} /> Create User
              </button>
            </div>
          )}

          <div className="space-y-2">
            {users.map((user) => (
              <div key={user.id} className="card flex items-center gap-4 hover:shadow-md transition-shadow">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>

                {/* Identity */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{user.name}</p>
                    <StatusBadge status={user.status} />
                    {user.is_platform_user && <PlatformBadge role={user.platform_role} />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{user.email} · <span className="font-mono">{user.username}</span></p>
                </div>

                {/* Meta */}
                <div className="hidden md:flex flex-col items-end gap-1 shrink-0">
                  {user.datasource_name && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Database size={10} /> {user.datasource_name}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <ShieldCheck size={10} /> {user.group_count} group{user.group_count !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => toggleMut.mutate(user.id)}
                    disabled={toggleMut.isPending && toggleMut.variables === user.id}
                    title={user.status === "active" ? "Deactivate" : "Activate"}
                    className={`btn-ghost w-8 h-8 p-0 flex items-center justify-center ${
                      user.status === "active" ? "text-warning hover:bg-warning/10" : "text-success hover:bg-success/10"
                    }`}
                  >
                    {toggleMut.isPending && toggleMut.variables === user.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : user.status === "active" ? <UserX size={14} /> : <UserCheck size={14} />}
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete user "${user.name}"?`)) deleteMut.mutate(user.id); }}
                    disabled={deleteMut.isPending && deleteMut.variables === user.id}
                    className="btn-ghost w-8 h-8 p-0 flex items-center justify-center text-muted-foreground hover:text-destructive"
                    title="Delete user"
                  >
                    {deleteMut.isPending && deleteMut.variables === user.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Access Groups Tab ──────────────────────────────────── */}
      {tab === "groups" && (
        <div>
          {groupsQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground mt-20">
              <Loader2 className="animate-spin" size={18} /> Loading groups…
            </div>
          )}
          {groupsQuery.isError && (
            <div className="flex items-center justify-center gap-2 text-destructive mt-20">
              <AlertCircle size={18} /> Failed to load groups.
            </div>
          )}

          {!groupsQuery.isLoading && groups.length === 0 && (
            <div className="card text-center py-20">
              <ShieldCheck size={48} className="text-muted mx-auto mb-4" />
              <p className="text-foreground font-semibold">No access groups yet</p>
              <p className="text-sm text-muted-foreground mt-1 mb-6">
                Create a group to manage shared Data Island access.
              </p>
              <button onClick={() => setShowCreateGroup(true)} className="btn-primary inline-flex">
                <Plus size={14} /> Create Group
              </button>
            </div>
          )}

          <div className="space-y-3">
            {groups.map((group) => (
              <AccessGroupCard key={group.id} group={group} />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateUser && (
        <CreateUserModal
          groups={groups}
          onClose={() => setShowCreateUser(false)}
          onSuccess={() => setShowCreateUser(false)}
        />
      )}
      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onSuccess={() => setShowCreateGroup(false)}
        />
      )}
    </div>
  );
}
