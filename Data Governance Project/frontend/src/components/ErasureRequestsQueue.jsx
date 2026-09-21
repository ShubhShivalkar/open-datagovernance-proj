import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { erasureApi } from "../api/client";
import { Loader2, RefreshCw, XCircle, FileText, AlertCircle } from "lucide-react";

const STATUS_BADGE = {
  draft:            "badge bg-muted text-muted-foreground",
  planned:          "badge bg-sky-100 text-sky-700 border border-sky-200",
  pending_approval: "badge bg-amber-100 text-amber-700 border border-amber-200",
  approved:         "badge bg-violet-100 text-violet-700 border border-violet-200",
  executing:        "badge bg-blue-100 text-blue-700 border border-blue-200",
  completed:        "badge bg-green-100 text-green-700 border border-green-200",
  failed:           "badge bg-destructive/10 text-destructive border border-destructive/20",
  cancelled:        "badge bg-muted text-muted-foreground",
};

const STATUS_LABEL = {
  draft:            "Draft",
  planned:          "Plan Ready",
  pending_approval: "Pending Approval",
  approved:         "Approved",
  executing:        "Executing…",
  completed:        "Completed",
  failed:           "Failed",
  cancelled:        "Cancelled",
};

function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString(undefined, {
    dateStyle: "medium", timeStyle: "short",
  });
}

function shortId(id) {
  return id?.slice(0, 8) ?? "—";
}

export default function ErasureRequestsQueue() {
  const qc = useQueryClient();

  const { data: requests = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["erasure-requests"],
    queryFn: erasureApi.listRequests,
    refetchInterval: 8000,
  });

  const { data: auditLog = [] } = useQuery({
    queryKey: ["erasure-audit-log"],
    queryFn: erasureApi.auditLog,
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => erasureApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erasure-requests"] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
        <Loader2 size={16} className="animate-spin" /> Loading requests…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive py-8 justify-center">
        <AlertCircle size={14} /> Failed to load requests.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Requests table */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">Erasure Requests</h2>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          No erasure requests yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">ID</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Principal</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Table</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Rows</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Created</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {shortId(req.id)}
                  </td>
                  <td className="px-3 py-2.5 text-foreground max-w-[160px] truncate">
                    {req.data_principal_id}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {req.identifier_table}.{req.identifier_column}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {req.plan?.total_rows ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={STATUS_BADGE[req.status] ?? "badge"}>
                      {STATUS_LABEL[req.status] ?? req.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {fmt(req.created_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    {["draft", "planned", "pending_approval"].includes(req.status) && (
                      <button
                        type="button"
                        onClick={() => cancelMutation.mutate(req.id)}
                        disabled={cancelMutation.isPending}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                        title="Cancel request"
                      >
                        <XCircle size={13} /> Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit Log */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <FileText size={14} className="text-muted-foreground" />
          Compliance Audit Log
          <span className="ml-1 text-xs text-muted-foreground font-normal">(immutable)</span>
        </h2>
        {auditLog.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
            No completed erasures yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Audit ID</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Principal</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Tables</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Rows Deleted</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Approved By</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Executed</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((log) => (
                  <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {shortId(log.id)}
                    </td>
                    <td className="px-3 py-2.5 text-foreground max-w-[160px] truncate">
                      {log.data_principal_id}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {Array.isArray(log.tables_affected) ? log.tables_affected.join(", ") : "—"}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-destructive">
                      {log.rows_deleted}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate">
                      {log.approver_identity}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {fmt(log.executed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
