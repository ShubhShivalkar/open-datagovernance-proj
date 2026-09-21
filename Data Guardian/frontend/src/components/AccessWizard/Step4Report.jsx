import { useEffect, useState } from "react";
import { accessApi } from "../../api/client";
import {
  Loader2, AlertCircle, ShieldAlert, Tag, Database,
  Mail, Download, CheckCircle2, RefreshCw,
} from "lucide-react";

const PII_TAG_CLS  = "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border text-destructive bg-destructive/10 border-destructive/20";
const CAT_TAG_CLS  = "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border text-muted-foreground bg-muted/50 border-border";

export default function Step4Report({ form, requestId, onReset }) {
  const [report, setReport]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [errorMsg, setErrorMsg]     = useState("");
  const [sending, setSending]       = useState(false);
  const [sent, setSent]             = useState(false);
  const [exporting, setExporting]   = useState(false);
  const [sendError, setSendError]   = useState("");

  useEffect(() => {
    let cancelled = false;
    async function fetchReport() {
      try {
        const r = await accessApi.getReport(requestId);
        if (!cancelled) { setReport(r); setLoading(false); }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err?.response?.data?.detail || err.message || "Failed to generate report.");
          setLoading(false);
        }
      }
    }
    fetchReport();
    return () => { cancelled = true; };
  }, [requestId]);

  async function handleSend() {
    setSending(true);
    setSendError("");
    try {
      await accessApi.sendReport(requestId, form.additional_emails);
      setSent(true);
    } catch (err) {
      setSendError(err?.response?.data?.detail || err.message || "Failed to send report.");
    } finally {
      setSending(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const response = await accessApi.exportXlsx(requestId);
      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dsar_${form.subject_id}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setSendError(err?.response?.data?.detail || err.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 size={28} className="text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Compiling report…</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
        <AlertCircle size={16} className="text-destructive mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-destructive">Report generation failed</p>
          <p className="text-xs text-muted-foreground mt-0.5">{errorMsg}</p>
        </div>
      </div>
    );
  }

  const inventory = report?.data_inventory ?? [];

  return (
    <div className="space-y-5">
      {/* Report header */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 space-y-0.5">
        <p className="text-xs text-muted-foreground">Data Access Report</p>
        <p className="text-sm font-semibold text-foreground">
          {report.subject.email}
          <span className="font-normal text-muted-foreground ml-2 text-xs">
            — ID: {report.subject.id}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Identifier: <span className="font-mono">{report.subject.identifier_field}</span>
          &nbsp;·&nbsp;
          Generated: {new Date(report.generated_at).toLocaleString()}
        </p>
      </div>

      {/* Summary */}
      <div className="text-sm text-foreground leading-relaxed">{report.summary}</div>

      {/* Data inventory */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {inventory.map((entry, i) => (
          <div key={i} className="border border-border rounded-lg px-3 py-2.5 bg-background">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Database size={13} className="text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{entry.table}</span>
                {entry.is_primary_table && (
                  <span className="text-xs text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5">
                    Primary
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {entry.record_count} {entry.record_count === 1 ? "record" : "records"}
              </span>
            </div>
            {entry.business_purpose && (
              <p className="text-xs text-muted-foreground mb-1.5 italic">{entry.business_purpose}</p>
            )}
            <div className="flex flex-wrap gap-1">
              {entry.pii_columns?.map((col) => (
                <span key={col} className={PII_TAG_CLS}>
                  <ShieldAlert size={10} /> {col}
                </span>
              ))}
              {entry.data_categories?.map((cat) => (
                <span key={cat} className={CAT_TAG_CLS}>
                  <Tag size={10} /> {cat}
                </span>
              ))}
            </div>
            {entry.via && (
              <p className="text-xs text-muted-foreground font-mono mt-1.5">{entry.via}</p>
            )}
          </div>
        ))}
      </div>

      {/* Legal basis */}
      <div className="bg-muted/40 border border-border rounded-lg px-4 py-3 space-y-1">
        <p className="text-xs font-medium text-foreground">Legal Basis</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{report.legal_basis}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{report.notes}</p>
      </div>

      {/* Actions */}
      <div className="border-t border-border pt-4 space-y-3">
        {/* Send report */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-foreground">Share Report</p>
            <p className="text-xs text-muted-foreground">
              Send to: <span className="font-medium">{form.subject_email}</span>
              {form.additional_emails.length > 0 && ` + ${form.additional_emails.length} more`}
            </p>
          </div>
          {sent ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 size={15} /> Sent
            </span>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="btn btn-primary flex items-center gap-2 text-sm"
            >
              {sending
                ? <><Loader2 size={14} className="animate-spin" /> Sending…</>
                : <><Mail size={14} /> Send Report</>}
            </button>
          )}
        </div>

        {/* Export xlsx */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-foreground">Export</p>
            <p className="text-xs text-muted-foreground">Download as .xlsx spreadsheet</p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="btn btn-outline flex items-center gap-2 text-sm"
          >
            {exporting
              ? <><Loader2 size={14} className="animate-spin" /> Exporting…</>
              : <><Download size={14} /> Export .xlsx</>}
          </button>
        </div>

        {sendError && (
          <p className="text-xs text-destructive">{sendError}</p>
        )}

        {/* Start over */}
        <div className="flex justify-end pt-1">
          <button type="button" onClick={onReset} className="btn btn-ghost flex items-center gap-2 text-sm">
            <RefreshCw size={13} /> New Request
          </button>
        </div>
      </div>
    </div>
  );
}
