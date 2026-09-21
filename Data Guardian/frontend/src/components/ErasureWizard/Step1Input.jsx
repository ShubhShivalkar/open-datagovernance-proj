import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { relationshipsApi } from "../../api/client";
import { Upload, Type, Table2, ChevronRight, AlertCircle, Database } from "lucide-react";

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60";

const MODE_OPTIONS = [
  { value: "text",  label: "Text",        desc: "Comma or newline-separated IDs",  Icon: Type },
  { value: "csv",   label: "CSV Upload",  desc: "Upload a .csv file",              Icon: Upload },
  { value: "table", label: "From Table",  desc: "Query a column in your database", Icon: Table2 },
];

export default function Step1Input({ form, setForm, onNext }) {
  const [error, setError] = useState("");

  const dsId = form.datasource_id;
  const { data: relData } = useQuery({
    queryKey: ["relationships", dsId],
    queryFn: () => relationshipsApi.get(dsId),
    enabled: !!dsId && form.input_type === "table",
  });
  const tables = relData?.tables ?? [];

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setForm((f) => ({ ...f, input_raw: ev.target.result }));
    reader.readAsText(file);
  }

  function validate() {
    if (!form.data_principal_id.trim()) return "Please enter a label for the data principal (e.g. an email or name).";
    if (form.input_type === "text" && !form.input_raw.trim())
      return "Please enter at least one identifier value.";
    if (form.input_type === "csv" && !form.input_raw.trim())
      return "Please upload a CSV file.";
    if (form.input_type === "table" && (!form.source_table || !form.source_column))
      return "Please select a table and column to source identifiers from.";
    return "";
  }

  function handleNext() {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    onNext();
  }

  const selectedCols =
    tables.find((t) => t.table_name === form.source_table)?.all_columns ?? [];

  return (
    <div className="space-y-6">
      {/* Active environment (read-only) */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Data Source</label>
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-muted/40 text-sm text-foreground">
          <Database size={14} className="text-muted-foreground shrink-0" />
          <span className="font-medium">{form.datasource_name}</span>
          <span className="text-xs text-muted-foreground capitalize">({form.datasource_db_type})</span>
          <span className="ml-auto text-xs text-muted-foreground">Active environment</span>
        </div>
      </div>

      {/* Data Principal Label */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Data Principal Label
          <span className="text-muted-foreground font-normal ml-1.5 text-xs">— a human-readable identifier (e.g. email or user ID)</span>
        </label>
        <input
          type="text"
          className={inputCls}
          placeholder="e.g. john.doe@example.com"
          value={form.data_principal_id}
          onChange={(e) => setForm((f) => ({ ...f, data_principal_id: e.target.value }))}
        />
      </div>

      {/* Input mode selector */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Input Method</label>
        <div className="grid grid-cols-3 gap-3">
          {MODE_OPTIONS.map(({ value, label, desc, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setForm((f) => ({ ...f, input_type: value, input_raw: "" }))}
              className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all ${
                form.input_type === value
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <Icon size={16} className={form.input_type === value ? "text-primary" : "text-muted-foreground"} />
              <span className="text-sm font-medium text-foreground">{label}</span>
              <span className="text-xs text-muted-foreground">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic input area */}
      {form.input_type === "text" && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Identifier Values</label>
          <textarea
            className={`${inputCls} min-h-[100px] resize-y font-mono text-xs`}
            placeholder={"user_123\nuser_456\nor: user_123, user_456"}
            value={form.input_raw}
            onChange={(e) => setForm((f) => ({ ...f, input_raw: e.target.value }))}
          />
        </div>
      )}

      {form.input_type === "csv" && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">CSV File</label>
          <input
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm text-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:text-sm file:cursor-pointer cursor-pointer"
            onChange={handleFile}
          />
          {form.input_raw && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              File loaded — first column values will be used as identifiers.
            </p>
          )}
        </div>
      )}

      {form.input_type === "table" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Source Table</label>
            <select
              className={inputCls}
              value={form.source_table}
              disabled={!form.datasource_id}
              onChange={(e) => setForm((f) => ({ ...f, source_table: e.target.value, source_column: "" }))}
            >
              <option value="">{form.datasource_id ? "Select table…" : "Select a data source first"}</option>
              {tables.map((t) => (
                <option key={t.table_name} value={t.table_name}>{t.table_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Identifier Column</label>
            <select
              className={inputCls}
              value={form.source_column}
              disabled={!form.source_table}
              onChange={(e) => setForm((f) => ({ ...f, source_column: e.target.value }))}
            >
              <option value="">Select column…</option>
              {selectedCols.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleNext}
          className="btn btn-primary flex items-center gap-2"
        >
          Next <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
