import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { catalogueApi } from "../api/client";
import {
  ArrowLeft, Loader2, AlertCircle, Pencil, Check, X,
  ShieldAlert, Table2, ChevronRight,
} from "lucide-react";
import ColumnCard from "../components/ColumnCard";

export default function TableDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [editingDesc, setEditingDesc] = useState(false);
  const [draftDesc, setDraftDesc] = useState("");

  const { data: table, isLoading, isError } = useQuery({
    queryKey: ["table", id],
    queryFn: () => catalogueApi.getTable(id),
    onSuccess: (d) => setDraftDesc(d.effective_description),
  });

  const updateMut = useMutation({
    mutationFn: (data) => catalogueApi.updateTable(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["table", id] });
      setEditingDesc(false);
    },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center gap-2 text-muted-foreground mt-24">
      <Loader2 className="animate-spin" size={18} /> Loading…
    </div>
  );

  if (isError || !table) return (
    <div className="flex items-center justify-center gap-2 text-destructive mt-24">
      <AlertCircle size={18} /> Failed to load table.
    </div>
  );

  const highPiiCols   = table.columns?.filter((c) => c.effective_pii_likelihood === "high")   ?? [];
  const mediumPiiCols = table.columns?.filter((c) => c.effective_pii_likelihood === "medium") ?? [];

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Breadcrumb */}
      <Link
        to="/catalogue"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors font-medium"
      >
        <ArrowLeft size={14} /> Data Catalog
        <ChevronRight size={12} className="text-muted-foreground/50" />
        <span className="text-foreground">{table.table_name}</span>
      </Link>

      {/* Table header card */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Table2 size={15} className="text-primary shrink-0" />
              {table.schema_name && (
                <span className="text-xs text-muted-foreground font-mono">{table.schema_name} /</span>
              )}
            </div>
            <h1 className="text-xl font-bold text-foreground font-mono">{table.table_name}</h1>

            {/* Meta badges */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {table.effective_domain && (
                <span className="badge bg-primary/10 text-primary">{table.effective_domain}</span>
              )}
              <span className="badge bg-muted text-muted-foreground">
                {table.columns?.length ?? 0} columns
              </span>
              {table.row_count_estimate != null && (
                <span className="badge bg-muted text-muted-foreground">
                  ~{Number(table.row_count_estimate).toLocaleString()} rows
                </span>
              )}
              {highPiiCols.length > 0 && (
                <span className="badge bg-destructive/10 text-destructive flex items-center gap-1">
                  <ShieldAlert size={10} /> {highPiiCols.length} High PII
                </span>
              )}
              {mediumPiiCols.length > 0 && (
                <span className="badge bg-warning/10 text-warning flex items-center gap-1">
                  <ShieldAlert size={10} /> {mediumPiiCols.length} Medium PII
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Description</p>
            {!editingDesc && (
              <button
                onClick={() => { setDraftDesc(table.effective_description); setEditingDesc(true); }}
                className="text-muted-foreground/50 hover:text-primary transition-colors"
              >
                <Pencil size={12} />
              </button>
            )}
          </div>

          {editingDesc ? (
            <div className="space-y-2">
              <textarea
                className="w-full h-24 resize-none px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground"
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => updateMut.mutate({ description: draftDesc })}
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  <Check size={11} /> Save
                </button>
                <button
                  onClick={() => setEditingDesc(false)}
                  className="btn-ghost text-xs py-1.5 px-3 text-muted-foreground"
                >
                  <X size={11} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground leading-relaxed">
              {table.effective_description || (
                <span className="italic text-muted-foreground/50">No description yet — click the edit icon to add one.</span>
              )}
            </p>
          )}
        </div>

        {/* Business purpose */}
        {table.effective_business_purpose && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Business Purpose</p>
            <p className="text-sm text-foreground">{table.effective_business_purpose}</p>
          </div>
        )}
      </div>

      {/* PII warning banner */}
      {(highPiiCols.length > 0 || mediumPiiCols.length > 0) && (
        <div className="flex items-start gap-3 p-4 bg-warning/10 border border-warning/30 rounded-lg">
          <ShieldAlert size={18} className="text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">PII Detected in This Table</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {highPiiCols.length > 0 && `${highPiiCols.length} high-risk column${highPiiCols.length > 1 ? "s" : ""}: ${highPiiCols.map(c => c.column_name).join(", ")}. `}
              {mediumPiiCols.length > 0 && `${mediumPiiCols.length} medium-risk column${mediumPiiCols.length > 1 ? "s" : ""}: ${mediumPiiCols.map(c => c.column_name).join(", ")}.`}
            </p>
          </div>
        </div>
      )}

      {/* Columns */}
      <div>
        <h2 className="text-sm font-bold text-foreground uppercase tracking-widest mb-3">
          Columns ({table.columns?.length ?? 0})
        </h2>
        <div className="space-y-2">
          {(table.columns ?? []).map((col) => (
            <ColumnCard key={col.id} column={col} tableId={id} />
          ))}
        </div>
      </div>
    </div>
  );
}
