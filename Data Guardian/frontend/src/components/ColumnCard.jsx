import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { catalogueApi } from "../api/client";
import { Key, Link2, Pencil, Check, X, ShieldAlert } from "lucide-react";

const CATEGORY_BADGE = {
  identifier: "bg-primary/10 text-primary",
  timestamp:  "bg-muted text-muted-foreground",
  metric:     "bg-success/10 text-success",
  dimension:  "bg-warning/10 text-warning",
  flag:       "bg-accent/20 text-accent-foreground",
  text:       "bg-muted text-muted-foreground",
  json:       "bg-orange-100 text-orange-700",
  other:      "bg-muted text-muted-foreground",
};

const PII_BADGE = {
  none:   null,
  low:    "bg-warning/10 text-warning",
  medium: "bg-warning/10 text-warning",
  high:   "bg-destructive/10 text-destructive",
};

export default function ColumnCard({ column, tableId }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ description: column.effective_description });

  const updateMut = useMutation({
    mutationFn: (data) => catalogueApi.updateColumn(column.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["table", tableId] });
      setEditing(false);
    },
  });

  const piiBadge = PII_BADGE[column.effective_pii_likelihood];
  const catBadge = CATEGORY_BADGE[column.effective_data_category] ?? CATEGORY_BADGE.other;

  const borderClass =
    column.effective_pii_likelihood === "high"
      ? "border-destructive/30"
      : column.effective_pii_likelihood === "medium"
        ? "border-warning/30"
        : "border-border";

  return (
    <div className={`bg-card border ${borderClass} rounded-lg px-4 py-3.5 hover:shadow-sm transition-shadow`}>
      <div className="flex items-start gap-3">

        {/* Left: name + badges */}
        <div className="shrink-0 flex flex-col gap-1.5 items-start pt-0.5 min-w-[140px]">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-semibold text-foreground">
              {column.column_name}
            </span>
            {column.is_primary_key && <Key size={11} className="text-warning" title="Primary Key" />}
            {column.is_foreign_key && <Link2 size={11} className="text-primary" title="Foreign Key" />}
          </div>

          <span className="font-mono text-[10px] text-muted-foreground">
            {column.data_type}
            {column.max_length ? `(${column.max_length})` : ""}
            {column.nullable ? "" : " ·NN"}
          </span>

          {column.effective_data_category && (
            <span className={`badge ${catBadge}`}>
              {column.effective_data_category}
            </span>
          )}

          {piiBadge && (
            <span className={`badge ${piiBadge} flex items-center gap-1`}>
              <ShieldAlert size={9} />
              {column.effective_pii_likelihood} PII
            </span>
          )}
        </div>

        {/* Right: description */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <textarea
                className="w-full h-16 resize-none px-3 py-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 text-foreground"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => updateMut.mutate({ description: draft.description })}
                  className="btn-primary text-xs py-1 px-2.5"
                >
                  <Check size={11} /> Save
                </button>
                <button
                  onClick={() => { setEditing(false); setDraft({ description: column.effective_description }); }}
                  className="btn-ghost text-xs py-1 px-2.5 text-muted-foreground"
                >
                  <X size={11} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2 group">
              <div className="flex-1">
                <p className="text-sm text-foreground leading-relaxed">
                  {column.effective_description || (
                    <span className="italic text-muted-foreground/50 text-xs">No description</span>
                  )}
                </p>
                {column.effective_business_name && column.effective_business_name !== column.column_name && (
                  <p className="text-[11px] text-primary mt-1 font-medium">
                    "{column.effective_business_name}"
                  </p>
                )}
                {column.foreign_key_references && (
                  <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                    → {column.foreign_key_references.table}.{column.foreign_key_references.column}
                  </p>
                )}
              </div>
              <button
                onClick={() => { setDraft({ description: column.effective_description }); setEditing(true); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-primary transition-all shrink-0 mt-0.5"
              >
                <Pencil size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
