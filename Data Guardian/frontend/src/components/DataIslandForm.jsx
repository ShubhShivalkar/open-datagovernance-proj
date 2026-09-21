import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { islandsApi, datasourceApi, catalogueApi } from "../api/client";
import {
  X, Loader2, ChevronRight, CheckCircle, AlertCircle,
  Code, Table2, Layers, ShieldAlert, Clock, RefreshCw,
} from "lucide-react";

const DB_ICONS = { postgresql: "🐘", mysql: "🐬", sqlite: "📁", bigquery: "☁️", snowflake: "❄️" };

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60 transition-colors";

const selectCls = inputCls;

function toViewName(name, table) {
  const slug = (s) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "x";
  const tableSlug = (s) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "x";
  return `di_${slug(name)}.${tableSlug(table)}`;
}

function buildTableSqlPreview(tableName, piiColumns, piiPolicy, refreshStrategy, timeColumn, dbType) {
  const refreshTimeExpr =
    dbType === "postgresql"
      ? "EXTRACT(EPOCH FROM NOW())::bigint AS query_refresh_time"
      : "UNIX_TIMESTAMP() AS query_refresh_time";

  let colList;
  if (!piiColumns || piiColumns.length === 0) {
    colList = ["*", refreshTimeExpr];
  } else {
    const cols = [];
    for (const col of piiColumns) {
      const isPii = ["medium", "high"].includes(col.effective_pii_likelihood);
      if (isPii && piiPolicy === "hide") continue;
      if (isPii && piiPolicy === "encrypt") {
        cols.push(
          dbType === "postgresql"
            ? `MD5(${col.name}::text) AS ${col.name}`
            : `MD5(CAST(${col.name} AS CHAR)) AS ${col.name}`
        );
      } else {
        cols.push(col.name);
      }
    }
    cols.push(refreshTimeExpr);
    colList = cols;
  }

  let sql = `SELECT\n  ${colList.join(",\n  ")}\nFROM ${tableName}`;

  if (refreshStrategy === "incremental" && timeColumn) {
    const filter =
      dbType === "postgresql"
        ? `WHERE EXTRACT(EPOCH FROM ${timeColumn})::bigint > 0`
        : `WHERE UNIX_TIMESTAMP(${timeColumn}) > 0`;
    sql += `\n${filter}`;
  }
  return sql;
}

const STEP_LABELS = ["Environment", "Island Config", "Pick Tables", "Review & Create"];

