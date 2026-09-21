import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { relationshipsApi } from "../../api/client";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60";

export default function Step2Reference({ form, setForm, onBack, onNext }) {
  const [error, setError] = useState("");

  const { data: relData, isLoading } = useQuery({
    queryKey: ["relationships", form.datasource_id],
    queryFn: () => relationshipsApi.get(form.datasource_id),
    enabled: !!form.datasource_id,
  });

  const tables = relData?.tables ?? [];
  const selectedCols =
    tables.find((t) => t.table_name === form.identifier_table)?.all_columns ?? [];

  function validate() {
    if (!form.identifier_table) return "Please select the table that holds this subject's identity record.";
    if (!form.identifier_column) return "Please select the column that holds the subject identifier.";
    return "";
  }

  function handleNext() {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    onNext();
  }

  return (
    <div className="space-y-6">
      <div className="bg-muted/40 border border-border rounded-lg px-4 py-3 text-sm text-muted-foreground">
        Select the table that acts as the primary identity record — the engine will traverse all FK
        relationships from here to find every piece of data belonging to this subject.
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Identity Table</label>
          {isLoading ? (
            <div className="text-xs text-muted-foreground py-2">Loading tables…</div>
          ) : (
            <select
              className={inputCls}
              value={form.identifier_table}
              onChange={(e) =>
                setForm((f) => ({ ...f, identifier_table: e.target.value, identifier_column: "" }))
              }
            >
              <option value="">Select table…</option>
              {tables.map((t) => (
                <option key={t.table_name} value={t.table_name}>{t.table_name}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Identifier Column</label>
          <select
            className={inputCls}
            value={form.identifier_column}
            disabled={!form.identifier_table}
            onChange={(e) => setForm((f) => ({ ...f, identifier_column: e.target.value }))}
          >
            <option value="">Select column…</option>
            {selectedCols.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {form.identifier_table && form.identifier_column && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 text-xs text-muted-foreground">
          Will look for <strong>{form.subject_id}</strong> in{" "}
          <span className="font-mono text-foreground">
            {form.identifier_table}.{form.identifier_column}
          </span>{" "}
          and traverse all connected tables.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="btn btn-ghost flex items-center gap-2">
          <ChevronLeft size={15} /> Back
        </button>
        <button type="button" onClick={handleNext} className="btn btn-primary flex items-center gap-2">
          Start Discovery <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
