import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle, LayoutDashboard } from "lucide-react";

import { relationshipsApi } from "../../api/client";
import TableNode from "./TableNode";
import RelationshipEdge from "./RelationshipEdge";
import RulesPanel from "./RulesPanel";
import EditRuleModal from "./EditRuleModal";
import { buildGraph, applyDagreLayout } from "./utils";

const nodeTypes = { tableNode: TableNode };
const edgeTypes = { relationshipEdge: RelationshipEdge };

export default function DataMap({ datasourceId }) {
  const qc = useQueryClient();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [editingRule,    setEditingRule]    = useState(null);
  const [isAdding,       setIsAdding]       = useState(false);
  const [direction,      setDirection]      = useState("LR");
  const [selectedRuleId, setSelectedRuleId] = useState(null);

  // Fetch relationship data
  const { data, isLoading, isError } = useQuery({
    queryKey: ["relationships", datasourceId],
    queryFn: () => relationshipsApi.get(datasourceId),
    enabled: !!datasourceId,
  });

  const tables = data?.tables ?? [];
  const rules  = data?.rules  ?? [];

  // Build + layout graph whenever data or direction changes
  useEffect(() => {
    if (!tables.length) return;
    const { nodes: rawNodes, edges: rawEdges } = buildGraph(tables, rules);
    const { nodes: laid, edges: laidEdges } = applyDagreLayout(rawNodes, rawEdges, direction);
    setNodes(laid);
    setEdges(laidEdges);
    setSelectedRuleId(null);
  }, [data, direction]);

  // Sync selectedRuleId → edge highlight without rebuilding layout
  useEffect(() => {
    setEdges((eds) =>
      eds.map((e) => ({ ...e, selected: String(e.id) === String(selectedRuleId) }))
    );
  }, [selectedRuleId]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["relationships", datasourceId] });

  // Toggle is_active on an auto rule → persist it; toggle manual rule → patch
  const toggleMut = useMutation({
    mutationFn: async (rule) => {
      const isAutoId = String(rule.id ?? "").startsWith("auto-");
      if (isAutoId) {
        // Persist the auto rule with is_active flipped
        return relationshipsApi.createRule(datasourceId, {
          from_table: rule.from_table, from_column: rule.from_column,
          to_table: rule.to_table,   to_column: rule.to_column,
          cardinality: rule.cardinality, label: rule.label ?? "",
          is_active: !rule.is_active,
        });
      }
      return relationshipsApi.updateRule(datasourceId, rule.id, { is_active: !rule.is_active });
    },
    onSuccess: invalidate,
  });

  const saveMut = useMutation({
    mutationFn: (payload) => {
      if (editingRule && !String(editingRule.id ?? "").startsWith("auto-")) {
        return relationshipsApi.updateRule(datasourceId, editingRule.id, payload);
      }
      return relationshipsApi.createRule(datasourceId, payload);
    },
    onSuccess: () => { invalidate(); setEditingRule(null); setIsAdding(false); },
  });

  const deleteMut = useMutation({
    mutationFn: (rule) => relationshipsApi.deleteRule(datasourceId, rule.id),
    onSuccess: invalidate,
  });

  const handleEdit      = useCallback((rule) => { setEditingRule(rule); setIsAdding(false); }, []);
  const handleAdd       = useCallback(() => { setEditingRule(null); setIsAdding(true); }, []);
  const handleClose     = useCallback(() => { setEditingRule(null); setIsAdding(false); }, []);
  const handleRuleSelect = useCallback((ruleId) => {
    setSelectedRuleId((prev) => (prev === ruleId ? null : ruleId));
  }, []);
  const handleEdgeClick = useCallback((_, edge) => {
    if (edge.data) { setSelectedRuleId(edge.id); handleEdit(edge.data); }
  }, [handleEdit]);
  const handlePaneClick = useCallback(() => setSelectedRuleId(null), []);

  if (!datasourceId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Select a data source to view its relationship map.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm">
        <Loader2 size={16} className="animate-spin" /> Loading relationships…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-destructive text-sm">
        <AlertCircle size={16} /> Failed to load relationship data.
      </div>
    );
  }

  if (!tables.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3">
        <LayoutDashboard size={32} className="text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No catalogue data yet.</p>
        <p className="text-xs text-muted-foreground">Run catalogue generation first to populate the Data Map.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Canvas */}
      <div className="flex-1 relative">
        {/* Layout toggle */}
        <div className="absolute top-3 left-3 z-10 flex gap-1 bg-card border border-border rounded-lg p-1 shadow-sm">
          {[["LR", "Left → Right"], ["TB", "Top → Bottom"]].map(([d, label]) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${
                direction === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          fitView
          minZoom={0.2}
          maxZoom={2}
        >
          <Background color="#e5e7eb" gap={20} />
          <Controls />
          <MiniMap nodeColor="#6366f1" maskColor="rgba(255,255,255,0.85)" />
        </ReactFlow>
      </div>

      {/* Rules panel */}
      <RulesPanel
        rules={rules}
        selectedRuleId={selectedRuleId}
        onSelect={handleRuleSelect}
        onToggle={(rule) => toggleMut.mutate(rule)}
        onEdit={handleEdit}
        onDelete={(rule) => deleteMut.mutate(rule)}
        onAdd={handleAdd}
      />

      {/* Edit / Add modal */}
      {(editingRule !== null || isAdding) && (
        <EditRuleModal
          rule={editingRule}
          tables={tables}
          onSave={(payload) => saveMut.mutate(payload)}
          onClose={handleClose}
          isSaving={saveMut.isPending}
        />
      )}
    </div>
  );
}
