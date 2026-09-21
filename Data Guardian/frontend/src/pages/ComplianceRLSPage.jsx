import { ShieldCheck, Wrench } from "lucide-react";

export default function ComplianceRLSPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-5">
        <ShieldCheck size={32} className="text-sky-600" />
      </div>
      <h1 className="text-xl font-semibold text-foreground mb-2">RLS & Obfuscation</h1>
      <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1 rounded-full text-xs font-medium mb-4">
        <Wrench size={11} />
        Under Construction
      </div>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
        Define row-level security policies and column masking rules across your databases.
        Control which users and roles can see sensitive data — without modifying your application code.
      </p>
    </div>
  );
}
