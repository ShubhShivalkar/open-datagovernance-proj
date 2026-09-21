import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { catalogueApi } from "../api/client";
import { useEnv } from "../context/EnvContext";
import {
  Search, Loader2, Table2, ShieldAlert,
  RefreshCw, X, AlertCircle, CheckCircle, CheckCircle2,
  Columns, Rows, Database, Zap, Info, BadgeCheck, ShieldCheck,
  Pencil, Save, History, Clock, XCircle, Network,
} from "lucide-react";
import DataMap from "../components/DataMap";

const PII_OPTIONS = ["none", "low", "medium", "high"];
const DATA_CATEGORY_OPTIONS = ["identifier","timestamp","metric","dimension","flag","text","json","other"];
const inputCls = "w-full px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60";

const PII_BADGE = {
  high:   "bg-destructive/10 text-destructive",
  medium: "bg-warning/10 text-warning",
  low:    "bg-muted text-muted-foreground",
  none:   null,
};

function PiiBadge({ level }) {
  const cls = PII_BADGE[level];
  if (!cls) return null;
  return <span className={`badge ${cls}`}><ShieldAlert size={10} /> {level} PII</span>;
}

// ── Run progress helpers ──────────────────────────────────────────────────────

function deriveSteps(run) {
  const t = run?.tables_total ?? 0;
  const p = run?.tables_processed ?? 0;
  const done   = run?.status === "completed";
  const failed = run?.status === "failed";
  const started = run?.status !== "pending" && run != null;

  // Which step index is currently active? -1 = all finished.
  let activeStep = -1;
  if (!started)                          activeStep = 0; // connecting
  else if (t === 0 && !done)             activeStep = 1; // reading schema
  else if (p === 0 && !done)             activeStep = 2; // sampling
  else if (p < t && !done)              activeStep = 3; // llm
  else if (!done)                        activeStep = 4; // saving

  const stepStatus = (i) => {
    if (activeStep === -1) return "done";           // run completed
    if (failed) {
      if (i < activeStep) return "done";
      if (i === activeStep) return "error";
      return "idle";
    }
    if (i < activeStep) return "done";
    if (i === activeStep) return "active";
    return "idle";
  };

  return [
    {
      label: "Database connection established",
      detail: started && run?.ai_provider ? `${run.ai_provider} · ${run.ai_model}` : null,
      status: stepStatus(0),
    },
    {
      label: "Schema introspected",
      detail: t > 0 ? `${t} table${t !== 1 ? "s" : ""} found` : done ? "No new tables" : null,
      status: stepStatus(1),
    },
    {
      label: "Sample data pulled for tables",
      status: stepStatus(2),
    },
    {
      label: "LLM reading the data",
      detail: p > 0 && t > 0 ? `${p} of ${t} tables` : null,
      status: stepStatus(3),
    },
    {
      label: "Inferring table relationships & finalising",
      status: stepStatus(4),
    },
  ];
}

function StepItem({ label, detail, status, isLast }) {
  const icon = {
    done:   <CheckCircle2 size={16} className="text-success shrink-0" />,
    active: <Loader2     size={16} className="text-primary animate-spin shrink-0" />,
    error:  <XCircle     size={16} className="text-destructive shrink-0" />,
    idle:   <div className="w-4 h-4 rounded-full border-2 border-border bg-background shrink-0" />,
  }[status];

  return (
    <div className="flex gap-3">
      {/* Icon + connector line */}
      <div className="flex flex-col items-center">
        {icon}
        {!isLast && (
          <div className={`w-px flex-1 min-h-[18px] mt-1 ${status === "done" ? "bg-success/25" : "bg-border"}`} />
        )}
      </div>
      {/* Label */}
      <div className={`flex-1 min-w-0 ${isLast ? "" : "pb-4"}`}>
        <p className={`text-sm leading-none ${
          status === "active" ? "text-foreground font-semibold"
          : status === "error" ? "text-destructive"
          : status === "done"  ? "text-foreground"
          : "text-muted-foreground"
        }`}>
          {label}
        </p>
        {detail && (
          <p className="text-[11px] text-muted-foreground mt-1">{detail}</p>
        )}
      </div>
    </div>
  );
}

