import { useState } from "react";
import { X, Save } from "lucide-react";
import { CARDINALITY_OPTIONS } from "./utils";

const inputCls = "w-full px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";
const selectCls = inputCls;

export default function EditRuleModal({ rule, tables, onSave, onClose, isSaving }) {
  const isEdit = !!rule?.id && !String(rule.id).startsWith("auto-");

  const allTableNames = tables.map((t) => t.table_name).sort();

  const [fromTable,   setFromTable]   = useState(rule?.from_table  ?? "");
  const [fromColumn,  setFromColumn]  = useState(rule?.from_column ?? "");
  const [toTable,     setToTable]     = useState(rule?.to_table    ?? "");
  const [toColumn,    setToColumn]    = useState(rule?.to_column   ?? "");
  const [cardinality, setCardinality] = useState(rule?.cardinality ?? "many-to-one");
  const [label,       setLabel]       = useState(rule?.label       ?? "");

  // Derive column lists from selected tables
  const fromTableData = tables.find((t) => t.table_name === fromTable);
  const toTableData   = tables.find((t) => t.table_name === toTable);
  const fromCols = fromTableData?.all_columns ?? [];
  const toCols   = toTableData?.all_columns   ?? [];

  // Clear the column only when the user explicitly changes the table — never on mount.
  function handleFromTableChange(newTable) {
    setFromTable(newTable);
    setFromColumn("");
  }
  function handleToTableChange(newTable) {
    setToTable(newTable);
    setToColumn("");
  }

  const canSave = fromTable && fromColumn && toTable && toColumn && fromTable !== toTable;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-sm text-foreground">
            {isEdit ? "Edit Relationship Rule" : "Add Relationship Rule"}
          </h3>
          <button onClick={onClose} className="btn-ghost w-7 h-7 p-0 flex items-center justify-center">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* From */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From Table (FK side)</label>
              <select value={fromTable} onChange={(e) => handleFromTableChange(e.target.value)} className={selectCls}>
                <option value="">Select table…</option>
                {allTableNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From Column</label>
              <select value={fromColumn} onChange={(e) => setFromColumn(e.target.value)} className={selectCls} disabled={!fromTable}>
                <option value="">Select column…</option>
                {fromCols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* To */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To Table (PK side)</label>
              <select value={toTable} onChange={(e) => handleToTableChange(e.target.value)} className={selectCls}>
                <option value="">Select table…</option>
                {allTableNames.filter((n) => n !== fromTable).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To Column</label>
              <select value={toColumn} onChange={(e) => setToColumn(e.target.value)} className={selectCls} disabled={!toTable}>
                <option value="">Select column…</option>
                {toCols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Cardinality */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cardinality</label>
            <select value={cardinality} onChange={(e) => setCardinality(e.target.value)} className={selectCls}>
              {CARDINALITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Label */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Label (optional)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. belongs to customer"
              className={inputCls}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline text-xs">Cancel</button>
          <button
            disabled={!canSave || isSaving}
            onClick={() => onSave({ from_table: fromTable, from_column: fromColumn, to_table: toTable, to_column: toColumn, cardinality, label })}
            className="btn-primary text-xs flex items-center gap-1.5"
          >
            <Save size={12} />
            {isSaving ? "Saving…" : "Save Rule"}
          </button>
        </div>
      </div>
    </div>
  );
}
