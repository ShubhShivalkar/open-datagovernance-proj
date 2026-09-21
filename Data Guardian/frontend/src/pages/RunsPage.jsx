import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { islandsApi, queryEditorApi } from "../api/client";
import {
  Loader2, CheckCircle, Clock, Layers, RefreshCw, Eye, AlertTriangle,
  ChevronDown, CalendarClock, Pencil,
} from "lucide-react";
import { Link } from "react-router-dom";

const fmt = (v) => (v ? new Date(v).toLocaleString() : "—");

// ── Collapsible section wrapper ──────────────────────────────────────────────

function RoutineSection({ Icon, title, subtitle, count, children }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border border-border rounded-xl bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <Icon size={15} className="text-primary shrink-0" />
        <div className="text-left flex-1 min-w-0">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        <span className="badge bg-muted text-muted-foreground shrink-0">{count}</span>
        <ChevronDown
          size={15}
          className={`text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </section>
  );
}

function EmptyState({ Icon, title, hint }) {
  return (
    <div className="text-center py-10">
      <Icon size={30} className="text-muted mx-auto mb-3" />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

// ── Data Island routine card ─────────────────────────────────────────────────

const ISLAND_STATUS_BADGE = {
  active: { cls: "bg-success/10 text-success",         label: "Active", Icon: CheckCircle },
  error:  { cls: "bg-destructive/10 text-destructive", label: "Error",  Icon: AlertTriangle },
  draft:  { cls: "bg-muted text-muted-foreground",     label: "Draft",  Icon: Clock },
  stale:  { cls: "bg-warning/10 text-warning",         label: "Stale",  Icon: AlertTriangle },
};

function IslandRoutineCard({ island, onRunNow, isRunning }) {
  const cfg = ISLAND_STATUS_BADGE[island.status] ?? ISLAND_STATUS_BADGE.draft;

  const scheduleDisplay = (() => {
    if (!island.schedule_value) return "—";
    if (island.schedule_type === "frequency") {
      try {
        const c = JSON.parse(island.schedule_value);
        return `Every ${c.every} ${c.unit}`;
      } catch { return island.schedule_value; }
    }
    return island.schedule_value;
  })();

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Layers size={15} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{island.name}</p>
            <p className="text-[10px] text-muted-foreground">{island.datasource_name}</p>
          </div>
        </div>
        <span className={`badge flex items-center gap-1 shrink-0 ${cfg.cls}`}>
          <cfg.Icon size={10} /> {cfg.label}
        </span>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Schedule</span>
          <span className="font-mono text-foreground">{scheduleDisplay}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Next Run</span>
          <span className="text-foreground">{fmt(island.next_run_at)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last Refreshed</span>
          <span className="text-foreground">{island.last_refreshed_at ? fmt(island.last_refreshed_at) : "Never"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Views</span>
          <span className="text-foreground">{island.view_count ?? 0} view{(island.view_count ?? 0) !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
        <Link to={`/data-islands/${island.id}`} className="btn-outline text-xs py-1.5 flex items-center gap-1">
          <Eye size={12} /> Details
        </Link>
        <button onClick={onRunNow} disabled={isRunning} className="btn-primary text-xs py-1.5">
          {isRunning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Run Now
        </button>
      </div>
    </div>
  );
}

// ── Scheduled query routine card ─────────────────────────────────────────────

function cadenceDisplay(s) {
  if (s.cadence_display) return s.cadence_display;
  if (s.cadence_type === "frequency") {
    try {
      const c = JSON.parse(s.cadence_value);
      return `Every ${c.every} ${c.unit}`;
    } catch { return s.cadence_value; }
  }
  return s.cadence_value;
}

function ScheduledQueryCard({ schedule, onRunNow, isRunning }) {
  const statusCfg =
    schedule.last_status === "success"
      ? { cls: "bg-success/10 text-success", label: "Success", Icon: CheckCircle }
      : schedule.last_status === "error"
      ? { cls: "bg-destructive/10 text-destructive", label: "Error", Icon: AlertTriangle }
      : { cls: "bg-muted text-muted-foreground", label: schedule.is_active ? "Idle" : "Paused", Icon: Clock };

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarClock size={15} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{schedule.saved_query_name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{schedule.datasource_name}</p>
          </div>
        </div>
        <span className={`badge flex items-center gap-1 shrink-0 ${statusCfg.cls}`}>
          <statusCfg.Icon size={10} /> {statusCfg.label}
        </span>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Target</span>
          <span className="font-mono text-foreground truncate ml-2">
            {schedule.target_schema}.{schedule.target_table}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cadence</span>
          <span className="font-mono text-foreground">{cadenceDisplay(schedule)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Write mode</span>
          <span className="badge bg-muted text-muted-foreground capitalize">{schedule.write_mode}</span>
        </div>
        {schedule.email_enabled && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Mailer</span>
            <span className="text-foreground truncate ml-2">
              {(schedule.email_recipients || "").split(",").filter((s) => s.trim()).length} recipient(s)
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Next Run</span>
          <span className="text-foreground">{schedule.is_active ? fmt(schedule.next_run_at) : "Paused"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last Run</span>
          <span className="text-foreground">
            {fmt(schedule.last_run_at)}
            {schedule.last_row_count != null && ` · ${schedule.last_row_count} rows`}
          </span>
        </div>
        <span className="badge bg-muted text-muted-foreground">
          {scheduledIslands.length} scheduled
        </span>
      </div>

      {schedule.last_error && (
        <p className="text-[10px] text-destructive font-mono break-words">{schedule.last_error}</p>
      )}

      <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
        <Link
          to={`/query-editor?saved=${schedule.saved_query}`}
          className="btn-outline text-xs py-1.5 flex items-center gap-1"
        >
          <Pencil size={12} /> Open in editor
        </Link>
        <button onClick={onRunNow} disabled={isRunning} className="btn-primary text-xs py-1.5">
          {isRunning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Run Now
        </button>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function RunsPage() {
  const qc = useQueryClient();

  const islandsQuery = useQuery({ queryKey: ["islands"], queryFn: islandsApi.list });
  const schedulesQuery = useQuery({
    queryKey: ["query-schedules"],
    queryFn: () => queryEditorApi.listSchedules(),
  });

  const islandRunMut = useMutation({
    mutationFn: islandsApi.refresh,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["islands"] }),
  });
  const scheduleRunMut = useMutation({
    mutationFn: queryEditorApi.runScheduleNow,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["query-schedules"] }),
  });

  const allIslands = islandsQuery.data?.results ?? islandsQuery.data ?? [];
  const scheduledIslands = allIslands.filter((i) => i.refresh_type === "scheduled");
  const schedules = schedulesQuery.data?.results ?? schedulesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Routines</h1>
        <p className="text-sm text-muted-foreground">
          Scheduled data routines — Data Island refreshes and query materializations
        </p>
      </div>

      <RoutineSection
        Icon={Layers}
        title="Data Island Routines"
        subtitle="Scheduled CREATE OR REPLACE VIEW refreshes"
        count={scheduledIslands.length}
      >
        {islandsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : scheduledIslands.length === 0 ? (
          <EmptyState
            Icon={Layers}
            title="No scheduled island routines"
            hint='Create an island with "Scheduled" refresh type to see it here.'
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {scheduledIslands.map((island) => (
              <IslandRoutineCard
                key={island.id}
                island={island}
                onRunNow={() => islandRunMut.mutate(island.id)}
                isRunning={islandRunMut.isPending && islandRunMut.variables === island.id}
              />
            ))}
          </div>
        )}
      </RoutineSection>

      <RoutineSection
        Icon={CalendarClock}
        title="Scheduled Queries"
        subtitle="Saved queries materialized into the schedules schema on a cadence"
        count={schedules.length}
      >
        {schedulesQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : schedules.length === 0 ? (
          <EmptyState
            Icon={CalendarClock}
            title="No scheduled queries"
            hint="Open a saved query in the Query Editor and click Schedule to create one."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {schedules.map((schedule) => (
              <ScheduledQueryCard
                key={schedule.id}
                schedule={schedule}
                onRunNow={() => scheduleRunMut.mutate(schedule.id)}
                isRunning={scheduleRunMut.isPending && scheduleRunMut.variables === schedule.id}
              />
            ))}
          </div>
        )}
      </RoutineSection>
    </div>
  );
}
