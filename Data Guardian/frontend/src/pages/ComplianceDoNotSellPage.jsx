import { Ban, Wrench } from "lucide-react";

export default function ComplianceDoNotSellPage() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Ban size={16} className="text-orange-600" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Do Not Sell</h1>
        </div>
        <p className="text-sm text-muted-foreground pl-11">
          Manage opt-out requests under CCPA / US state privacy laws restricting the sale
          or sharing of personal data with third parties.
        </p>
      </div>

      {/* Under construction */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
          <Ban size={32} className="text-orange-600" />
        </div>
        <div>
          <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1 rounded-full text-xs font-medium mb-3">
            <Wrench size={11} />
            Coming Soon
          </div>
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
            Track and honour opt-out requests from data subjects who do not want their personal
            data sold or shared with third parties. Includes automated suppression lists and
            third-party notification workflows.
          </p>
        </div>
      </div>
    </div>
  );
}
