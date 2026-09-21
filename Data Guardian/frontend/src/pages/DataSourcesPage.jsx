import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { datasourceApi, catalogueApi } from "../api/client";
import { useNavigate } from "react-router-dom";
import {
  Plus, Zap, Trash2, BookOpen, Loader2, Database,
  AlertCircle, CheckCircle, Clock, AlertTriangle,
  RefreshCw, Eye,
} from "lucide-react";
import DataSourceForm from "../components/DataSourceForm";

const DB_ICONS = {
  postgresql: "🐘", mysql: "🐬", sqlite: "📁", bigquery: "☁️", snowflake: "❄️",
};

function StatusBadge({ status }) {
  if (status === "connected") return (
    <span className="badge bg-success/10 text-success">
      <CheckCircle size={10} /> Active
    </span>
  );
  if (status === "error") return (
    <span className="badge bg-destructive/10 text-destructive">
      <AlertTriangle size={10} /> Error
    </span>
  );
  return (
    <span className="badge bg-muted text-muted-foreground">
      <Clock size={10} /> Pending
    </span>
  );
}

export default function DataSourcesPage() {
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["datasources"],
    queryFn: datasourceApi.list,
  });

  const deleteMut = useMutation({
    mutationFn: datasourceApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datasources"] }),
  });

  const testMut = useMutation({
    mutationFn: datasourceApi.testConnection,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datasources"] }),
  });

  const generateMut = useMutation({
    mutationFn: (id) => catalogueApi.generateCatalogue(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datasources"] });
      navigate("/runs");
    },
  });

  const sources = data?.results ?? data ?? [];
  const connected = sources.filter((s) => s.status === "connected").length;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Environments</h1>
          <p className="text-sm text-muted-foreground">Manage connected databases and core environments</p>
        </div>
        <div className="flex items-center gap-3">
          {sources.length > 0 && (
            <span className="badge bg-success/10 text-success px-3 py-1.5">
              {connected} connected
            </span>
          )}
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus size={15} />
            Create New Environment
          </button>
        </div>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 text-muted-foreground mt-24">
          <Loader2 className="animate-spin" size={18} /> Loading environments…
        </div>
      )}
      {isError && (
        <div className="flex items-center justify-center gap-2 text-destructive mt-24">
          <AlertCircle size={18} /> Failed to load data sources.
        </div>
      )}

      {/* Source cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sources.map((ds) => (
          <div key={ds.id} className="card hover:shadow-md transition-shadow">
            {/* Card header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Database size={20} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground leading-tight">{ds.name}</h3>
                  <p className="text-xs text-muted-foreground capitalize mt-0.5">{ds.db_type}</p>
                </div>
              </div>
              <StatusBadge status={ds.status} />
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-y-2 text-xs mb-4">
              <div>
                <p className="text-muted-foreground">Host</p>
                <p className="font-medium text-foreground truncate">{ds.host || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Type</p>
                <p className="font-medium text-foreground capitalize">{ds.db_type}</p>
              </div>
              {ds.last_tested_at && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Last tested</p>
                  <p className="font-medium text-foreground flex items-center gap-1">
                    <RefreshCw size={10} />
                    {new Date(ds.last_tested_at).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            {/* Error */}
            {ds.last_error && (
              <div className="mb-3 p-2 bg-destructive/5 border border-destructive/20 rounded-md">
                <p className="text-xs text-destructive truncate">{ds.last_error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-3 border-t border-border">
              <button
                onClick={() => testMut.mutate(ds.id)}
                disabled={testMut.isPending && testMut.variables === ds.id}
                className="btn-outline text-xs py-1.5 flex-1"
              >
                {testMut.isPending && testMut.variables === ds.id
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Zap size={12} />}
                Ping DB
              </button>
              <button
                onClick={() => navigate(`/catalogue?datasource=${ds.id}`)}
                className="btn-outline text-xs py-1.5 flex-1"
              >
                <Eye size={12} />
                View Tables
              </button>
              <button
                onClick={() => generateMut.mutate(ds.id)}
                disabled={generateMut.isPending && generateMut.variables === ds.id}
                className="btn-ghost text-xs py-1.5 w-8 h-8 p-0 flex items-center justify-center"
                title="Generate Catalogue"
              >
                {generateMut.isPending && generateMut.variables === ds.id
                  ? <Loader2 size={12} className="animate-spin" />
                  : <RefreshCw size={12} />}
              </button>
              <button
                onClick={() => { if (confirm(`Delete "${ds.name}"?`)) deleteMut.mutate(ds.id); }}
                className="btn-ghost text-xs py-1.5 w-8 h-8 p-0 flex items-center justify-center text-destructive hover:bg-destructive/10"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}

        {/* Empty state / Add connection placeholder */}
        {!isLoading && (
          <button
            onClick={() => setShowForm(true)}
            className="min-h-[200px] border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <Plus size={32} className="text-muted-foreground" />
            <p className="text-sm">Add Connection</p>
          </button>
        )}
      </div>

      {showForm && (
        <DataSourceForm
          onClose={() => setShowForm(false)}
          onSuccess={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
