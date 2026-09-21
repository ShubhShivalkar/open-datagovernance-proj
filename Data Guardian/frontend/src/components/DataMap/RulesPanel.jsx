import { Eye, EyeOff, Pencil, Trash2, Plus, GitBranch } from "lucide-react";
import { SOURCE_BADGE, CARDINALITY_OPTIONS } from "./utils";

const cardLabel = (val) => CARDINALITY_OPTIONS.find((o) => o.value === val)?.label ?? val;

const iconBtn =
  "w-6 h-6 flex items-center justify-center rounded border-0 bg-transparent cursor-pointer transition-colors";

function RuleCard({ rule, onToggle, onEdit, onDelete, onSelect, isSelected }) {
  const badge   = SOURCE_BADGE[rule.source] ?? SOURCE_BADGE.manual;
  const isAuto  = rule.is_auto ?? String(rule.id ?? "").startsWith("auto-");
  const inactive = !rule.is_active;

  return (
    <div
      onClick={() => onSelect(rule.id)}
      className={`border rounded-lg p-3 space-y-2 text-xs cursor-pointer transition-all ${
        inactive ? "opacity-50" : ""
      } ${
        isSelected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border hover:bg-muted/40"
      }`}
    >
      {/* From → To */}
      <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11px]">
        <span className="text-foreground font-semibold">{rule.from_table}</span>
        <span className="text-muted-foreground">.</span>
        <span className="text-sky-600">{rule.from_column}</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-foreground font-semibold">{rule.to_table}</span>
        <span className="text-muted-foreground">.</span>
        <span className="text-amber-600">{rule.to_column}</span>
      </div>

      {/* Badges + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`border text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.cls}`}>
            {badge.label}
          </span>
          <span className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5 rounded">
            {cardLabel(rule.cardinality)}
          </span>
          {rule.label && (
            <span className="text-muted-foreground italic truncate max-w-[100px]">"{rule.label}"</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            title={inactive ? "Enable" : "Disable"}
            onClick={(e) => { e.stopPropagation(); onToggle(rule); }}
            className={`${iconBtn} text-foreground/60 hover:text-foreground hover:bg-muted`}
          >
            {inactive ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button
            title="Edit rule"
            onClick={(e) => { e.stopPropagation(); onEdit(rule); }}
            className={`${iconBtn} text-foreground/60 hover:text-foreground hover:bg-muted`}
          >
            <Pencil size={13} />
          </button>
          {!isAuto && (
            <button
              title="Delete rule"
              onClick={(e) => { e.stopPropagation(); onDelete(rule); }}
              className={`${iconBtn} text-foreground/60 hover:text-destructive hover:bg-destructive/10`}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RulesPanel({ rules, selectedRuleId, onSelect, onToggle, onEdit, onDelete, onAdd }) {
  const active   = rules.filter((r) => r.is_active);
  const inactive = rules.filter((r) => !r.is_active);

  return (
    <div className="w-80 shrink-0 border-l border-border bg-card flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-primary" />
          <span className="font-semibold text-sm text-foreground">Relationship Rules</span>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {rules.length}
          </span>
        </div>
        <button onClick={onAdd} className="btn-primary text-xs flex items-center gap-1 py-1 px-2">
          <Plus size={11} /> Add
        </button>
      </div>

      {/* Rule list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {rules.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-12">
            No relationships detected.
            <br />
            Run catalogue generation first, or add rules manually.
          </div>
        )}

        {active.map((r) => (
          <RuleCard key={r.id} rule={r} isSelected={r.id === selectedRuleId}
            onSelect={onSelect} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
        ))}

        {inactive.length > 0 && (
          <>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide pt-2 pb-1">Hidden</p>
            {inactive.map((r) => (
              <RuleCard key={r.id} rule={r} isSelected={r.id === selectedRuleId}
                onSelect={onSelect} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </>
        )}
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-border space-y-1.5">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Source</p>
        {Object.entries(SOURCE_BADGE).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className={`border text-[10px] px-1.5 py-0.5 rounded font-medium ${v.cls}`}>{v.label}</span>
            <span className="text-[10px] text-muted-foreground">
              {k === "fk" ? "FK constraint in DB" : k === "name" ? "Column name match" : k === "ai" ? "AI-inferred from descriptions" : "Added manually"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
