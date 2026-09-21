import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Layers, Plus, Trash2, RefreshCw, Eye, Loader2,
  AlertCircle, CheckCircle, Clock, AlertTriangle, Database,
} from "lucide-react";
import { islandsApi } from "../api/client";
import DataIslandForm from "../components/DataIslandForm";

const STATUS_BADGE = {
  active: { cls: "bg-success/10 text-success",         label: "Active",  Icon: CheckCircle },
  error:  { cls: "bg-destructive/10 text-destructive", label: "Error",   Icon: AlertTriangle },
  draft:  { cls: "bg-muted text-muted-foreground",     label: "Draft",   Icon: Clock },
  stale:  { cls: "bg-warning/10 text-warning",         label: "Stale",   Icon: AlertTriangle },
};

function IslandStatusBadge({ status }) {
  const cfg = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
  return (
    <span className={`badge flex items-center gap-1 ${cfg.cls}`}>
      <cfg.Icon size={10} />
      {cfg.label}
    </span>
  );
}

export default function DataIslandsPage() {
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["islands"],
    queryFn: islandsApi.list,
  });

  const deleteMut = useMutation({
    mutationFn: islandsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["islands"] }),
  });

  const refreshMut = useMutation({
    mutationFn: islandsApi.refresh,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["islands"] }),
  });

  const islands = data?.results ?? data ?? [];
  const activeCount = islands.filter((i) => i.status === "active").length;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Data Islands</h1>
          <p className="text-sm text-muted-foreground">
            Governed SQL views for shareable, team-level data access
          </p>
        </div>
        <div className="flex items-center gap-3">
          {islands.length > 0 && (
            <span className="badge bg-success/10 text-success px-3 py-1.5">
              {activeCount} active
            </span>
          )}
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus size={15} />
            Create Island
          </button>
        </div>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 text-muted-foreground mt-24">
          <Loader2 className="animate-spin" size={18} /> Loading islands…
        </div>
      )}
      {isError && (
        <div className="flex items-center justify-center gap-2 text-destructive mt-24">
          <AlertCircle size={18} /> Failed to load data islands.
        </div>
      )}

      {/* Island cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {islands.map((island) => (
          <div key={island.id} className="card hover:shadow-md transition-shadow">

            {/* Card header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Layers size={20} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground leading-tight truncate">
                    {island.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Database size={10} />
                    {island.datasource_name}
                  </p>
                </div>
              </div>
              <IslandStatusBadge status={island.status} />
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-y-2 text-xs mb-4">
              <div>
                <p className="text-muted-foreground">Views</p>
                <p className="font-medium text-foreground">
                  {island.view_count ?? 0} view{(island.view_count ?? 0) !== 1 ? "s" : ""}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Refresh</p>
                <p className="font-medium text-foreground capitalize">
                  {island.refresh_type ?? "static"}
                  {island.next_run_at && (
                    <span className="ml-1 text-muted-foreground text-[10px]">
                      · {new Date(island.next_run_at).toLocaleDateString()}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Access</p>
                <p className="font-medium text-foreground">{island.access_count} user{island.access_count !== 1 ? "s" : ""}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Refreshed</p>
                <p className="font-medium text-foreground">
                  {island.last_refreshed_at
                    ? new Date(island.last_refreshed_at).toLocaleDateString()
                    : "Never"}
                </p>
              </div>
            </div>

            {/* Description */}
            {island.description && (
              <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{island.description}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-3 border-t border-border">
              <button
                onClick={() => navigate(`/data-islands/${island.id}`)}
                className="btn-outline text-xs py-1.5 flex-1"
              >
                <Eye size={12} />
                View Details
              </button>
              <button
                onClick={() => refreshMut.mutate(island.id)}
                disabled={refreshMut.isPending && refreshMut.variables === island.id}
                className="btn-ghost text-xs py-1.5 w-8 h-8 p-0 flex items-center justify-center"
                title="Refresh Island"
              >
                {refreshMut.isPending && refreshMut.variables === island.id
                  ? <Loader2 size={12} className="animate-spin" />
                  : <RefreshCw size={12} />}
              </button>
              <button
                onClick={() => {
                  const viewCount = island.view_count ?? 0;
                  const msg = viewCount > 0
                    ? `Delete "${island.name}"? This will permanently drop ${viewCount} database VIEW${viewCount !== 1 ? "s" : ""}.`
                    : `Delete "${island.name}"? This cannot be undone.`;
                  if (confirm(msg)) {
                    deleteMut.mutate(island.id);
                  }
                }}
                className="btn-ghost text-xs py-1.5 w-8 h-8 p-0 flex items-center justify-center text-destructive hover:bg-destructive/10"
                title="Delete Island"
              >
                {deleteMut.isPending && deleteMut.variables === island.id
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Trash2 size={12} />}
              </button>
            </div>
          </div>
        ))}

        {/* Dashed "Create" placeholder card */}
        {!isLoading && (
          <button
            onClick={() => setShowForm(true)}
            className="min-h-[200px] border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <Plus size={32} className="text-muted-foreground" />
            <p className="text-sm">Create Island</p>
          </button>
        )}
      </div>

      {/* Empty state */}
      {!isLoading && islands.length === 0 && (
        <div className="card text-center py-20 -mt-4">
          <Layers size={48} className="text-muted mx-auto mb-4" />
          <p className="text-foreground font-semibold">No Data Islands yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-6">
            Create a governed SQL view from any connected environment.
          </p>
          <button onClick={() => setShowForm(true)} className="btn-primary inline-flex">
            <Plus size={14} /> Create Your First Island
          </button>
        </div>
      )}

      {showForm && (
        <DataIslandForm
          onClose={() => setShowForm(false)}
          onSuccess={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
