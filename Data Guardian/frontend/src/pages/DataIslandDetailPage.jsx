import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, RefreshCw, Loader2, AlertCircle, CheckCircle,
  AlertTriangle, Clock, Layers, Shield, ShieldAlert, UserPlus, X, Database,
  Table2, Code, Trash2,
} from "lucide-react";
import { islandsApi } from "../api/client";

const STATUS_BADGE = {
  active: { cls: "bg-success/10 text-success",         label: "Active",  Icon: CheckCircle },
  error:  { cls: "bg-destructive/10 text-destructive", label: "Error",   Icon: AlertTriangle },
  draft:  { cls: "bg-muted text-muted-foreground",     label: "Draft",   Icon: Clock },
  stale:  { cls: "bg-warning/10 text-warning",         label: "Stale",   Icon: AlertTriangle },
};

const ROLE_BADGE = {
  viewer: "bg-muted text-muted-foreground",
  editor: "bg-primary/10 text-primary",
};

function IslandStatusBadge({ status }) {
  const cfg = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
  return (
    <span className={`badge flex items-center gap-1 ${cfg.cls}`}>
      <cfg.Icon size={10} /> {cfg.label}
    </span>
  );
}

const emptyAccessForm = { email: "", name: "", role: "viewer", granted_by: "" };

