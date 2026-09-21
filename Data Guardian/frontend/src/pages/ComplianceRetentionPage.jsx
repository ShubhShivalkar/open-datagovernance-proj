import { Timer, Wrench } from "lucide-react";

export default function ComplianceRetentionPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-5">
        <Timer size={32} className="text-violet-600" />
      </div>
      <h1 className="text-xl font-semibold text-foreground mb-2">Retention Policy Enforcement</h1>
      <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1 rounded-full text-xs font-medium mb-4">
        <Wrench size={11} />
        Under Construction
      </div>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
        Define how long data is kept in each table and automate scheduled purges.
        Enforce GDPR storage limitation and sector-specific retention schedules with a full
        audit trail.
      </p>
    </div>
  );
}
