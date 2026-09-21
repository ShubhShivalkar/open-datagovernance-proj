import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play, Save, FolderOpen, Table2, Columns, Loader2, X,
  ChevronDown, ChevronRight, MoreVertical, Eye, CornerDownLeft, Download,
  KeyRound, Link2, Database, AlertCircle, Trash2, PanelBottomClose,
  PanelBottomOpen, Clock, FileCode, CalendarClock, RefreshCw, CheckCircle,
  AlertTriangle, Power, Mail, Send,
} from "lucide-react";
import { queryEditorApi } from "../api/client";
import { useEnv } from "../context/EnvContext";
import { useAuth } from "../context/AuthContext";
import { vendorLabel } from "../dbVendorDisplay";

const STARTER_SQL =
  "-- Write a read-only SQL query and press ⌘/Ctrl + Enter to run\nSELECT *\nFROM ";

function slugify(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "query";
}

// ── Drag-to-resize hook ────────────────────────────────────────────────────

function useDragSize(initial, { axis, min, max, invert = false }) {
  const [size, setSize] = useState(initial);
  const drag = useRef(null);

  const onMouseDown = (e) => {
    e.preventDefault();
    drag.current = { origin: axis === "x" ? e.clientX : e.clientY, size };
    document.body.style.userSelect = "none";
    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
  };

  useEffect(() => {
    const move = (e) => {
      if (!drag.current) return;
      const cur = axis === "x" ? e.clientX : e.clientY;
      let delta = cur - drag.current.origin;
      if (invert) delta = -delta;
      setSize(Math.max(min, Math.min(max, drag.current.size + delta)));
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [axis, min, max, invert]);

  return [size, onMouseDown, setSize];
}

// ── CSV / JSON download helpers ────────────────────────────────────────────

function cellToString(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function toCsv(columns, rows) {
  const esc = (s) => {
    const str = cellToString(s);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const head = columns.map(esc).join(",");
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(",")).join("\n");
  return `${head}\n${body}`;
}

function downloadResults(columns, rows, format) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const isCsv = format === "csv";
  const content = isCsv ? toCsv(columns, rows) : JSON.stringify(rows, null, 2);
  const blob = new Blob([content], {
    type: isCsv ? "text/csv;charset=utf-8" : "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `query-results-${stamp}.${isCsv ? "csv" : "json"}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function errText(err) {
  const d = err?.response?.data;
  return (
    d?.detail ||
    d?.sql?.[0] ||
    d?.name?.[0] ||
    d?.recipients?.[0] ||
    d?.email_recipients?.[0] ||
    d?.cadence_value?.[0] ||
    d?.target_table?.[0] ||
    (Array.isArray(d?.non_field_errors) && d.non_field_errors[0]) ||
    err?.message ||
    "Something went wrong."
  );
}

// ── Left sidebar ──────────────────────────────────────────────────────────

function TableRow({ table, onPreview, onInsert, onSelectStar, onCopy }) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menu) return;
    const h = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menu]);

  return (
    <div className="border-b border-border/60">
      <div className="group flex items-center gap-1 px-2 py-1.5 hover:bg-muted/50">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        >
          {open ? (
            <ChevronDown size={13} className="text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight size={13} className="text-muted-foreground shrink-0" />
          )}
          <Table2 size={13} className="text-primary shrink-0" />
          <span className="text-xs font-medium text-foreground truncate">{table.name}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{table.column_count}</span>
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenu((v) => !v)}
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
            title="Table actions"
          >
            <MoreVertical size={13} />
          </button>
          {menu && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-lg shadow-xl z-30 py-1 text-xs">
              <button
                onClick={() => { setMenu(false); onPreview(table); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-left"
              >
                <Eye size={12} /> Preview data
              </button>
              <button
                onClick={() => { setMenu(false); onSelectStar(table); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-left"
              >
                <FileCode size={12} /> New SELECT query
              </button>
              <button
                onClick={() => { setMenu(false); onInsert(table.name); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-left"
              >
                <CornerDownLeft size={12} /> Insert name
              </button>
              <button
                onClick={() => { setMenu(false); onCopy(table.name); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-left"
              >
                <Columns size={12} /> Copy name
              </button>
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="pl-7 pr-2 pb-1.5 space-y-0.5">
          {table.columns.map((c) => (
            <button
              key={c.name}
              onClick={() => onInsert(c.name)}
              className="w-full flex items-center gap-1.5 py-0.5 text-left group/col"
              title={`${c.data_type}${c.nullable ? "" : " · not null"}`}
            >
              {c.is_primary_key ? (
                <KeyRound size={10} className="text-amber-500 shrink-0" />
              ) : c.is_foreign_key ? (
                <Link2 size={10} className="text-blue-500 shrink-0" />
              ) : (
                <span className="w-2.5 shrink-0" />
              )}
              <span className="text-[11px] text-foreground/80 truncate group-hover/col:text-primary">
                {c.name}
              </span>
              <span className="text-[10px] text-muted-foreground/70 truncate ml-auto">
                {c.data_type}
              </span>
            </button>
          ))}
          {table.columns.length === 0 && (
            <p className="text-[10px] text-muted-foreground py-1">No columns.</p>
          )}
        </div>
      )}
    </div>
  );
}

function LeftSidebar({
  tab, setTab, tablesQuery, savedQuery, filter, setFilter,
  onPreview, onInsert, onSelectStar, onCopy,
  onOpenSaved, onDeleteSaved, onSaveCurrent, canSave,
}) {
  const tables = tablesQuery.data?.tables ?? [];
  const filtered = filter
    ? tables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()))
    : tables;
  const saved = savedQuery.data?.results ?? savedQuery.data ?? [];

  return (
    <div className="h-full flex flex-col bg-card border-r border-border">
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => setTab("tables")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors ${
            tab === "tables"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Database size={13} /> Tables
        </button>
        <button
          onClick={() => setTab("saved")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors ${
            tab === "saved"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FolderOpen size={13} /> Saved
        </button>
      </div>

      {tab === "tables" && (
        <>
          <div className="p-2 shrink-0">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter tables…"
              className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {tablesQuery.isLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Loading schema…
              </div>
            )}
            {tablesQuery.isError && (
              <div className="m-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-[11px] flex gap-1.5">
                <AlertCircle size={13} className="shrink-0 mt-px" />
                {errText(tablesQuery.error)}
              </div>
            )}
            {!tablesQuery.isLoading && !tablesQuery.isError && filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No tables found.</p>
            )}
            {filtered.map((t) => (
              <TableRow
                key={t.name}
                table={t}
                onPreview={onPreview}
                onInsert={onInsert}
                onSelectStar={onSelectStar}
                onCopy={onCopy}
              />
            ))}
          </div>
        </>
      )}

      {tab === "saved" && (
        <>
          <div className="p-2 shrink-0">
            <button
              onClick={onSaveCurrent}
              disabled={!canSave}
              className="btn-primary w-full justify-center py-1.5 text-xs disabled:opacity-50"
            >
              <Save size={12} /> Save current query
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {savedQuery.isLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            )}
            {!savedQuery.isLoading && saved.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8 px-4">
                No saved queries yet. Write a query and click “Save current query”.
              </p>
            )}
            {saved.map((q) => (
              <div
                key={q.id}
                className="group flex items-start gap-1 px-2 py-2 border-b border-border/60 hover:bg-muted/50"
              >
                <button onClick={() => onOpenSaved(q)} className="flex-1 min-w-0 text-left">
                  <p className="text-xs font-medium text-foreground truncate flex items-center gap-1.5">
                    <FileCode size={12} className="text-primary shrink-0" /> {q.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5 font-mono">
                    {q.sql_text.replace(/\s+/g, " ").slice(0, 60)}
                  </p>
                </button>
                <button
                  onClick={() => onDeleteSaved(q)}
                  className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Results table ─────────────────────────────────────────────────────────

function ResultTable({ result }) {
  if (!result) return null;
  const { columns, rows } = result;

  if (columns.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Query ran successfully — 0 rows returned.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="text-xs border-collapse w-max min-w-full">
        <thead className="sticky top-0 bg-muted z-10">
          <tr>
            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium border-b border-border w-10">
              #
            </th>
            {columns.map((c) => (
              <th
                key={c}
                className="px-3 py-1.5 text-left font-semibold text-foreground border-b border-border whitespace-nowrap"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-muted/40">
              <td className="px-2 py-1 text-right text-muted-foreground/60 border-b border-border/50 tabular-nums">
                {i + 1}
              </td>
              {columns.map((c) => {
                const v = r[c];
                return (
                  <td
                    key={c}
                    className="px-3 py-1 border-b border-border/50 whitespace-nowrap max-w-[420px] truncate font-mono text-foreground/90"
                  >
                    {v === null || v === undefined ? (
                      <span className="text-muted-foreground/50 italic">NULL</span>
                    ) : typeof v === "object" ? (
                      JSON.stringify(v)
                    ) : (
                      String(v)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Bottom panel ──────────────────────────────────────────────────────────

function BottomPanel({ activeTab, setActiveTab, onClose, runState, previewState, previewName }) {
  const current = activeTab === "preview" ? previewState : runState;
  const menuRef = useRef(null);
  const [dlMenu, setDlMenu] = useState(false);

  useEffect(() => {
    if (!dlMenu) return;
    const h = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setDlMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [dlMenu]);

  const canDownload = current?.result && current.result.rows.length > 0;

  return (
    <div className="h-full flex flex-col bg-card border-t border-border">
      <div className="flex items-center gap-1 px-2 border-b border-border shrink-0">
        <button
          onClick={() => setActiveTab("results")}
          className={`px-3 py-2 text-xs font-semibold transition-colors ${
            activeTab === "results"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Query results
        </button>
        <button
          onClick={() => setActiveTab("preview")}
          className={`px-3 py-2 text-xs font-semibold transition-colors ${
            activeTab === "preview"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {previewName ? `Preview · ${previewName}` : "Table preview"}
        </button>

        <div className="flex-1" />

        {current?.result && (
          <span className="text-[10px] text-muted-foreground mr-1 flex items-center gap-1">
            <Clock size={10} />
            {current.result.row_count} row{current.result.row_count === 1 ? "" : "s"}
            {current.result.truncated && " (capped)"} · {current.result.elapsed_ms} ms
          </span>
        )}

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setDlMenu((v) => !v)}
            disabled={!canDownload}
            className="btn-ghost text-xs py-1 px-2 disabled:opacity-40"
            title="Download results"
          >
            <Download size={13} /> Export
          </button>
          {dlMenu && canDownload && (
            <div className="absolute right-0 top-full mt-1 w-32 bg-card border border-border rounded-lg shadow-xl z-30 py-1 text-xs">
              <button
                onClick={() => {
                  setDlMenu(false);
                  downloadResults(current.result.columns, current.result.rows, "csv");
                }}
                className="w-full px-3 py-1.5 hover:bg-muted text-left"
              >
                Download CSV
              </button>
              <button
                onClick={() => {
                  setDlMenu(false);
                  downloadResults(current.result.columns, current.result.rows, "json");
                }}
                className="w-full px-3 py-1.5 hover:bg-muted text-left"
              >
                Download JSON
              </button>
            </div>
          )}
        </div>

        <button onClick={onClose} className="btn-ghost text-xs py-1 px-1.5" title="Close panel">
          <PanelBottomClose size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        {current?.loading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground bg-card/70 z-20">
            <Loader2 size={14} className="animate-spin" /> Running…
          </div>
        )}
        {current?.error && (
          <div className="m-3 p-3 rounded-lg bg-destructive/10 text-destructive text-xs flex gap-2">
            <AlertCircle size={14} className="shrink-0 mt-px" />
            <pre className="whitespace-pre-wrap font-mono">{current.error}</pre>
          </div>
        )}
        {!current?.error && current?.result && <ResultTable result={current.result} />}
        {!current?.loading && !current?.error && !current?.result && (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            {activeTab === "preview"
              ? "Choose “Preview data” from a table’s menu to see its rows."
              : "Run a query to see results here."}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Schedule modal ────────────────────────────────────────────────────────

const FREQ_UNITS = ["minutes", "hours", "days", "weeks"];

const DEFAULT_MAIL_RECIPIENT = "hello@datagovernanceproject.com";

function cadenceDisplay(schedule) {
  if (!schedule) return "—";
  if (schedule.cadence_display) return schedule.cadence_display;
  if (schedule.cadence_type === "frequency") {
    try {
      const c = JSON.parse(schedule.cadence_value);
      return `Every ${c.every} ${c.unit}`;
    } catch { return schedule.cadence_value; }
  }
  return schedule.cadence_value;
}

function fmtDate(v) {
  return v ? new Date(v).toLocaleString() : "—";
}

function ScheduleModal({ savedQuery, datasourceName, onClose, flash }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isDemo = Boolean(user?.is_demo);
  const defaultTable = slugify(savedQuery.name);

  const schedulesQuery = useQuery({
    queryKey: ["qe-schedule", savedQuery.id],
    queryFn: () => queryEditorApi.listSchedules({ saved_query: savedQuery.id }),
  });
  const existing =
    schedulesQuery.data?.results?.[0] ?? schedulesQuery.data?.[0] ?? null;

  const [form, setForm] = useState({
    cadence_type: "frequency",
    cron: "0 2 * * *",
    every: 1,
    unit: "hours",
    write_mode: "replace",
    target_table: defaultTable,
    is_active: true,
    email_enabled: false,
    email_recipients: DEFAULT_MAIL_RECIPIENT,
    email_message: "",
  });

  useEffect(() => {
    if (!existing) return;
    let every = 1;
    let unit = "hours";
    if (existing.cadence_type === "frequency") {
      try {
        const c = JSON.parse(existing.cadence_value);
        every = c.every ?? 1;
        unit = c.unit ?? "hours";
      } catch { /* keep defaults */ }
    }
    setForm({
      cadence_type: existing.cadence_type,
      cron: existing.cadence_type === "cron" ? existing.cadence_value : "0 2 * * *",
      every,
      unit,
      write_mode: existing.write_mode,
      target_table: existing.target_table,
      is_active: existing.is_active,
      email_enabled: existing.email_enabled,
      email_recipients: existing.email_recipients || DEFAULT_MAIL_RECIPIENT,
      email_message: existing.email_message || "",
    });
  }, [existing]);

  const runsQuery = useQuery({
    queryKey: ["qe-schedule-runs", existing?.id],
    queryFn: () => queryEditorApi.scheduleRuns(existing.id),
    enabled: !!existing,
  });
  const runs = runsQuery.data?.results ?? runsQuery.data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["qe-schedule", savedQuery.id] });
    qc.invalidateQueries({ queryKey: ["query-schedules"] });
    if (existing?.id) qc.invalidateQueries({ queryKey: ["qe-schedule-runs", existing.id] });
  };

  const buildPayload = () => ({
    saved_query: savedQuery.id,
    cadence_type: form.cadence_type,
    cadence_value:
      form.cadence_type === "cron"
        ? form.cron.trim()
        : JSON.stringify({ every: Number(form.every) || 1, unit: form.unit }),
    write_mode: form.write_mode,
    target_table: form.target_table.trim() || defaultTable,
    is_active: form.is_active,
    email_enabled: form.email_enabled,
    email_recipients: form.email_recipients,
    email_message: form.email_message,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      existing
        ? queryEditorApi.updateSchedule(existing.id, buildPayload())
        : queryEditorApi.createSchedule(buildPayload()),
    onSuccess: () => { invalidate(); flash("Schedule saved."); },
  });
  const removeMut = useMutation({
    mutationFn: () => queryEditorApi.deleteSchedule(existing.id),
    onSuccess: () => { invalidate(); flash("Schedule removed."); onClose(); },
  });
  const runNowMut = useMutation({
    mutationFn: () => queryEditorApi.runScheduleNow(existing.id),
    onSuccess: () => { invalidate(); flash("Run finished."); },
  });
  const sendMailMut = useMutation({
    mutationFn: () =>
      queryEditorApi.sendResultsEmail({
        saved_query: savedQuery.id,
        recipients: form.email_recipients,
        message: form.email_message,
      }),
    onSuccess: (d) =>
      flash(`Mail sent to ${(d?.recipients || []).length || "the"} recipient(s).`),
  });

  const cronInvalid = form.cadence_type === "cron" && !form.cron.trim();
  const noRecipients = !form.email_recipients.trim();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
            <CalendarClock size={15} className="text-primary" />
            Schedule “{savedQuery.name}”
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            On each run the query result is written to
            {" "}<span className="font-mono text-foreground">schedules.{form.target_table || defaultTable}</span>{" "}
            in <span className="font-medium text-foreground">{datasourceName}</span>. The
            {" "}<span className="font-mono">schedules</span> schema is created if missing.
          </p>

          {/* Cadence */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cadence</p>
            <div className="flex gap-2 mb-2">
              {["frequency", "cron"].map((t) => (
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, cadence_type: t }))}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                    form.cadence_type === t
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {t === "cron" ? "Cron Expression" : "Frequency"}
                </button>
              ))}
            </div>
            {form.cadence_type === "cron" ? (
              <input
                value={form.cron}
                onChange={(e) => setForm((f) => ({ ...f, cron: e.target.value }))}
                placeholder="0 2 * * *   (every day at 2AM)"
                className="w-full px-2.5 py-1.5 text-sm font-mono border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Every</span>
                <input
                  type="number"
                  min={1}
                  value={form.every}
                  onChange={(e) => setForm((f) => ({ ...f, every: e.target.value }))}
                  className="w-20 px-2.5 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <select
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  className="flex-1 px-2.5 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 capitalize"
                >
                  {FREQ_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Write mode */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Write mode</p>
            <div className="flex gap-2">
              {[
                { v: "replace", label: "Replace", desc: "Drop & rebuild the table each run" },
                { v: "append", label: "Append", desc: "Add rows to the existing table" },
              ].map((m) => (
                <button
                  key={m.v}
                  onClick={() => setForm((f) => ({ ...f, write_mode: m.v }))}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg border text-left transition-all ${
                    form.write_mode === m.v
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <span className="font-semibold block">{m.label}</span>
                  <span className="text-[10px] opacity-80">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Target table */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Target table</p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-muted-foreground">schedules.</span>
              <input
                value={form.target_table}
                onChange={(e) => setForm((f) => ({ ...f, target_table: e.target.value }))}
                placeholder={defaultTable}
                className="flex-1 px-2.5 py-1.5 text-sm font-mono border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Email results */}
          <div className="rounded-lg border border-border p-3 space-y-2.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <input
                type="checkbox"
                checked={form.email_enabled}
                onChange={(e) => setForm((f) => ({ ...f, email_enabled: e.target.checked }))}
              />
              <Mail size={13} className="text-primary" />
              Email fresh data on every run
            </label>

            {form.email_enabled && (
              <>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Recipients (comma-separated)
                  </p>
                  <input
                    value={form.email_recipients}
                    onChange={(e) => setForm((f) => ({ ...f, email_recipients: e.target.value }))}
                    placeholder="alice@example.com, bob@example.com"
                    className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Note (optional)
                  </p>
                  <textarea
                    value={form.email_message}
                    onChange={(e) => setForm((f) => ({ ...f, email_message: e.target.value }))}
                    rows={2}
                    placeholder="Optional — added above our standard message"
                    className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-muted-foreground/50"
                  />
                </div>
                <button
                  onClick={() => sendMailMut.mutate()}
                  disabled={sendMailMut.isPending || noRecipients}
                  className="btn-outline text-xs w-full justify-center disabled:opacity-50"
                >
                  {sendMailMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  Send this mail now
                </button>
                {sendMailMut.isError && (
                  <p className="text-xs text-destructive">{errText(sendMailMut.error)}</p>
                )}
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Sent from {DEFAULT_MAIL_RECIPIENT} with the results attached as CSV. Every
                  mail already includes our standard message and contact details.
                </p>
              </>
            )}
          </div>

          {existing && (
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              <Power size={12} /> Active (unchecked = paused, won’t auto-run)
            </label>
          )}

          {/* Status */}
          {existing && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Next run</span>
                <span className="text-foreground">{fmtDate(existing.next_run_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last run</span>
                <span className="text-foreground">
                  {fmtDate(existing.last_run_at)}
                  {existing.last_status && (
                    <span className={existing.last_status === "success" ? "text-success" : "text-destructive"}>
                      {" "}· {existing.last_status}
                      {existing.last_row_count != null && ` (${existing.last_row_count} rows)`}
                    </span>
                  )}
                </span>
              </div>
              {existing.last_error && (
                <p className="text-destructive font-mono break-words pt-1">{existing.last_error}</p>
              )}
            </div>
          )}

          {/* Recent runs */}
          {existing && runs.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Recent runs</p>
              <div className="space-y-1">
                {runs.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-[11px]">
                    {r.status === "success"
                      ? <CheckCircle size={11} className="text-success shrink-0" />
                      : <AlertTriangle size={11} className="text-destructive shrink-0" />}
                    <span className="text-muted-foreground">{fmtDate(r.started_at)}</span>
                    <span className="text-foreground">{r.write_mode}</span>
                    <span className="ml-auto text-muted-foreground">
                      {r.row_count != null ? `${r.row_count} rows` : "—"} · {r.elapsed_ms} ms
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isDemo && (
            <p className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-lg px-2.5 py-2">
              Creating a persistent schedule is disabled in demo mode — but you can still
              enable the mailer above and use “Send this mail now”.
            </p>
          )}
          {saveMut.isError && <p className="text-xs text-destructive">{errText(saveMut.error)}</p>}
        </div>

        <div className="px-5 py-3.5 border-t border-border flex items-center gap-2 shrink-0">
          {existing && (
            <>
              <button
                onClick={() => removeMut.mutate()}
                disabled={removeMut.isPending}
                className="btn-ghost text-xs text-destructive hover:bg-destructive/5"
              >
                <Trash2 size={12} /> Remove
              </button>
              <button
                onClick={() => runNowMut.mutate()}
                disabled={runNowMut.isPending}
                className="btn-outline text-xs"
              >
                {runNowMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Run now
              </button>
            </>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="btn-outline text-xs">Close</button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || cronInvalid || isDemo}
            title={isDemo ? "Scheduling is disabled in demo mode" : undefined}
            className="btn-primary text-xs disabled:opacity-50"
          >
            {saveMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <CalendarClock size={12} />}
            {existing ? "Update schedule" : "Create schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function QueryEditorPage() {
  const { activeEnv } = useEnv();
  const envId = activeEnv?.id;
  const qc = useQueryClient();

  const [sql, setSql] = useState(STARTER_SQL);
  const [leftTab, setLeftTab] = useState("tables");
  const [tableFilter, setTableFilter] = useState("");
  const [panelTab, setPanelTab] = useState("results");
  const [panelOpen, setPanelOpen] = useState(false);
  const [previewName, setPreviewName] = useState(null);
  const [openedSaved, setOpenedSaved] = useState(null);
  const [saveModal, setSaveModal] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const editorRef = useRef(null);

  const [sidebarW, onSidebarDrag] = useDragSize(260, { axis: "x", min: 200, max: 460 });
  const [panelH, onPanelDrag] = useDragSize(280, { axis: "y", min: 140, max: 640, invert: true });

  const tablesQuery = useQuery({
    queryKey: ["qe-tables", envId],
    queryFn: () => queryEditorApi.tables(envId),
    enabled: !!envId,
  });
  const savedQuery = useQuery({
    queryKey: ["qe-saved", envId],
    queryFn: () => queryEditorApi.listSaved(envId),
    enabled: !!envId,
  });
  const scheduleQuery = useQuery({
    queryKey: ["qe-schedule", openedSaved?.id],
    queryFn: () => queryEditorApi.listSchedules({ saved_query: openedSaved.id }),
    enabled: !!openedSaved?.id,
  });
  const openedSchedule =
    scheduleQuery.data?.results?.[0] ?? scheduleQuery.data?.[0] ?? null;

  const runMut = useMutation({
    mutationFn: () => queryEditorApi.run({ datasource: envId, sql }),
  });
  const previewMut = useMutation({
    mutationFn: (table) => queryEditorApi.preview({ datasource: envId, table }),
  });
  const saveMut = useMutation({
    mutationFn: ({ id, body }) =>
      id ? queryEditorApi.updateSaved(id, body) : queryEditorApi.createSaved(body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["qe-saved", envId] });
      setSaveModal(null);
      if (data?.id) setOpenedSaved({ id: data.id, name: data.name });
      flash("Query saved.");
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => queryEditorApi.deleteSaved(id),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["qe-saved", envId] });
      if (openedSaved?.id === id) setOpenedSaved(null);
    },
  });

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Reset transient state when the active environment changes.
  useEffect(() => {
    runMut.reset();
    previewMut.reset();
    setOpenedSaved(null);
    setPreviewName(null);
    setPanelOpen(false);
    setScheduleOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId]);

  const runQuery = useCallback(() => {
    if (!envId || !sql.trim()) return;
    setPanelTab("results");
    setPanelOpen(true);
    runMut.mutate();
  }, [envId, sql, runMut]);

  const runPreview = useCallback(
    (table) => {
      setPreviewName(table.name);
      setPanelTab("preview");
      setPanelOpen(true);
      previewMut.mutate(table.name);
    },
    [previewMut]
  );

  const insertAtCursor = useCallback(
    (text) => {
      const el = editorRef.current;
      if (!el) {
        setSql((s) => s + text);
        return;
      }
      const start = el.selectionStart ?? sql.length;
      const end = el.selectionEnd ?? sql.length;
      setSql(sql.slice(0, start) + text + sql.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = start + text.length;
      });
    },
    [sql]
  );

  const newSelectFor = useCallback((table) => {
    setSql(`SELECT *\nFROM ${table.name}\nLIMIT 100;`);
    setOpenedSaved(null);
    editorRef.current?.focus();
  }, []);

  const copyName = useCallback(
    (name) => {
      navigator.clipboard?.writeText(name).then(() => flash(`Copied “${name}”`)).catch(() => {});
    },
    [flash]
  );

  const onEditorKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    } else if (e.key === "Tab") {
      e.preventDefault();
      insertAtCursor("  ");
    }
  };

  const openSaved = useCallback(
    (q) => {
      setSql(q.sql_text);
      setOpenedSaved({ id: q.id, name: q.name });
      flash(`Opened “${q.name}”`);
    },
    [flash]
  );

  // Deep link: /query-editor?saved=<id> opens that saved query once it loads.
  const savedList = savedQuery.data?.results ?? savedQuery.data ?? [];
  useEffect(() => {
    const wanted = searchParams.get("saved");
    if (!wanted || openedSaved?.id === wanted) return;
    const match = savedList.find((q) => q.id === wanted);
    if (match) {
      openSaved(match);
      searchParams.delete("saved");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedList, searchParams]);

  const startSave = useCallback(() => {
    if (!sql.trim()) return;
    setSaveModal(
      openedSaved ? { name: openedSaved.name, mode: "update" } : { name: "", mode: "new" }
    );
  }, [sql, openedSaved]);

  const confirmSave = () => {
    const name = saveModal.name.trim();
    if (!name) return;
    saveMut.mutate({
      id: saveModal.mode === "update" ? openedSaved?.id : undefined,
      body: { datasource: envId, name, sql_text: sql },
    });
  };

  const runState = {
    loading: runMut.isPending,
    error: runMut.isError ? errText(runMut.error) : null,
    result: runMut.data ?? null,
  };
  const previewState = {
    loading: previewMut.isPending,
    error: previewMut.isError ? errText(previewMut.error) : null,
    result: previewMut.data ?? null,
  };

  if (!envId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Database size={26} className="text-primary" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">No environment selected</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Pick a database environment from the sidebar selector to start querying.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col bg-background overflow-hidden"
      style={{ margin: "-1.5rem", width: "calc(100% + 3rem)", height: "calc(100% + 3rem)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card shrink-0">
        <FileCode size={16} className="text-primary" />
        <h1 className="text-sm font-semibold text-foreground">SQL Query Editor</h1>
        <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
          {activeEnv.name} · {vendorLabel(activeEnv)}
        </span>
        {openedSaved && (
          <span className="badge bg-primary/10 text-primary">
            <FileCode size={10} /> {openedSaved.name}
          </span>
        )}
        {openedSchedule && (
          <span
            className={`badge ${openedSchedule.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
            title={`Runs ${cadenceDisplay(openedSchedule)} → schedules.${openedSchedule.target_table}`}
          >
            <CalendarClock size={10} /> {openedSchedule.is_active ? "Scheduled" : "Paused"}
          </span>
        )}
        <div className="flex-1" />
        {!panelOpen && (
          <button onClick={() => setPanelOpen(true)} className="btn-outline text-xs py-1.5">
            <PanelBottomOpen size={13} /> Show results
          </button>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left sidebar */}
        <div style={{ width: sidebarW }} className="shrink-0 min-w-0">
          <LeftSidebar
            tab={leftTab}
            setTab={setLeftTab}
            tablesQuery={tablesQuery}
            savedQuery={savedQuery}
            filter={tableFilter}
            setFilter={setTableFilter}
            onPreview={runPreview}
            onInsert={insertAtCursor}
            onSelectStar={newSelectFor}
            onCopy={copyName}
            onOpenSaved={openSaved}
            onDeleteSaved={(q) => {
              if (window.confirm(`Delete saved query “${q.name}”?`)) deleteMut.mutate(q.id);
            }}
            onSaveCurrent={startSave}
            canSave={!!sql.trim()}
          />
        </div>

        {/* Sidebar resize handle */}
        <div
          onMouseDown={onSidebarDrag}
          className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/50 transition-colors"
        />

        {/* Editor + bottom panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex flex-col min-h-0 bg-card">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Editor
              </span>
              <span className="text-[10px] text-muted-foreground/70">read-only · SELECT / WITH</span>
              <div className="flex-1" />
              {openedSaved && (
                <button
                  onClick={() => setScheduleOpen(true)}
                  className="btn-outline text-xs py-1.5"
                  title="Run this query on a schedule"
                >
                  <CalendarClock size={13} /> Schedule
                </button>
              )}
              <button
                onClick={startSave}
                disabled={!sql.trim()}
                className="btn-outline text-xs py-1.5 disabled:opacity-50"
              >
                <Save size={13} /> {openedSaved ? "Update" : "Save"}
              </button>
              <button
                onClick={runQuery}
                disabled={runMut.isPending || !sql.trim()}
                className="btn-primary text-xs py-1.5 disabled:opacity-50"
              >
                {runMut.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Play size={13} />
                )}
                Run Query
                <kbd className="ml-1 text-[9px] opacity-70 font-sans">⌘↵</kbd>
              </button>
            </div>
            <textarea
              ref={editorRef}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={onEditorKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="SELECT * FROM …"
              className="flex-1 w-full resize-none p-3 font-mono text-[13px] leading-relaxed bg-background text-foreground focus:outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          {panelOpen && (
            <>
              <div
                onMouseDown={onPanelDrag}
                className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-primary/50 transition-colors"
              />
              <div style={{ height: panelH }} className="shrink-0">
                <BottomPanel
                  activeTab={panelTab}
                  setActiveTab={setPanelTab}
                  onClose={() => setPanelOpen(false)}
                  runState={runState}
                  previewState={previewState}
                  previewName={previewName}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Save modal */}
      {saveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-sm text-foreground">
                {saveModal.mode === "update" ? "Update saved query" : "Save query"}
              </h3>
              <button
                onClick={() => setSaveModal(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Name</span>
                <input
                  autoFocus
                  value={saveModal.name}
                  onChange={(e) => setSaveModal((m) => ({ ...m, name: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && confirmSave()}
                  placeholder="e.g. Active users last 30 days"
                  className="mt-1 w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              {saveMut.isError && (
                <p className="text-xs text-destructive">{errText(saveMut.error)}</p>
              )}
            </div>
            <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setSaveModal(null)} className="btn-outline text-xs">
                Cancel
              </button>
              <button
                onClick={confirmSave}
                disabled={!saveModal.name.trim() || saveMut.isPending}
                className="btn-primary text-xs disabled:opacity-50"
              >
                {saveMut.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Save size={12} />
                )}
                {saveModal.mode === "update" ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {scheduleOpen && openedSaved && (
        <ScheduleModal
          savedQuery={openedSaved}
          datasourceName={activeEnv.name}
          onClose={() => setScheduleOpen(false)}
          flash={flash}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-xs px-3 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
