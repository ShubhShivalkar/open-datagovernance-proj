import { Handle, Position } from "@xyflow/react";
import { Key, Link, Table2 } from "lucide-react";

export default function TableNode({ data }) {
  const pkCols  = data.pk_columns ?? [];
  const fkCols  = (data.fk_columns ?? []).map((f) => f.column);
  const allCols = data.all_columns ?? [];

  // Show PK + FK first, then up to 4 others
  const specialSet = new Set([...pkCols, ...fkCols]);
  const otherCols  = allCols.filter((c) => !specialSet.has(c)).slice(0, 4);
  const hiddenCount = allCols.length - pkCols.length - fkCols.length - otherCols.length;

  return (
    <div className="bg-card border border-border rounded-xl shadow-md w-60 overflow-hidden text-xs select-none">
      {/* Header */}
      <div className="bg-primary/10 border-b border-border px-3 py-2 flex items-center gap-2">
        <Table2 size={13} className="text-primary shrink-0" />
        <div className="min-w-0">
          <p className="font-bold text-foreground truncate">{data.table_name}</p>
          {data.schema_name && (
            <p className="text-muted-foreground text-[10px] truncate">{data.schema_name}</p>
          )}
        </div>
      </div>

      {/* Columns */}
      <div className="px-3 py-2 space-y-1">
        {pkCols.map((col) => (
          <div key={col} className="flex items-center gap-1.5">
            <Key size={10} className="text-amber-500 shrink-0" />
            <span className="text-foreground font-medium truncate">{col}</span>
          </div>
        ))}
        {fkCols.map((col) => (
          <div key={col} className="flex items-center gap-1.5">
            <Link size={10} className="text-sky-500 shrink-0" />
            <span className="text-foreground truncate">{col}</span>
          </div>
        ))}
        {otherCols.map((col) => (
          <div key={col} className="flex items-center gap-1.5">
            <span className="w-2.5 h-px bg-muted-foreground/30 shrink-0 inline-block" />
            <span className="text-muted-foreground truncate">{col}</span>
          </div>
        ))}
        {hiddenCount > 0 && (
          <p className="text-muted-foreground/60 text-[10px] pl-4">+{hiddenCount} more…</p>
        )}
      </div>

      {/* Footer */}
      {data.row_count_estimate != null && (
        <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          ~{data.row_count_estimate.toLocaleString()} rows
        </div>
      )}

      <Handle type="target" position={Position.Left}  className="!w-2 !h-2 !bg-primary/60" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-primary/60" />
    </div>
  );
}
