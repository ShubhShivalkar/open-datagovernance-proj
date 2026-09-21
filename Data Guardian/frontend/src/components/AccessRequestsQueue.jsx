import { useQuery } from "@tanstack/react-query";
import { accessApi } from "../api/client";
import { Loader2, AlertCircle, ClipboardList } from "lucide-react";

const STATUS_STYLES = {
  draft:        "bg-muted text-muted-foreground border-border",
  discovering:  "bg-blue-500/10 text-blue-600 border-blue-200",
  discovered:   "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  report_ready: "bg-primary/10 text-primary border-primary/20",
  sent:         "bg-green-500/10 text-green-700 border-green-200",
  failed:       "bg-destructive/10 text-destructive border-destructive/20",
  cancelled:    "bg-muted text-muted-foreground border-border",
};

const STATUS_LABELS = {
  draft:        "Draft",
  discovering:  "Discovering",
  discovered:   "Discovered",
  report_ready: "Report Ready",
  sent:         "Report Sent",
  failed:       "Failed",
  cancelled:    "Cancelled",
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function AccessRequestsQueue() {
  const { data: requests = [], isLoading, isError } = useQuery({
    queryKey: ["access-requests"],
    queryFn: accessApi.listRequests,
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
        <AlertCircle size={14} /> Failed to load request history.
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <ClipboardList size={28} className="text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No access requests yet</p>
        <p className="text-xs text-muted-foreground">Submitted requests will appear here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {["Subject Email", "Subject ID", "Identifier", "Status", "Submitted"].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {requests.map((req) => (
            <tr key={req.id} className="hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 font-medium text-foreground">{req.subject_email}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{req.subject_id}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                {req.identifier_table}.{req.identifier_column}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={req.status} />
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {new Date(req.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