export default function DataIslandForm({ onClose, onSuccess }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    datasource_id: "",
    datasource_name: "",
    datasource_db_type: "mysql",
    name: "",
    description: "",
    refresh_type: "static",
    schedule_type: "cron",
    schedule_value: "",
    frequency_every: 1,
    frequency_unit: "hours",
    pii_policy: "allow",
    refresh_strategy: "full",
  });

  const [selectedTables, setSelectedTables] = useState([]);
  const [tableConfigs, setTableConfigs] = useState({});
  const [schemaData, setSchemaData] = useState(null);
  const [catalogueTables, setCatalogueTables] = useState({});
  const [catalogueWarning, setCatalogueWarning] = useState(false);
  const [catalogueDetails, setCatalogueDetails] = useState({}); // { table_name: [{name, effective_pii_likelihood}] }
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState("");

  const dsQuery = useQuery({ queryKey: ["datasources"], queryFn: datasourceApi.list });
  const sources = dsQuery.data?.results ?? dsQuery.data ?? [];

  const createMut = useMutation({
    mutationFn: () => {
      const scheduleValue =
        form.refresh_type === "scheduled"
          ? form.schedule_type === "cron"
            ? form.schedule_value
            : JSON.stringify({ every: form.frequency_every, unit: form.frequency_unit })
          : "";
      return islandsApi.create({
        datasource: form.datasource_id,
        name: form.name,
        description: form.description,
        refresh_type: form.refresh_type,
        schedule_type: form.schedule_type,
        schedule_value: scheduleValue,
        pii_policy: form.pii_policy,
        refresh_strategy: form.refresh_strategy,
        table_configs: selectedTables.map((t) => ({
          table_name: t,
          time_column: tableConfigs[t]?.time_column ?? "",
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["islands"] });
      onSuccess?.();
    },
  });

  // ── Step transitions ──────────────────────────────────────────────────────

  async function handlePickDatasource(ds) {
    setForm({ ...form, datasource_id: ds.id, datasource_name: ds.name, datasource_db_type: ds.db_type });
    setSchemaLoading(true);
    setSchemaError("");
    setSchemaData(null);
    setCatalogueWarning(false);
    setCatalogueTables({});

    try {
      const [schemaResult, catalogueResult] = await Promise.allSettled([
        datasourceApi.rawSchema(ds.id),
        catalogueApi.listTables({ datasource: ds.id }),
      ]);

      if (schemaResult.status === "fulfilled") {
        setSchemaData(schemaResult.value.schema ?? schemaResult.value);
      } else {
        setSchemaError("Could not load schema. You can still pick tables manually.");
        setSchemaData({});
      }

      if (catalogueResult.status === "fulfilled") {
        const tables = catalogueResult.value?.results ?? catalogueResult.value ?? [];
        // Build a map: table_name → { pii_column_count }
        const map = {};
        tables.forEach((t) => { map[t.table_name] = t; });
        setCatalogueTables(map);
        if (tables.length === 0) setCatalogueWarning(true);
      } else {
        setCatalogueWarning(true);
      }
    } finally {
      setSchemaLoading(false);
    }
    setStep(2);
  }

  function handleTableToggle(tableName) {
    setSelectedTables((prev) =>
      prev.includes(tableName) ? prev.filter((t) => t !== tableName) : [...prev, tableName]
    );
  }

  const tableNames = schemaData ? Object.keys(schemaData).sort() : [];

  const canProceedStep2 =
    form.name.trim() &&
    (form.refresh_type !== "scheduled" || form.schedule_value.trim() ||
      (form.schedule_type === "frequency" && form.frequency_every > 0));

  async function handleGoToReview() {
    const toFetch = selectedTables.filter(
      (t) => catalogueTables[t]?.id && !catalogueDetails[t]
    );
    if (toFetch.length > 0) {
      const results = await Promise.allSettled(
        toFetch.map((t) => catalogueApi.getTable(catalogueTables[t].id))
      );
      const newDetails = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          newDetails[toFetch[i]] = (r.value.columns ?? []).map((c) => ({
            name: c.column_name,
            effective_pii_likelihood: c.effective_pii_likelihood,
          }));
        }
      });
      setCatalogueDetails((prev) => ({ ...prev, ...newDetails }));
    }
    setStep(4);
  }

  const canProceedStep3 =
    selectedTables.length > 0 &&
    (form.refresh_strategy !== "incremental" ||
      selectedTables.every((t) => tableConfigs[t]?.time_column));

  const errorMessage =
    createMut.error?.response?.data?.detail ||
    (typeof createMut.error?.response?.data === "string" ? createMut.error.response.data : null) ||
    createMut.error?.message ||
    "An unexpected error occurred.";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-bold text-foreground text-base flex items-center gap-2">
              <Layers size={16} className="text-primary" />
              Create Data Island
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Step {step} of 4 — {STEP_LABELS[step - 1]}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 shrink-0">
          <div className="flex items-center gap-2 mb-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="flex items-center gap-2 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  step > n ? "bg-success text-white"
                  : step === n ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
                }`}>
                  {step > n ? <CheckCircle size={12} /> : n}
                </div>
                {n < 4 && <div className={`flex-1 h-0.5 ${step > n ? "bg-success" : "bg-border"}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-2">

          {/* ── Step 1: Pick DataSource ──────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-2">
              {dsQuery.isLoading && (
                <div className="flex justify-center py-10">
                  <Loader2 size={18} className="animate-spin text-muted-foreground" />
                </div>
              )}
              {sources.map((ds) => (
                <button
                  key={ds.id}
                  onClick={() => handlePickDatasource(ds)}
                  disabled={schemaLoading}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border border-border rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                >
                  <span className="text-2xl">{DB_ICONS[ds.db_type] ?? "🗄️"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground group-hover:text-primary truncate">{ds.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{ds.db_type}</p>
                  </div>
                  <span className={`badge text-[10px] ${ds.status === "connected" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                    {ds.status}
                  </span>
                  <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary shrink-0" />
                </button>
              ))}
              {!dsQuery.isLoading && sources.length === 0 && (
                <p className="text-center py-10 text-sm text-muted-foreground">
                  No connected environments. Add one first.
                </p>
              )}
              {schemaLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 size={14} className="animate-spin" /> Loading schema…
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Island Config ────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Island Name <span className="text-destructive">*</span>
                </label>
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Monthly Sales Summary"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Description
                </label>
                <input
                  className={inputCls}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What data does this island expose?"
                />
              </div>

              {/* Refresh Type */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Refresh Type</p>
                <div className="flex gap-2">
                  {["static", "scheduled"].map((type) => (
                    <button
                      key={type}
                      onClick={() => setForm({ ...form, refresh_type: type })}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg border transition-all ${
                        form.refresh_type === type
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {type === "scheduled" ? <Clock size={12} /> : <RefreshCw size={12} />}
                      {type === "static" ? "Static (one-time)" : "Scheduled"}
                    </button>
                  ))}
                </div>

                {form.refresh_type === "scheduled" && (
                  <div className="mt-3 space-y-3 p-3 rounded-lg bg-muted/40 border border-border">
                    <div className="flex gap-2">
                      {["cron", "frequency"].map((t) => (
                        <button
                          key={t}
                          onClick={() => setForm({ ...form, schedule_type: t })}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                            form.schedule_type === t
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {t === "cron" ? "Cron Expression" : "Frequency Picker"}
                        </button>
                      ))}
                    </div>

                    {form.schedule_type === "cron" && (
                      <input
                        className={inputCls}
                        value={form.schedule_value}
                        onChange={(e) => setForm({ ...form, schedule_value: e.target.value })}
                        placeholder="0 2 * * *   (every day at 2AM)"
                      />
                    )}

                    {form.schedule_type === "frequency" && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground shrink-0">Every</span>
                        <input
                          type="number"
                          min={1}
                          className={`${inputCls} w-20`}
                          value={form.frequency_every}
                          onChange={(e) => setForm({ ...form, frequency_every: Number(e.target.value) })}
                        />
                        <select
                          className={`${selectCls} flex-1`}
                          value={form.frequency_unit}
                          onChange={(e) => setForm({ ...form, frequency_unit: e.target.value })}
                        >
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                          <option value="weeks">Weeks</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Refresh Strategy */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Refresh Strategy</p>
                <div className="flex gap-2">
                  {[
                    { value: "full", label: "Full Refresh", desc: "Returns all rows every time" },
                    { value: "incremental", label: "Incremental", desc: "Filters by a time column" },
                  ].map(({ value, label, desc }) => (
                    <button
                      key={value}
                      onClick={() => setForm({ ...form, refresh_strategy: value })}
                      className={`flex-1 p-3 text-left rounded-lg border transition-all ${
                        form.refresh_strategy === value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <p className={`text-xs font-semibold ${form.refresh_strategy === value ? "text-primary" : "text-foreground"}`}>{label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
                {form.refresh_strategy === "incremental" && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                    <AlertCircle size={10} /> You'll select a time column per table in Step 3.
                  </p>
                )}
              </div>

              {/* PII Policy */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">PII Policy</p>
                {catalogueWarning && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-warning/10 border border-warning/20 mb-2">
                    <AlertCircle size={12} className="text-warning shrink-0 mt-0.5" />
                    <p className="text-[11px] text-warning">
                      No catalogue found for this environment. PII policy applies to no columns — run the catalogue first for PII enforcement.
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  {[
                    { value: "allow", label: "Allow All", desc: "Include all columns" },
                    { value: "hide", label: "Exclude PII", desc: "Drop medium/high PII cols" },
                    { value: "encrypt", label: "Encrypt PII", desc: "MD5-hash PII columns" },
                  ].map(({ value, label, desc }) => (
                    <button
                      key={value}
                      onClick={() => setForm({ ...form, pii_policy: value })}
                      className={`flex-1 p-3 text-left rounded-lg border transition-all ${
                        form.pii_policy === value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <p className={`text-xs font-semibold ${form.pii_policy === value ? "text-primary" : "text-foreground"}`}>{label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Pick Tables + Per-Table Config ───────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              {schemaError && (
                <p className="text-xs text-warning flex items-center gap-1">
                  <AlertCircle size={12} /> {schemaError}
                </p>
              )}

              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Tables</p>

              {tableNames.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No tables found in schema.</p>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden divide-y divide-border max-h-[360px] overflow-y-auto">
                  {tableNames.map((tableName) => {
                    const isSelected = selectedTables.includes(tableName);
                    const piiCount = catalogueTables[tableName]?.pii_column_count ?? 0;
                    const colCount = schemaData[tableName]?.columns?.length ?? 0;
                    const cols = schemaData[tableName]?.columns ?? [];

                    return (
                      <div key={tableName} className={`transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                        <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleTableToggle(tableName)}
                            className="rounded border-border accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono font-semibold text-foreground truncate">{tableName}</p>
                            <p className="text-[10px] text-muted-foreground">{colCount} columns</p>
                          </div>
                          {piiCount > 0 && (
                            <span className="badge bg-warning/10 text-warning text-[10px] flex items-center gap-1">
                              <ShieldAlert size={10} /> {piiCount} PII
                            </span>
                          )}
                          {isSelected && (
                            <span className="text-[10px] font-mono text-primary">
                              → {toViewName(form.name, tableName)}
                            </span>
                          )}
                        </label>

                        {/* Per-table incremental config */}
                        {isSelected && form.refresh_strategy === "incremental" && (
                          <div className="px-9 pb-2.5 flex items-center gap-2">
                            <Clock size={11} className="text-muted-foreground shrink-0" />
                            <span className="text-[10px] text-muted-foreground shrink-0">Time column:</span>
                            <select
                              className="flex-1 px-2 py-1 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                              value={tableConfigs[tableName]?.time_column ?? ""}
                              onChange={(e) =>
                                setTableConfigs((prev) => ({
                                  ...prev,
                                  [tableName]: { ...prev[tableName], time_column: e.target.value },
                                }))
                              }
                            >
                              <option value="">— Select column —</option>
                              {cols.map((c) => (
                                <option key={c.name} value={c.name}>{c.name} ({c.data_type})</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedTables.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedTables.length} table{selectedTables.length !== 1 ? "s" : ""} selected →{" "}
                  {selectedTables.length} VIEW{selectedTables.length !== 1 ? "s" : ""} will be created
                </p>
              )}
            </div>
          )}

          {/* ── Step 4: Review + Create ───────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-3">
                <div className="grid grid-cols-2 gap-y-2.5 text-xs">
                  <div><p className="text-muted-foreground">Island</p><p className="font-semibold text-foreground">{form.name}</p></div>
                  <div><p className="text-muted-foreground">Environment</p><p className="font-semibold text-foreground">{form.datasource_name}</p></div>
                  <div><p className="text-muted-foreground">Refresh</p><p className="font-semibold text-foreground capitalize">{form.refresh_type}</p></div>
                  <div><p className="text-muted-foreground">Strategy</p><p className="font-semibold text-foreground capitalize">{form.refresh_strategy}</p></div>
                  <div><p className="text-muted-foreground">PII Policy</p><p className="font-semibold text-foreground capitalize">{form.pii_policy}</p></div>
                  <div><p className="text-muted-foreground">Views</p><p className="font-semibold text-foreground">{selectedTables.length}</p></div>
                  {form.refresh_type === "scheduled" && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Schedule</p>
                      <p className="font-mono text-foreground text-[11px]">
                        {form.schedule_type === "cron"
                          ? form.schedule_value
                          : `Every ${form.frequency_every} ${form.frequency_unit}`}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Per-table SQL previews */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">SQL Preview per View</p>
                {selectedTables.map((tableName) => {
                  const sql = buildTableSqlPreview(
                    tableName,
                    catalogueDetails[tableName] ?? null,
                    form.pii_policy,
                    form.refresh_strategy,
                    tableConfigs[tableName]?.time_column ?? "",
                    form.datasource_db_type,
                  );
                  return (
                    <details key={tableName} className="border border-border rounded-lg overflow-hidden" open>
                      <summary className="flex items-center justify-between px-3 py-2 bg-muted/30 cursor-pointer list-none">
                        <div className="flex items-center gap-2 text-xs">
                          <Code size={12} className="text-primary" />
                          <span className="font-mono font-semibold text-foreground">{tableName}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-mono text-primary">{toViewName(form.name, tableName)}</span>
                        </div>
                        {catalogueTables[tableName]?.pii_column_count > 0 && (
                          <span className="badge bg-warning/10 text-warning text-[10px]">
                            <ShieldAlert size={9} /> {catalogueTables[tableName].pii_column_count} PII cols
                            {form.pii_policy === "hide" ? " → excluded" : form.pii_policy === "encrypt" ? " → MD5" : ""}
                          </span>
                        )}
                      </summary>
                      <pre className="px-3 py-2.5 text-[11px] font-mono text-foreground overflow-x-auto leading-relaxed bg-card whitespace-pre-wrap">
                        {sql}
                      </pre>
                    </details>
                  );
                })}
              </div>

              {createMut.isError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                  <AlertCircle size={15} className="text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{errorMessage}</p>
                </div>
              )}

              {createMut.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  Creating VIEWs in database…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
          {step === 1 && (
            <>
              <div />
              <button onClick={onClose} className="btn-outline text-sm">Cancel</button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => setStep(1)} className="btn-outline text-sm">← Back</button>
                <button onClick={onClose} className="btn-ghost text-sm text-muted-foreground">Cancel</button>
              </div>
              <button onClick={() => setStep(3)} disabled={!canProceedStep2} className="btn-primary text-sm">
                Next: Pick Tables →
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => setStep(2)} className="btn-outline text-sm">← Back</button>
                <button onClick={onClose} className="btn-ghost text-sm text-muted-foreground">Cancel</button>
              </div>
              <button onClick={handleGoToReview} disabled={!canProceedStep3} className="btn-primary text-sm">
                Review →
              </button>
            </>
          )}

          {step === 4 && (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => setStep(3)} className="btn-outline text-sm">← Back</button>
                <button onClick={onClose} className="btn-ghost text-sm text-muted-foreground">Cancel</button>
              </div>
              <button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
                className="btn-primary text-sm"
              >
                {createMut.isPending && <Loader2 size={13} className="animate-spin" />}
                Create Island
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