function DeleteConfirmModal({ island, onCancel, onConfirm, isPending }) {
  const [typed, setTyped] = useState("");
  const views = island.island_tables ?? [];
  const confirmed = typed === island.name;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-bold text-foreground text-base flex items-center gap-2">
            <Trash2 size={15} className="text-destructive" />
            Delete Data Island
          </h2>
          <button onClick={onCancel} className="btn-ghost w-8 h-8 p-0 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-foreground">
            This will permanently delete <span className="font-semibold">{island.name}</span> and cannot be undone.
          </p>

          {views.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                <AlertTriangle size={11} /> The following database VIEWs will be permanently dropped:
              </p>
              <ul className="space-y-1">
                {views.map((v) => (
                  <li key={v.id} className="text-xs font-mono text-destructive/80 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive/50 shrink-0" />
                    {v.view_name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {views.length === 0 && island.view_name && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <p className="text-xs text-destructive">
                <span className="font-semibold">VIEW</span>{" "}
                <span className="font-mono">{island.view_name}</span> will be dropped from the database.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs text-muted-foreground">
              Type <span className="font-semibold text-foreground">{island.name}</span> to confirm:
            </label>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmed && !isPending && onConfirm()}
              placeholder={island.name}
              className={`w-full px-3 py-2 text-sm border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 transition-colors placeholder:text-muted-foreground/40 ${
                typed.length > 0
                  ? confirmed
                    ? "border-destructive ring-destructive/20"
                    : "border-border focus:ring-primary/30"
                  : "border-border focus:ring-primary/30"
              }`}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <button onClick={onCancel} className="btn-outline text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={!confirmed || isPending}
            className="btn-primary text-sm bg-destructive hover:bg-destructive/90 border-destructive disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete Island
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DataIslandDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showAddAccess, setShowAddAccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [accessForm, setAccessForm] = useState(emptyAccessForm);
  const [refreshFeedback, setRefreshFeedback] = useState(null);

  const { data: island, isLoading, isError } = useQuery({
    queryKey: ["islands", id],
    queryFn: () => islandsApi.get(id),
  });

  const refreshMut = useMutation({
    mutationFn: () => islandsApi.refresh(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["islands", id] });
      qc.invalidateQueries({ queryKey: ["islands"] });
      setRefreshFeedback({ success: data.success, message: data.message });
      setTimeout(() => setRefreshFeedback(null), 5000);
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err.message || "Refresh failed.";
      setRefreshFeedback({ success: false, message: msg });
      setTimeout(() => setRefreshFeedback(null), 5000);
    },
  });

  const addAccessMut = useMutation({
    mutationFn: (data) => islandsApi.addAccess(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["islands", id] });
      setAccessForm(emptyAccessForm);
      setShowAddAccess(false);
    },
  });

  const removeAccessMut = useMutation({
    mutationFn: (accessId) => islandsApi.removeAccess(id, accessId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["islands", id] }),
  });

  const deleteMut = useMutation({
    mutationFn: () => islandsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["islands"] });
      navigate("/data-islands");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 text-muted-foreground mt-24">
        <Loader2 className="animate-spin" size={18} /> Loading…
      </div>
    );
  }
  if (isError || !island) {
    return (
      <div className="flex items-center justify-center gap-2 text-destructive mt-24">
        <AlertCircle size={18} /> Failed to load island.
      </div>
    );
  }

  const cfg = STATUS_BADGE[island.status] ?? STATUS_BADGE.draft;
  const islandTables = island.island_tables ?? [];
  const hasPerTableViews = islandTables.length > 0;

  const scheduleDisplay = (() => {
    if (island.refresh_type !== "scheduled") return null;
    if (!island.schedule_value) return null;
    if (island.schedule_type === "frequency") {
      try {
        const cfg = JSON.parse(island.schedule_value);
        return `Every ${cfg.every} ${cfg.unit}`;
      } catch { return island.schedule_value; }
    }
    return island.schedule_value;
  })();

  return (
    <div className="space-y-6">

      {/* Back + header */}
      <div>
        <Link to="/data-islands" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ChevronLeft size={14} /> Data Islands
        </Link>

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Layers size={20} className="text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">{island.name}</h1>
                <span className={`badge flex items-center gap-1 ${cfg.cls}`}>
                  <cfg.Icon size={10} /> {cfg.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Database size={11} /> {island.datasource_name}
                {hasPerTableViews && (
                  <><span className="mx-1">·</span>{islandTables.length} view{islandTables.length !== 1 ? "s" : ""}</>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending} className="btn-primary">
              {refreshMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh Now
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-outline text-sm text-destructive border-destructive/40 hover:bg-destructive/5"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>

        {refreshFeedback && (
          <div className={`mt-3 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${
            refreshFeedback.success
              ? "bg-success/10 text-success border border-success/30"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}>
            {refreshFeedback.success ? <CheckCircle size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
            {refreshFeedback.message}
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT (2/3) ───────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Island Details */}
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Island Details</h2>
            {island.description && <p className="text-sm text-muted-foreground">{island.description}</p>}
            <div className="grid grid-cols-2 gap-y-3 text-xs">
              <div>
                <p className="text-muted-foreground">Environment</p>
                <p className="font-medium text-foreground">{island.datasource_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">PII Policy</p>
                <p className="font-medium text-foreground capitalize">{island.pii_policy ?? "allow"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium text-foreground">{new Date(island.created_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Refreshed</p>
                <p className="font-medium text-foreground">
                  {island.last_refreshed_at ? new Date(island.last_refreshed_at).toLocaleString() : "Never"}
                </p>
              </div>
            </div>
          </div>

          {/* Table Views (Phase 2) */}
          {hasPerTableViews && (
            <div className="card">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Table2 size={14} className="text-primary" />
                Table Views ({islandTables.length})
              </h2>
              <div className="space-y-2">
                {islandTables.map((t) => (
                  <div key={t.id} className="border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
                      <div className="flex items-center gap-2 text-xs min-w-0">
                        <span className="font-mono font-semibold text-foreground shrink-0">{t.table_name}</span>
                        <span className="text-muted-foreground shrink-0">→</span>
                        <span className="font-mono text-primary truncate">{t.view_name}</span>
                        {t.time_column && (
                          <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                            <Clock size={9} /> {t.time_column}
                          </span>
                        )}
                      </div>
                      <IslandStatusBadge status={t.status} />
                    </div>
                    <details className="group">
                      <summary className="px-3 py-1.5 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1 list-none">
                        <ChevronRight size={11} className="group-open:rotate-90 transition-transform shrink-0" />
                        <Code size={10} /> View SQL
                      </summary>
                      <pre className="px-3 pb-3 text-[11px] font-mono text-foreground overflow-x-auto leading-relaxed whitespace-pre-wrap bg-card">
                        {t.sql_query}
                      </pre>
                    </details>
                    {t.status === "error" && t.last_error && (
                      <div className="px-3 pb-2.5 text-xs text-destructive border-t border-destructive/20 pt-2">
                        {t.last_error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legacy SQL (Phase 1 islands) */}
          {!hasPerTableViews && island.sql_query && (
            <div className="card">
              <h2 className="text-sm font-semibold text-foreground mb-3">SQL Query</h2>
              <pre className="bg-muted/40 border border-border rounded-lg p-4 text-xs font-mono text-foreground overflow-x-auto leading-relaxed whitespace-pre-wrap">
                {island.sql_query}
              </pre>
            </div>
          )}

          {/* Error details */}
          {island.status === "error" && island.last_error && !hasPerTableViews && (
            <div className="card border-destructive/30 bg-destructive/5">
              <h2 className="text-sm font-semibold text-destructive mb-3 flex items-center gap-2">
                <AlertTriangle size={14} /> Error Details
              </h2>
              <pre className="text-xs font-mono text-destructive overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {island.last_error}
              </pre>
            </div>
          )}
        </div>

        {/* ── RIGHT (1/3) ──────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Access Management */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Shield size={14} className="text-primary" /> Access Management
              </h2>
              <button onClick={() => setShowAddAccess(!showAddAccess)} className="btn-outline text-xs py-1.5">
                <UserPlus size={12} /> Add User
              </button>
            </div>

            {showAddAccess && (
              <div className="mb-4 p-3 bg-muted/30 border border-border rounded-lg space-y-2">
                <input className="w-full px-3 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                  placeholder="Email address *" type="email"
                  value={accessForm.email}
                  onChange={(e) => setAccessForm({ ...accessForm, email: e.target.value })}
                />
                <input className="w-full px-3 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                  placeholder="Display name (optional)"
                  value={accessForm.name}
                  onChange={(e) => setAccessForm({ ...accessForm, name: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select className="px-3 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground"
                    value={accessForm.role}
                    onChange={(e) => setAccessForm({ ...accessForm, role: e.target.value })}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                  <input className="px-3 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                    placeholder="Granted by"
                    value={accessForm.granted_by}
                    onChange={(e) => setAccessForm({ ...accessForm, granted_by: e.target.value })}
                  />
                </div>
                {addAccessMut.isError && (
                  <p className="text-xs text-destructive">
                    {addAccessMut.error?.response?.data?.email?.[0] || addAccessMut.error?.response?.data?.detail || "Failed to add user."}
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => addAccessMut.mutate(accessForm)} disabled={!accessForm.email || addAccessMut.isPending}
                    className="btn-primary text-xs py-1.5 flex-1 justify-center">
                    {addAccessMut.isPending && <Loader2 size={11} className="animate-spin" />} Save
                  </button>
                  <button onClick={() => { setShowAddAccess(false); setAccessForm(emptyAccessForm); }}
                    className="btn-outline text-xs py-1.5 flex-1 justify-center">Cancel</button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {(island.access_grants ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No users added yet</p>
              ) : (
                island.access_grants.map((grant) => (
                  <div key={grant.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                      {(grant.name || grant.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{grant.name || grant.email}</p>
                      {grant.name && <p className="text-[10px] text-muted-foreground truncate">{grant.email}</p>}
                    </div>
                    <span className={`badge text-[10px] ${ROLE_BADGE[grant.role] ?? ROLE_BADGE.viewer}`}>{grant.role}</span>
                    <button onClick={() => removeAccessMut.mutate(grant.id)}
                      disabled={removeAccessMut.isPending && removeAccessMut.variables === grant.id}
                      className="btn-ghost w-6 h-6 p-0 flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0">
                      {removeAccessMut.isPending && removeAccessMut.variables === grant.id
                        ? <Loader2 size={10} className="animate-spin" />
                        : <X size={11} />}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Refresh Settings */}
          <div className="card space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <RefreshCw size={14} className="text-primary" /> Refresh Settings
            </h2>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="badge bg-muted text-muted-foreground capitalize">{island.refresh_type ?? "static"}</span>
              </div>
              {island.refresh_type === "scheduled" && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Schedule</span>
                    <span className="font-mono text-foreground text-[11px]">{scheduleDisplay ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Next Run</span>
                    <span className="text-foreground">
                      {island.next_run_at ? new Date(island.next_run_at).toLocaleString() : "—"}
                    </span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Strategy</span>
                <span className="badge bg-muted text-muted-foreground capitalize">{island.refresh_strategy ?? "full"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">PII Policy</span>
                <span className="flex items-center gap-1 badge bg-muted text-muted-foreground capitalize">
                  {island.pii_policy !== "allow" && <ShieldAlert size={9} />}
                  {island.pii_policy ?? "allow"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last Refreshed</span>
                <span className="text-foreground">
                  {island.last_refreshed_at ? new Date(island.last_refreshed_at).toLocaleString() : "Never"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <DeleteConfirmModal
          island={island}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => deleteMut.mutate()}
          isPending={deleteMut.isPending}
        />
      )}
    </div>
  );
}
