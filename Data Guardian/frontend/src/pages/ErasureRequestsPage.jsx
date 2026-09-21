import {
  Shield, Lock, Upload, AlertTriangle, CheckCircle,
  Trash2, Download, Bot, Eye,
} from "lucide-react";

const erasureHistory = [
  { id: "ER-2024-0847", date: "2024-03-28 14:32", records: 1247, status: "COMPLETED" },
  { id: "ER-2024-0832", date: "2024-03-25 09:15", records: 89,   status: "COMPLETED" },
  { id: "ER-2024-0819", date: "2024-03-21 17:44", records: 3421, status: "COMPLETED" },
  { id: "ER-2024-0804", date: "2024-03-18 11:22", records: 562,  status: "COMPLETED" },
];

const erasureScope = ["PII Data Scrubbing", "Object Storage Purge", "Analytics Anonymization"];

export default function ErasureRequestsPage() {
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Erasure Requests</h1>
          <p className="text-sm text-muted-foreground">GDPR-compliant data erasure management</p>
        </div>
        <div className="flex gap-2">
          <span className="badge bg-primary/10 text-primary px-3 py-1.5">
            <Shield size={12} /> GDPR COMPLIANCE
          </span>
          <span className="badge bg-success/10 text-success px-3 py-1.5">
            <Lock size={12} /> PRIVACY SHIELD
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left — Request Configuration */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <h3 className="text-sm font-semibold text-foreground mb-4">Request Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Manual IDs */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Enter User IDs Manually
                </label>
                <textarea
                  placeholder={"Enter User IDs separated by commas or new lines\n\ne.g.\nUSR-4821\nUSR-7293\nUSR-1056"}
                  className="w-full min-h-[160px] font-mono text-xs p-3 border border-border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                />
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Upload File
                </label>
                <div className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center min-h-[160px] hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer">
                  <Upload size={32} className="text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Drop CSV or XLSX file here</p>
                  <p className="text-xs text-muted-foreground mt-1">Max 10MB</p>
                  <button className="mt-3 text-xs text-primary flex items-center gap-1 hover:underline">
                    <Download size={12} /> Download Template
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
            <AlertTriangle size={18} className="text-destructive shrink-0" />
            <p className="text-sm text-destructive font-medium">
              This action is irreversible. All matched records will be permanently erased.
            </p>
          </div>

          {/* Confirm Button */}
          <button className="btn-destructive w-full justify-center py-3">
            <Trash2 size={16} />
            Confirm Erasure →
          </button>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">

          {/* Compliance Guardrail */}
          <div className="card border-primary/20 bg-primary/5">
            <h3 className="text-sm font-semibold text-primary mb-2">Compliance Guardrail</h3>
            <p className="text-xs text-muted-foreground mb-3">
              All erasure requests are cross-referenced with data retention policies and active legal holds before execution.
            </p>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-xs font-medium text-foreground">Active Legal Holds</span>
                <span className="text-xs text-muted-foreground">12 Users</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: "12%" }} />
              </div>
            </div>
          </div>

          {/* Erasure Scope */}
          <div className="card">
            <h3 className="text-sm font-semibold text-foreground mb-3">Erasure Scope</h3>
            <div className="space-y-2">
              {erasureScope.map((item) => (
                <div key={item} className="flex items-center gap-2 text-xs text-foreground">
                  <CheckCircle size={13} className="text-success" />
                  {item}
                </div>
              ))}
            </div>
            <button className="btn-outline text-xs w-full mt-3 py-1.5">
              Edit Erasure Policy
            </button>
          </div>

          {/* Curator Insight */}
          <div className="card bg-muted/50">
            <div className="flex items-start gap-2">
              <Bot size={14} className="text-primary shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium text-foreground mb-1">Curator Insight</p>
                <p className="text-muted-foreground">
                  Erasure volume increased 23% this quarter. 78% of requests originate from EU regions,
                  consistent with GDPR enforcement patterns.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent History */}
      <div className="card">
        <h3 className="text-sm font-semibold text-foreground mb-4">Recent Erasure History</h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2.5 uppercase tracking-wide">Request ID</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2.5 uppercase tracking-wide">Date & Time</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2.5 uppercase tracking-wide">Affected Records</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-3 py-2.5 uppercase tracking-wide">Status</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {erasureHistory.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-3 text-xs font-mono text-foreground">{row.id}</td>
                  <td className="px-3 py-3 text-xs text-foreground">{row.date}</td>
                  <td className="px-3 py-3 text-xs text-foreground">{row.records.toLocaleString()}</td>
                  <td className="px-3 py-3">
                    <span className="badge bg-success/10 text-success">{row.status}</span>
                  </td>
                  <td className="px-3 py-3">
                    <button className="btn-ghost w-6 h-6 p-0 flex items-center justify-center text-muted-foreground">
                      <Eye size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
