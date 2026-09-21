import { useState, useRef, useEffect } from "react";
import { erasureApi } from "../../api/client";
import {
  Loader2, CheckCircle2, AlertCircle, ShieldCheck, AlertTriangle, ChevronLeft,
} from "lucide-react";

const REQUIRED_PHRASE =
  "I approve of the full erasure and understand this would delete all the data and cannot be recovered";

export default function Step4Approval({ requestId, form, onBack, onReset }) {
  const [phrase, setPhrase] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | submitting | executing | done | failed
  const [errorMsg, setErrorMsg] = useState("");
  const [auditId, setAuditId] = useState("");
  const pollRef = useRef(null);
  const matches = phrase.trim() === REQUIRED_PHRASE;

  useEffect(() => () => clearInterval(pollRef.current), []);

  async function handleApprove() {
    if (!matches) return;
    setPhase("submitting");
    setErrorMsg("");
    try {
      await erasureApi.approve(requestId, phrase.trim());
      setPhase("executing");
      await erasureApi.execute(requestId);

      // Poll until completed or failed
      pollRef.current = setInterval(async () => {
        try {
          const detail = await erasureApi.getRequest(requestId);
          if (detail.status === "completed") {
            clearInterval(pollRef.current);
            setAuditId(detail.id);
            setPhase("done");
          } else if (detail.status === "failed") {
            clearInterval(pollRef.current);
            setErrorMsg(detail.error_message || "Execution failed — all changes were rolled back.");
            setPhase("failed");
          }
        } catch {
          clearInterval(pollRef.current);
          setErrorMsg("Lost connection while polling execution status.");
          setPhase("failed");
        }
      }, 2000);
    } catch (err) {
      setErrorMsg(err?.response?.data?.detail || err.message || "Approval failed.");
      setPhase("idle");
    }
  }

  if (phase === "submitting" || phase === "executing") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 size={32} className="text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">
          {phase === "submitting" ? "Recording approval…" : "Executing erasure — do not close this window…"}
        </p>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
          <CheckCircle2 size={28} className="text-green-600" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Erasure Complete</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          All records for <strong>{form.data_principal_id}</strong> have been permanently deleted
          and an immutable audit record has been written.
        </p>
        <div className="bg-muted/40 border border-border rounded-lg px-4 py-2 text-xs font-mono text-muted-foreground">
          Audit Record: {auditId}
        </div>
        <p className="text-xs text-muted-foreground">
          A confirmation notification has been logged for the data principal.
        </p>
        <button type="button" onClick={onReset} className="btn btn-outline mt-2">
          Submit Another Request
        </button>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
          <AlertCircle size={16} className="text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Execution Failed — Changes Rolled Back</p>
            <p className="text-xs text-muted-foreground mt-0.5">{errorMsg}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          The database is unchanged. You can retry or contact your administrator.
        </p>
        <div className="flex justify-between">
          <button type="button" onClick={onBack} className="btn btn-ghost flex items-center gap-2">
            <ChevronLeft size={15} /> Back to Plan
          </button>
          <button type="button" onClick={onReset} className="btn btn-outline">
            Start Over
          </button>
        </div>
      </div>
    );
  }

  // idle
  return (
    <div className="space-y-5">
      {/* Request summary */}
      <div className="border border-border rounded-lg px-4 py-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-primary" />
          <span className="text-sm font-medium text-foreground">DGO Approval Required</span>
        </div>
        <p className="text-xs text-muted-foreground pl-5">
          Request: <span className="font-mono">{requestId}</span>
        </p>
        <p className="text-xs text-muted-foreground pl-5">
          Principal: <strong>{form.data_principal_id}</strong>
        </p>
      </div>

      {/* Phrase instruction */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 text-amber-700">
          <AlertTriangle size={14} />
          <span className="text-sm font-semibold">Type the following phrase exactly to approve:</span>
        </div>
        <blockquote className="font-mono text-xs text-amber-800 bg-amber-100 rounded px-3 py-2 select-all leading-relaxed">
          {REQUIRED_PHRASE}
        </blockquote>
      </div>

      {/* Phrase input */}
      <div>
        <textarea
          className={`w-full px-3 py-2 text-sm border rounded-lg bg-background text-foreground resize-none min-h-[70px] focus:outline-none focus:ring-2 transition-colors font-mono ${
            phrase && !matches
              ? "border-destructive ring-destructive/20"
              : matches
              ? "border-green-500 ring-green-500/20 focus:ring-green-500/20"
              : "border-border focus:ring-primary/30"
          }`}
          placeholder="Type the confirmation phrase here…"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
        />
        {phrase && !matches && (
          <p className="text-xs text-destructive mt-1">Phrase does not match — check for typos.</p>
        )}
        {matches && (
          <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
            <CheckCircle2 size={12} /> Phrase confirmed.
          </p>
        )}
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          <AlertCircle size={14} /> {errorMsg}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="btn btn-ghost flex items-center gap-2">
          <ChevronLeft size={15} /> Back to Plan
        </button>
        <button
          type="button"
          onClick={handleApprove}
          disabled={!matches}
          className="btn btn-destructive flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Approve &amp; Execute Erasure
        </button>
      </div>
    </div>
  );
}
