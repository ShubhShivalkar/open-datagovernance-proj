import { useState } from "react";
import { ClipboardList, PlusCircle, History } from "lucide-react";
import AccessWizard from "../components/AccessWizard";
import AccessRequestsQueue from "../components/AccessRequestsQueue";

const TABS = [
  { id: "new",     label: "New Request",     Icon: PlusCircle },
  { id: "history", label: "Request History", Icon: History },
];

export default function ComplianceDataAccessPage() {
  const [tab, setTab] = useState("new");

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <ClipboardList size={16} className="text-emerald-600" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Data Access Request</h1>
        </div>
        <p className="text-sm text-muted-foreground pl-11">
          Process DSAR requests — discover personal data across connected tables and generate
          a DPDPA-compliant report for the data subject.
        </p>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mt-4">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-6">
        {tab === "new"     && <AccessWizard />}
        {tab === "history" && <AccessRequestsQueue />}
      </div>
    </div>
  );
}
