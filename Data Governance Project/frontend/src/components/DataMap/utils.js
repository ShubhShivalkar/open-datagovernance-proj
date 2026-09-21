import dagre from "@dagrejs/dagre";

const NODE_WIDTH  = 240;
const NODE_HEIGHT = 180; // approximate; dagre just needs a baseline

/** Convert API response → ReactFlow nodes + edges */
export function buildGraph(tables, rules) {
  const nodes = tables.map((t) => ({
    id: t.table_name,
    type: "tableNode",
    data: t,
    position: { x: 0, y: 0 }, // overwritten by layout
  }));

  const edges = rules
    .filter((r) => r.is_active)
    .map((r) => ({
      id: r.id ?? `${r.from_table}-${r.from_column}-${r.to_table}`,
      source: r.from_table,
      target: r.to_table,
      type: "relationshipEdge",
      data: r,
      label: r.label || `${r.from_column} → ${r.to_column}`,
    }));

  return { nodes, edges };
}

/** Apply dagre left-to-right layout to nodes/edges in place. Returns new arrays. */
export function applyDagreLayout(nodes, edges, direction = "LR") {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 100 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  const laidOutNodes = nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: laidOutNodes, edges };
}

/** Cardinality display labels */
export const CARDINALITY_OPTIONS = [
  { value: "many-to-one",  label: "Many to One  (N:1)" },
  { value: "one-to-many",  label: "One to Many  (1:N)" },
  { value: "one-to-one",   label: "One to One   (1:1)" },
  { value: "many-to-many", label: "Many to Many (N:N)" },
];

export const SOURCE_BADGE = {
  fk:     { label: "FK",     cls: "bg-sky-50 text-sky-700 border-sky-200" },
  name:   { label: "Name",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
  ai:     { label: "AI",     cls: "bg-violet-50 text-violet-700 border-violet-200" },
  manual: { label: "Manual", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};
