import { BaseEdge, EdgeLabelRenderer, getStraightPath, getBezierPath } from "@xyflow/react";

const EDGE_COLOR = {
  fk:     "#3b82f6",  // blue
  name:   "#f59e0b",  // amber
  manual: "#10b981",  // emerald
};

/** Inline SVG crow's-foot marker rendered via foreignObject-free approach using SVG paths */
function CrowsFoot({ x, y, angle, strokeWidth = 1.5 }) {
  const r = (Math.PI / 180) * angle;
  const cos = Math.cos(r);
  const sin = Math.sin(r);

  const tip    = [x, y];
  const len    = 14;
  const spread = 8;
  const base   = [x + cos * len, y + sin * len];
  const top    = [x + cos * len - sin * spread, y + sin * len + cos * spread];
  const bot    = [x + cos * len + sin * spread, y + sin * len - cos * spread];

  return (
    <g>
      <line x1={tip[0]} y1={tip[1]} x2={base[0]} y2={base[1]} stroke="currentColor" strokeWidth={strokeWidth} />
      <line x1={tip[0]} y1={tip[1]} x2={top[0]}  y2={top[1]}  stroke="currentColor" strokeWidth={strokeWidth} />
      <line x1={tip[0]} y1={tip[1]} x2={bot[0]}  y2={bot[1]}  stroke="currentColor" strokeWidth={strokeWidth} />
    </g>
  );
}

function SingleBar({ x, y, angle, strokeWidth = 1.5 }) {
  const r = (Math.PI / 180) * (angle + 90);
  const len = 8;
  const ox = Math.cos(r) * len;
  const oy = Math.sin(r) * len;
  return (
    <line
      x1={x - ox} y1={y - oy}
      x2={x + ox} y2={y + oy}
      stroke="currentColor" strokeWidth={strokeWidth}
    />
  );
}

export default function RelationshipEdge({
  id, sourceX, sourceY, targetX, targetY, data, label, selected,
}) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY });

  const color   = EDGE_COLOR[data?.source] ?? EDGE_COLOR.fk;
  const card    = data?.cardinality ?? "many-to-one";
  const width   = selected ? 2.5 : 1.5;

  // Angles: edge exits right (source) and arrives left (target)
  const srcAngle = 180; // points left from source node (outgoing)
  const tgtAngle = 0;   // points right toward target node (incoming)

  // Determine which symbol goes on each end
  const srcIsMany = card === "many-to-one" || card === "many-to-many";
  const tgtIsMany = card === "one-to-many" || card === "many-to-many";

  return (
    <>
      <BaseEdge id={id} path={edgePath} interactionWidth={16} style={{ stroke: color, strokeWidth: width, cursor: "pointer", opacity: selected ? 1 : 0.75 }} />

      {/* Source-end symbol */}
      <g color={color} style={{ cursor: "pointer", opacity: selected ? 1 : 0.75 }}>
        {srcIsMany
          ? <CrowsFoot  x={sourceX} y={sourceY} angle={srcAngle} strokeWidth={width} />
          : <SingleBar  x={sourceX} y={sourceY} angle={srcAngle} strokeWidth={width} />}
      </g>

      {/* Target-end symbol */}
      <g color={color} style={{ cursor: "pointer", opacity: selected ? 1 : 0.75 }}>
        {tgtIsMany
          ? <CrowsFoot  x={targetX} y={targetY} angle={tgtAngle} strokeWidth={width} />
          : <SingleBar  x={targetX} y={targetY} angle={tgtAngle} strokeWidth={width} />}
      </g>

      {/* Edge label */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
        >
          <span
            className="text-[10px] bg-card border border-border rounded px-1.5 py-0.5 text-muted-foreground shadow-sm whitespace-nowrap"
          >
            {label}
          </span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