function RunProgressDialog({ run, onClose }) {
  const qc = useQueryClient();

  const isDone   = run?.status === "completed";
  const isFailed = run?.status === "failed";
  const isActive = run?.status === "pending" || run?.status === "running";

  const t   = run?.tables_total ?? 0;
  const p   = run?.tables_processed ?? 0;
  const pct = t > 0 ? Math.round((p / t) * 100) : isDone ? 100 : 0;
  const noNewTables = isDone && t === 0;

  // Refresh catalogue + data map once the run completes
  useEffect(() => {
    if (isDone) {
      qc.invalidateQueries({ queryKey: ["tables"] });
      qc.invalidateQueries({ queryKey: ["catalogue-runs"] });
      // Invalidates all ["relationships", <dsId>] queries so the Data Map
      // picks up AI-inferred rules from the just-completed catalogue run
      qc.invalidateQueries({ queryKey: ["relationships"] });
    }
  }, [isDone, qc]);

  const steps = deriveSteps(run);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-bold text-foreground text-base flex items-center gap-2.5">
            {isDone
              ? <CheckCircle2 size={16} className="text-success" />
              : isFailed
              ? <XCircle size={16} className="text-destructive" />
              : <Loader2 size={16} className="text-primary animate-spin" />}
            {isDone
              ? "Catalogue Ready"
              : isFailed
              ? "Generation Failed"
              : "Refreshing Catalogue…"}
          </h2>
          {run?.id && (
            <p className="text-[10px] font-mono text-muted-foreground mt-1">
              run · {run.id.slice(0, 8)}
            </p>
          )}
        </div>

        {/* Steps */}
        <div className="px-6 pt-5">
          {steps.map((step, i) => (
            <StepItem
              key={i}
              label={step.label}
              detail={step.detail}
              status={step.status}
              isLast={i === steps.length - 1}
            />
          ))}
        </div>

        {/* Progress bar — shown while tables exist */}
        {t > 0 && (
          <div className="px-6 pt-3 pb-1 space-y-1.5">
            <div className="progress-track">
              <div
                className="progress-fill transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{p} of {t} tables processed</span>
              <span className="font-semibold">{pct}%</span>
            </div>
          </div>
        )}

        {/* Contextual notices */}
        <div className="px-6 pt-3 pb-1 space-y-2">
          {noNewTables && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
              <Info size={12} className="text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                No new tables found — catalogue is already up to date.
              </p>
            </div>
          )}
          {isDone && !noNewTables && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <ShieldCheck size={12} className="text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-700 font-medium">
                {t} table{t !== 1 ? "s" : ""} successfully catalogued using local AI — no data left this system.
              </p>
            </div>
          )}
          {isFailed && run?.error_message && (
            <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
              <p className="text-xs text-destructive font-mono break-all">{run.error_message}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between mt-2">
          {isActive && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              Runs in the background — safe to hide
            </p>
          )}
          <button
            onClick={onClose}
            className={`btn-primary text-sm ml-auto ${isActive ? "btn-outline" : ""}`}
          >
            {isActive ? "Hide" : isDone ? "Done" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RefreshModal({ datasourceId, datasourceName, onClose, onStarted }) {
  const [mode, setMode] = useState("incremental");
  const qc = useQueryClient();

  const refreshMut = useMutation({
    mutationFn: () => catalogueApi.refreshCatalogue(datasourceId, { refresh_mode: mode }),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ["tables"] });
      qc.invalidateQueries({ queryKey: ["catalogue-runs"] });
      onStarted(run);
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-foreground text-base flex items-center gap-2">
              <RefreshCw size={15} className="text-primary" />
              Refresh Catalogue
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{datasourceName}</p>
          </div>
          <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Local AI notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <ShieldCheck size={14} className="text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-foreground leading-relaxed">
              <span className="font-semibold">Using local AI — sample data used, nothing leaves this system.</span>{" "}
              Catalogue generation runs on Ollama locally. A small sample of rows is read per table
              to produce richer descriptions. No data is sent to any external service.
            </p>
          </div>

          {/* Refresh mode selection */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Refresh Type
            </p>

            <button
              onClick={() => setMode("incremental")}
              className={`w-full flex items-start gap-3 p-3.5 rounded-lg border transition-all text-left ${
                mode === "incremental"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                mode === "incremental" ? "border-primary" : "border-muted-foreground"
              }`}>
                {mode === "incremental" && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Incremental</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Only process newly added tables and columns. Existing definitions and
                  human overrides are preserved.
                </p>
              </div>
            </button>

            <button
              onClick={() => setMode("full")}
              className={`w-full flex items-start gap-3 p-3.5 rounded-lg border transition-all text-left ${
                mode === "full"
                  ? "border-destructive bg-destructive/5"
                  : "border-border hover:border-destructive/40"
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                mode === "full" ? "border-destructive" : "border-muted-foreground"
              }`}>
                {mode === "full" && <div className="w-2 h-2 rounded-full bg-destructive" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Full Refresh</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Wipe all previously generated AI descriptions and regenerate everything
                  from scratch. Human overrides will be lost.
                </p>
              </div>
            </button>
          </div>

          {mode === "full" && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
              <AlertCircle size={13} className="text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">
                All existing AI-generated descriptions and human overrides will be permanently deleted before regeneration.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <button onClick={onClose} className="btn-outline text-sm">Cancel</button>
          <button
            onClick={() => refreshMut.mutate()}
            disabled={refreshMut.isPending}
            className={`btn-primary text-sm ${mode === "full" ? "bg-destructive hover:bg-destructive/90 border-destructive" : ""}`}
          >
            {refreshMut.isPending
              ? <><Loader2 size={13} className="animate-spin" /> Starting…</>
              : <><RefreshCw size={13} /> {mode === "full" ? "Full Refresh" : "Run Incremental"}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

const RUN_STATUS = {
  running:   { cls: "bg-primary/10 text-primary",         Icon: Loader2,       label: "Running"   },
  pending:   { cls: "bg-muted text-muted-foreground",     Icon: Clock,         label: "Pending"   },
  completed: { cls: "bg-success/10 text-success",         Icon: CheckCircle,   label: "Completed" },
  failed:    { cls: "bg-destructive/10 text-destructive", Icon: XCircle,       label: "Failed"    },
};

function RunHistoryPanel({ datasourceId, onClose }) {
  const runsQuery = useQuery({
    queryKey: ["catalogue-runs", datasourceId],
    queryFn: () => catalogueApi.listRuns(datasourceId ? { datasource: datasourceId } : {}),
    refetchInterval: (query) => {
      const runs = query.state.data?.results ?? query.state.data ?? [];
      return Array.isArray(runs) && runs.some((r) => r.status === "running" || r.status === "pending") ? 3000 : false;
    },
  });

  const runs = runsQuery.data?.results ?? runsQuery.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-card border-l border-border flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <History size={15} className="text-primary" />
            <h2 className="font-bold text-foreground text-sm">Catalogue Run History</h2>
          </div>
          <button onClick={onClose} className="btn-ghost w-8 h-8 p-0 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {runsQuery.isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          )}
          {runsQuery.isError && (
            <div className="flex items-center gap-2 text-destructive text-sm py-8 justify-center">
              <AlertCircle size={15} /> Failed to load history.
            </div>
          )}
          {!runsQuery.isLoading && runs.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <History size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No runs yet</p>
              <p className="text-xs mt-1">Refresh the catalogue to generate the first run.</p>
            </div>
          )}
          {runs.map((run) => {
            const cfg = RUN_STATUS[run.status] ?? RUN_STATUS.pending;
            const pct = run.status === "completed" ? 100 : (run.progress_pct ?? 0);
            return (
              <div key={run.id} className="card space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-mono text-muted-foreground truncate flex-1">{run.id}</p>
                  <span className={`badge flex items-center gap-1 shrink-0 ${cfg.cls}`}>
                    <cfg.Icon size={10} className={run.status === "running" ? "animate-spin" : ""} />
                    {cfg.label}
                  </span>
                </div>
                <div>
                  <div className="progress-track mb-1">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{run.tables_processed ?? 0} / {run.tables_total ?? 0} tables</span>
                    <span className="font-semibold">{pct}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border pt-2">
                  <div className="flex items-center gap-1.5">
                    {run.ai_provider === "ollama" ? (
                      <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                        <ShieldCheck size={9} />
                        Local AI · Sample data · No exposure
                      </span>
                    ) : (
                      run.ai_provider && (
                        <span className="bg-muted px-1.5 py-0.5 rounded font-medium text-foreground">{run.ai_provider}</span>
                      )
                    )}
                    {run.ai_model && <span className="truncate max-w-[100px]">{run.ai_model}</span>}
                  </div>
                  <span>{run.started_at ? new Date(run.started_at).toLocaleString() : "Not started"}</span>
                </div>
                {run.error_message && (
                  <p className="text-[10px] text-destructive bg-destructive/5 border border-destructive/20 rounded px-2 py-1.5">
                    {run.error_message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function CataloguePage() {
  const { activeEnv } = useEnv();
  const [view, setView] = useState("catalogue");  // "catalogue" | "map"
  const [search, setSearch] = useState("");
  const [selectedTable, setSelectedTable] = useState(null);
  const [showRefresh, setShowRefresh] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingRun, setPendingRun] = useState(null);   // initial run from POST
  const [showProgress, setShowProgress] = useState(false);

  const dsId = activeEnv?.id ?? null;

  // Poll until the run reaches a terminal state
  const activeRunQuery = useQuery({
    queryKey: ["catalogue-run", pendingRun?.id],
    queryFn: () => catalogueApi.getRun(pendingRun.id),
    enabled: !!pendingRun?.id,
    placeholderData: pendingRun,          // show the POST response immediately
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "running" || s === "pending" ? 3000 : false;
    },
  });
  const activeRun = activeRunQuery.data ?? pendingRun;

  const tablesQuery = useQuery({
    queryKey: ["tables", { datasource: dsId, search }],
    queryFn: () =>
      catalogueApi.listTables({
        ...(dsId   ? { datasource: dsId } : {}),
        ...(search ? { search }           : {}),
      }),
    enabled: !!dsId,
  });

  const tables = tablesQuery.data?.results ?? tablesQuery.data ?? [];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Data Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Schema metadata for{" "}
            <span className="font-semibold text-foreground">{activeEnv?.name ?? "—"}</span>
            {activeEnv && (
              <span className="ml-1.5 text-xs text-muted-foreground capitalize">({activeEnv.db_type})</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeRun && !showProgress && (
            <button
              onClick={() => setShowProgress(true)}
              className={`badge cursor-pointer hover:opacity-80 transition-opacity ${
                activeRun.status === "completed" ? "bg-success/10 text-success"
                : activeRun.status === "failed"   ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary"
              }`}
            >
              {activeRun.status === "completed"
                ? <><CheckCircle size={10} /> Catalogue updated</>
                : activeRun.status === "failed"
                ? <><AlertCircle size={10} /> Run failed</>
                : <><Loader2 size={10} className="animate-spin" /> Running… — click to view</>
              }
            </button>
          )}
          <button
            onClick={() => setShowHistory(true)}
            disabled={!dsId}
            className="btn-outline text-sm"
          >
            <History size={14} /> History
          </button>
          <button
            onClick={() => setShowRefresh(true)}
            disabled={!dsId}
            className="btn-primary text-sm"
          >
            <RefreshCw size={14} /> Refresh Catalogue
          </button>
        </div>
      </div>

      {/* View toggle */}
      {dsId && (
        <div className="flex items-center gap-1 border border-border rounded-lg p-1 w-fit bg-muted/40">
          <button
            onClick={() => setView("catalogue")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-medium transition-colors ${
              view === "catalogue" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Table2 size={13} /> Catalogue
          </button>
          <button
            onClick={() => setView("map")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-medium transition-colors ${
              view === "map" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Network size={13} /> Data Map
          </button>
        </div>
      )}

      {/* Data Map view */}
      {dsId && view === "map" && (
        <div className="border border-border rounded-xl overflow-hidden bg-background" style={{ height: "calc(100vh - 220px)" }}>
          <DataMap datasourceId={dsId} />
        </div>
      )}

      {/* No env selected */}
      {!dsId && (
        <div className="card flex flex-col items-center justify-center py-20 text-center gap-3">
          <Database size={40} className="text-muted-foreground" />
          <p className="font-semibold text-foreground">No environment selected</p>
          <p className="text-sm text-muted-foreground">
            Select an environment from the bottom-left selector to view its catalogue.
          </p>
        </div>
      )}

      {dsId && view === "catalogue" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Left: table list */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Tables</h3>
              <span className="badge bg-muted text-muted-foreground border border-border">
                {tables.length}
              </span>
            </div>

            <div className="relative mb-3">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-md
                           focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground"
                placeholder="Search tables…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelectedTable(null); }}
              />
            </div>

            <div className="space-y-0.5">
              {tablesQuery.isLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 size={18} className="animate-spin text-muted-foreground" />
                </div>
              )}
              {tables.map((table) => (
                <button
                  key={table.id}
                  onClick={() => setSelectedTable(table)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-md transition-colors flex items-center justify-between gap-2 ${
                    selectedTable?.id === table.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <span className="font-mono truncate">{table.table_name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {table.is_verified && (
                      <BadgeCheck size={13} className="text-success" />
                    )}
                    {table.pii_column_count > 0 && (
                      <ShieldAlert size={11} className="text-warning" />
                    )}
                  </div>
                </button>
              ))}
              {!tablesQuery.isLoading && tables.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-xs space-y-2">
                  <Zap size={20} className="mx-auto text-muted-foreground/50" />
                  <p>No catalogue yet.</p>
                  <p>Click <span className="font-semibold">Refresh Catalogue</span> to generate one.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: table detail */}
          <div className="lg:col-span-3 space-y-4">
            {selectedTable ? (
              <TableDetail table={selectedTable} />
            ) : (
              <div className="card flex flex-col items-center justify-center py-24 text-center">
                <Table2 size={48} className="text-muted mb-4" />
                <p className="text-foreground font-semibold">Select a table</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose a table from the list to view its schema and column definitions.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {showRefresh && dsId && (
        <RefreshModal
          datasourceId={dsId}
          datasourceName={activeEnv?.name}
          onClose={() => setShowRefresh(false)}
          onStarted={(run) => { setPendingRun(run); setShowProgress(true); }}
        />
      )}

      {showHistory && (
        <RunHistoryPanel
          datasourceId={dsId}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showProgress && activeRun && (
        <RunProgressDialog
          run={activeRun}
          onClose={() => setShowProgress(false)}
        />
      )}

      {showHistory && (
        <RunHistoryPanel
          datasourceId={dsId}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

function TableDetail({ table }) {
  const qc = useQueryClient();

  // Verify state
  const [verifiedBy, setVerifiedBy] = useState("");
  const [showVerifyInput, setShowVerifyInput] = useState(false);

  // Table edit state
  const [editingTable, setEditingTable] = useState(false);
  const [tableForm, setTableForm] = useState({ description: "", business_purpose: "", domain: "" });

  // Column edit state
  const [editingColId, setEditingColId] = useState(null);
  const [colForm, setColForm] = useState({ description: "", business_name: "", pii_likelihood: "", data_category: "" });

  const { data: detail, isLoading } = useQuery({
    queryKey: ["table-detail", table.id],
    queryFn: () => catalogueApi.getTable(table.id),
  });

  const tableMut = useMutation({
    mutationFn: (payload) => catalogueApi.updateTable(table.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tables"] });
      qc.invalidateQueries({ queryKey: ["table-detail", table.id] });
    },
  });

  const colMut = useMutation({
    mutationFn: ({ id, payload }) => catalogueApi.updateColumn(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["table-detail", table.id] });
      setEditingColId(null);
    },
  });

  function startEditTable() {
    setTableForm({
      description: detail?.description || "",
      business_purpose: detail?.business_purpose || "",
      domain: detail?.domain || "",
    });
    setEditingTable(true);
  }

  function startEditCol(col) {
    setColForm({
      description: col.description || "",
      business_name: col.business_name || "",
      pii_likelihood: col.pii_likelihood || col.ai_pii_likelihood || "none",
      data_category: col.data_category || col.ai_data_category || "other",
    });
    setEditingColId(col.id);
  }

  const isVerified = detail?.is_verified ?? table.is_verified;
  const columns = detail?.columns ?? [];

  return (
    <div className="card space-y-4">

      {/* ── Table header ────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-foreground font-mono">{table.table_name}</h2>
            {isVerified && (
              <span className="badge bg-success/10 text-success border border-success/20 flex items-center gap-1">
                <BadgeCheck size={12} /> Verified
              </span>
            )}
          </div>
          {isVerified && detail?.verified_by && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Verified by <span className="font-semibold">{detail.verified_by}</span>
              {detail.verified_at && <> · {new Date(detail.verified_at).toLocaleDateString()}</>}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Edit table button */}
          {!editingTable && (
            <button onClick={startEditTable} className="btn-outline text-xs py-1.5">
              <Pencil size={12} /> Edit
            </button>
          )}

          {/* Verify / Unverify */}
          {isVerified ? (
            <button
              onClick={() => tableMut.mutate({ is_verified: false, verified_by: "" })}
              disabled={tableMut.isPending}
              className="btn-outline text-xs py-1.5 text-muted-foreground"
            >
              {tableMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              Unverify
            </button>
          ) : showVerifyInput ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                placeholder="Your name"
                value={verifiedBy}
                onChange={(e) => setVerifiedBy(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setShowVerifyInput(false)}
                className="w-28 px-2 py-1.5 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={() => tableMut.mutate({ is_verified: true, verified_by: verifiedBy })}
                disabled={tableMut.isPending || !verifiedBy.trim()}
                className="btn-primary text-xs py-1.5"
              >
                {tableMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Confirm
              </button>
              <button onClick={() => setShowVerifyInput(false)} className="btn-ghost text-xs py-1.5 p-1">
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowVerifyInput(true)}
              className="btn-outline text-xs py-1.5 text-success border-success/40 hover:bg-success/5"
            >
              <ShieldCheck size={12} /> Mark as Verified
            </button>
          )}
        </div>
      </div>

      {/* ── Table edit form ──────────────────────────────────── */}
      {editingTable ? (
        <div className="space-y-3 p-4 rounded-lg border border-primary/30 bg-primary/5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Editing Table Metadata</p>
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</label>
            <textarea
              className={`${inputCls} h-16 resize-none`}
              value={tableForm.description}
              onChange={(e) => setTableForm({ ...tableForm, description: e.target.value })}
              placeholder="Describe what this table stores…"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Business Purpose</label>
            <textarea
              className={`${inputCls} h-14 resize-none`}
              value={tableForm.business_purpose}
              onChange={(e) => setTableForm({ ...tableForm, business_purpose: e.target.value })}
              placeholder="How is this table used by the business?"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Domain</label>
            <input
              className={inputCls}
              value={tableForm.domain}
              onChange={(e) => setTableForm({ ...tableForm, domain: e.target.value })}
              placeholder="e.g. sales, marketing, finance"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => { tableMut.mutate(tableForm); setEditingTable(false); }}
              disabled={tableMut.isPending}
              className="btn-primary text-xs py-1.5"
            >
              {tableMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save
            </button>
            <button onClick={() => setEditingTable(false)} className="btn-ghost text-xs py-1.5 text-muted-foreground">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Description</p>
            <p className="text-xs text-foreground">
              {detail?.effective_description || table.effective_description || <span className="text-muted-foreground italic">No description yet. Click Edit to add one.</span>}
            </p>
          </div>
          {detail?.effective_business_purpose && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Business Purpose</p>
              <p className="text-xs text-foreground">{detail.effective_business_purpose}</p>
            </div>
          )}
          {detail?.effective_domain && (
            <span className="badge bg-muted text-muted-foreground inline-flex">{detail.effective_domain}</span>
          )}
        </div>
      )}

      {/* ── Stats row ────────────────────────────────────────── */}
      <div className="flex gap-4 flex-wrap text-xs text-muted-foreground border-t border-border pt-3">
        <span className="flex items-center gap-1"><Columns size={12} /> {table.column_count ?? columns.length} columns</span>
        {table.row_count_estimate != null && (
          <span className="flex items-center gap-1">
            <Rows size={12} /> ~{Number(table.row_count_estimate).toLocaleString()} rows (estimate)
          </span>
        )}
        {table.pii_column_count > 0 && (
          <span className="flex items-center gap-1 text-warning">
            <ShieldAlert size={12} /> {table.pii_column_count} PII columns
          </span>
        )}
      </div>

      {/* ── Column Definitions ───────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Column Definitions</h3>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2.5 uppercase tracking-wide">Column</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2.5 uppercase tracking-wide">Type</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2.5 uppercase tracking-wide">PII</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2.5 uppercase tracking-wide">Description</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {columns.map((col) => (
                  editingColId === col.id ? (
                    // ── Inline edit row ──
                    <tr key={col.id} className="bg-primary/5">
                      <td colSpan={5} className="px-3 py-3">
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</label>
                            <input
                              autoFocus
                              className={inputCls}
                              value={colForm.description}
                              onChange={(e) => setColForm({ ...colForm, description: e.target.value })}
                              placeholder="What does this column store?"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Business Name</label>
                            <input
                              className={inputCls}
                              value={colForm.business_name}
                              onChange={(e) => setColForm({ ...colForm, business_name: e.target.value })}
                              placeholder="e.g. Customer Email Address"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">PII Level</label>
                            <select
                              className={inputCls}
                              value={colForm.pii_likelihood}
                              onChange={(e) => setColForm({ ...colForm, pii_likelihood: e.target.value })}
                            >
                              {PII_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Data Category</label>
                            <select
                              className={inputCls}
                              value={colForm.data_category}
                              onChange={(e) => setColForm({ ...colForm, data_category: e.target.value })}
                            >
                              {DATA_CATEGORY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => colMut.mutate({ id: col.id, payload: colForm })}
                            disabled={colMut.isPending}
                            className="btn-primary text-xs py-1"
                          >
                            {colMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                            Save
                          </button>
                          <button onClick={() => setEditingColId(null)} className="btn-ghost text-xs py-1 text-muted-foreground">
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    // ── Read row ──
                    <tr key={col.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-3 py-2.5 text-xs font-mono font-medium text-foreground">
                        {col.column_name}
                        {col.is_primary_key && <span className="ml-1.5 badge bg-primary/10 text-primary text-[9px]">PK</span>}
                        {col.is_foreign_key && <span className="ml-1 badge bg-muted text-muted-foreground text-[9px]">FK</span>}
                        {!col.nullable && <span className="ml-1 badge bg-muted text-muted-foreground text-[9px]">NN</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{col.data_type}</td>
                      <td className="px-3 py-2.5">
                        <PiiBadge level={col.effective_pii_likelihood} />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-xs">
                        <span className="line-clamp-2">{col.effective_description || <span className="italic">—</span>}</span>
                        {col.business_name && (
                          <span className="block text-[10px] text-primary mt-0.5">{col.business_name}</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => startEditCol(col)}
                          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Edit column"
                        >
                          <Pencil size={11} />
                        </button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Security note */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
        <ShieldCheck size={12} className="text-emerald-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground">
          AI descriptions are generated by a local model. A small row sample may be read per table
          during generation — no data is sent to external services.
        </p>
      </div>
    </div>
  );
}
