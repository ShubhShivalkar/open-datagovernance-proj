import { useEffect, useState, useRef } from "react";
import { erasureApi } from "../../api/client";
import {
  Loader2, ChevronLeft, ChevronRight, AlertCircle,
  ShieldAlert, Database, AlertTriangle,
} from "lucide-react";

const PII_COLORS = {
  high:   "text-destructive bg-destructive/10 border-destructive/20",
  medium: "text-warning bg-warning/10 border-warning/20",
};

function PiiTag({ col }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border ${PII_COLORS.high}`}>
      <ShieldAlert size={10} /> {col}
    </span>
  );
}

export default function Step3Plan({ form, requestId, setRequestId, onBack, onNext }) {
  const [phase, setPhase] = useState("creating"); // creating | polling | done | error
  const [errorMsg, setErrorMsg] = useState("");
  const [plan, setPlan] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // Build the input_raw value for table input type
        let input_raw = form.input_raw;
        if (form.input_type === "table") {
          input_raw = `${form.source_table}|${form.source_column}`;
        }

        // Create request
        setPhase("creating");
        const created = await erasureApi.createRequest({
          datasource: form.datasource_id,
          data_principal_id: form.data_principal_id,
          identifier_table: form.identifier_table,
          identifier_column: form.identifier_column,
          input_type: form.input_type,
          input_raw,
          reason: form.reason,
        });
        if (cancelled) return;
        setRequestId(created.id);

        // Trigger plan build
        await erasureApi.buildPlan(created.id);
        if (cancelled) return;

        // Poll until planned or failed
        setPhase("polling");
        const reqId = created.id;
        pollRef.current = setInterval(async () => {
          if (cancelled) { clearInterval(pollRef.current); return; }
          try {
            const detail = await erasureApi.getRequest(reqId);
            if (detail.status === "planned" && detail.plan !== null) {
              clearInterval(pollRef.current);
              setPlan(detail.plan);
              setPhase("done");
            } else if (detail.status === "failed") {
              clearInterval(pollRef.current);
              setErrorMsg(detail.error_message || "Plan compilation failed.");
              setPhase("error");
            }
          } catch {
            clearInterval(pollRef.current);
            setErrorMsg("Lost connection while polling plan status.");
            setPhase("error");
          }
        }, 2000);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err?.response?.data?.detail || err.message || "Failed to start plan.");
          setPhase("error");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
    };
  }, []); // run once on mount

  async function handleBack() {
    // Cancel the request before going back
    if (requestId) {
      try { await erasureApi.cancel(requestId); } catch { /* ignore */ }
      setRequestId(null);
    }
    onBack();
  }

  if (phase === "creating" || phase === "polling") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 size={32} className="text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">
          {phase === "creating" ? "Creating request…" : "Traversing FK graph and compiling erasure plan…"}
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
          <AlertCircle size={16} className="text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Plan compilation failed</p>
            <p className="text-xs text-muted-foreground mt-0.5">{errorMsg}</p>
          </div>
        </div>
        <div className="flex justify-between">
          <button type="button" onClick={handleBack} className="btn btn-ghost flex items-center gap-2">
            <ChevronLeft size={15} /> Back
          </button>
        </div>
      </div>
    );
  }

  // phase === "done"
  const entries = plan?.plan_data ?? [];
  const total = plan?.total_rows ?? 0;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tables Affected", value: entries.length, icon: Database },
          { label: "Total Rows", value: total, icon: Database },
          { label: "Data Principal", value: form.data_principal_id, icon: ShieldAlert },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-muted/40 border border-border rounded-lg px-3 py-2.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold text-foreground mt-0.5 truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* Destructive warning */}
      <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
        <AlertTriangle size={16} className="text-destructive mt-0.5 shrink-0" />
        <p className="text-sm text-destructive">
          This action is <strong>irreversible</strong>. Approved plans execute permanent DELETE
          statements against your live database.
        </p>
      </div>

      {/* Table breakdown */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {entries.map((entry, i) => (
          <div key={i} className="border border-border rounded-lg px-3 py-2.5 bg-background">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-foreground">{entry.table}</span>
              <span className="text-xs text-muted-foreground">{entry.row_pks?.length ?? 0} rows</span>
            </div>
            {entry.via && (
              <p className="text-xs text-muted-foreground mb-1.5 font-mono">{entry.via}</p>
            )}
            {entry.pii_columns?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {entry.pii_columns.map((col) => <PiiTag key={col} col={col} />)}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-between pt-2">
        <button type="button" onClick={handleBack} className="btn btn-ghost flex items-center gap-2">
          <ChevronLeft size={15} /> Back
        </button>
        <button type="button" onClick={onNext} className="btn btn-primary flex items-center gap-2">
          Send for Approval <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
