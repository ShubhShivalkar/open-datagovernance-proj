import {
  CheckCircle, AlertTriangle, ShieldAlert, Clock, Check, X,
} from "lucide-react";

const alerts = [
  { id: 1, type: "Anomalous Activity", severity: "critical", message: "Unusual bulk export from customer_profiles", time: "2 min ago" },
  { id: 2, type: "Policy Violation",   severity: "warning",  message: "Unmasked PII accessed in staging env",          time: "18 min ago" },
  { id: 3, type: "Audit Warning",      severity: "info",     message: "Scheduled compliance report overdue",           time: "1 hr ago" },
];

const accessRequests = [
  { id: 1, user: "Sarah Chen",   role: "Analyst",        resource: "financial_records_q4.csv",  initials: "SC" },
  { id: 2, user: "Mike Torres",  role: "Data Scientist", resource: "customer_profiles_masked",  initials: "MT" },
  { id: 3, user: "Priya Sharma", role: "Contractor",     resource: "orders_main_staging",       initials: "PS" },
];

const envHealth = [
  { name: "PostgreSQL-Prod", status: "Stable",  region: "us-east-1" },
  { name: "AWS-Redshift",    status: "Syncing", region: "us-west-2" },
  { name: "MySQL-Staging",   status: "Stable",  region: "eu-west-1" },
];

const severityStyles = {
  critical: "bg-destructive text-destructive-foreground",
  warning:  "bg-warning text-warning-foreground",
  info:     "bg-accent text-accent-foreground",
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">

      {/* Status Banner */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-success/10 text-success px-4 py-2 rounded-lg text-sm font-medium">
          <CheckCircle size={16} />
          All Environments Connected
        </div>
        <div className="flex items-center gap-2 bg-warning/10 text-warning-foreground px-4 py-2 rounded-lg text-sm font-medium">
          <AlertTriangle size={16} className="text-warning" />
          3 Pending Requests
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* System Alerts */}
        <div className="card space-y-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <ShieldAlert size={16} className="text-destructive" />
            System Alerts
          </h2>
          {alerts.map((alert) => (
            <div key={alert.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`badge ${severityStyles[alert.severity]}`}>
                    {alert.type}
                  </span>
                </div>
                <p className="text-sm text-foreground">{alert.message}</p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1 shrink-0">
                <Clock size={12} />
                {alert.time}
              </span>
            </div>
          ))}
        </div>

        {/* Access Requests */}
        <div className="card space-y-3">
          <h2 className="text-base font-semibold text-foreground">Access Requests</h2>
          {accessRequests.map((req) => (
            <div key={req.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                  {req.initials}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{req.user}</p>
                  <p className="text-xs text-muted-foreground">{req.role} · {req.resource}</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button className="w-7 h-7 rounded-lg bg-success/10 text-success hover:bg-success/20 flex items-center justify-center transition-colors">
                  <Check size={15} />
                </button>
                <button className="w-7 h-7 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition-colors">
                  <X size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Environment Health */}
        <div className="card space-y-2">
          <h2 className="text-base font-semibold text-foreground">Environment Health</h2>
          {envHealth.map((env) => (
            <div key={env.name} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
              <div>
                <p className="text-sm font-medium text-foreground">{env.name}</p>
                <p className="text-xs text-muted-foreground">{env.region}</p>
              </div>
              <span className={`badge ${
                env.status === "Stable"
                  ? "bg-success/10 text-success"
                  : "bg-warning/10 text-warning"
              }`}>
                {env.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
