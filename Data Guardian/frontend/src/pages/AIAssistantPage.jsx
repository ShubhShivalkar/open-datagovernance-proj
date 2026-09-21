import { Bot, Sparkles } from "lucide-react";

export default function AIAssistantPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
        <Bot size={32} className="text-primary" />
      </div>
      <h1 className="text-xl font-semibold text-foreground mb-2">AI Assistant</h1>
      <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1 rounded-full text-xs font-medium mb-4">
        <Sparkles size={11} />
        Coming Soon
      </div>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
        Ask questions about your data in plain English. The AI assistant will help you explore your
        catalogue, understand table relationships, and surface insights — all without writing SQL.
      </p>
    </div>
  );
}
