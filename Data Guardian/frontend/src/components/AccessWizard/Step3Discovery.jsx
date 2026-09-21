import { useEffect, useState, useRef } from "react";
import { accessApi } from "../../api/client";
import {
  Loader2, ChevronLeft, ChevronRight, AlertCircle,
  ShieldAlert, Database, Tag,
} from "lucide-react";

const PII_TAG_CLS = "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border text-destructive bg-destructive/10 border-destructive/20";
const CAT_TAG_CLS = "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border text-muted-foreground bg-muted/50 border-border";

export default function Step3Discovery({ form, requestId, setRequestId, onBack, onNext }) {
  const [phase, setPhase]     = useState("creating"); // creating | polling | done | error
  const [errorMsg, setErrorMsg] = useState("");
  const [discovery, setDiscovery] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setPhase("creating");
        const created = await accessApi.createRequest({
          datasource:        form.datasource_id,
          subject_id:        form.subject_id,
          subject_email:     form.subject_email,
          additional_emails: form.additional_emails,
          identifier_table:  form.identifier_table,
          identifier_column: form.identifier_column,
        });
        if (cancelled) return;
        setRequestId(created.id);

        await accessApi.startDiscovery(created.id);
        if (cancelled) return;

        setPhase("polling");
        const reqId = created.id;
        pollRef.current = setInterval(async () => {
          if (cancelled) { clearInterval(pollRef.current); return; }
          try {
            const detail = await accessApi.getRequest(reqId);
            if (detail.status === "discovered" && detail.discovery !== null) {
              clearInterval(pollRef.current);
              setDiscovery(detail.discovery);
              setPhase("done");
            } else if (detail.status === "failed") {
              clearInterval(pollRef.current);
              setErrorMsg(detail.error_message || "Data discovery failed.");
              setPhase("error");
            }
          } catch {
            clearInterval(pollRef.current);
            setErrorMsg("Lost connection while polling discovery status.");
            setPhase("error");
          }
        }, 2000);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err?.response?.data?.detail || err.message || "Failed to start discovery.");
          setPhase("error");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleBack() {
    if (requestId) {
      try { await accessApi.cancel(requestId); } catch { /* ignore */ }
      setRequestId(null);
    }
    onBack();
  }

  if (phase === "creating" || phase === "polling") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 size={32} className="text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">
          {phase === "creating"
            ? "Creating request…"
            : "Traversing FK graph and mapping personal data…"}
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
            <p className="text-sm font-medium text-destructive">Discovery failed</p>
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
  const entries    = discovery?.discovery_data ?? [];
  const totalRows  = discovery?.total_rows ?? 0;

  return (
    <div className="space-y-5">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tables Found",    value: entries.length },
          { label: "Total Records",   value: totalRows },
          { label: "Subject ID",      value: form.subject_id },
        ].map(({ label, value }) => (
          <div key={label} className="bg-muted/40 border border-border rounded-lg px-3 py-2.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold text-foreground mt-0.5 truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* Table breakdown */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {entries.map((entry, i) => (
          <div key={i} className="border border-border rounded-lg px-3 py-2.5 bg-background">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Database size={13} className="text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{entry.table}</span>
                {entry.via === null && (
                  <span className="text-xs text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5">
                    Primary
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {entry.row_count} {entry.row_count === 1 ? "record" : "records"}
              </span>
            </div>
            {entry.via && (
              <p className="text-xs text-muted-foreground font-mono mb-1.5">{entry.via}</p>
            )}
            {entry.pii_columns?.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {entry.pii_columns.map((col) => (
                  <span key={col} className={PII_TAG_CLS}>
                    <ShieldAlert size={10} /> {col}
                  </span>
                ))}
              </div>
            )}
            {entry.data_categories?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {entry.data_categories.map((cat) => (
                  <span key={cat} className={CAT_TAG_CLS}>
                    <Tag size={10} /> {cat}
                  </span>
                ))}
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
          Generate Report <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
