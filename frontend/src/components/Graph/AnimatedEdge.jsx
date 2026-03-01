import { BaseEdge, getBezierPath } from "reactflow";

export default function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: "#60a5fa",
        strokeWidth: 2,
        strokeDasharray: "8 8",
        animation: "flow 1.4s linear infinite",
      }}
    />
  );
}
