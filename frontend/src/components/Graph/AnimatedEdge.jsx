import { BaseEdge, getBezierPath } from "reactflow";

export default function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd
}) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{
        stroke: "#4f9cff",
        strokeWidth: 2,
        filter: "drop-shadow(0 0 6px #4f9cff)"
      }}/>

      <path
        d={edgePath}
        fill="none"
        stroke="#00f0ff"
        strokeWidth={3}
        strokeDasharray="6 6"
        style={{
          animation: "flow 2s linear infinite"
        }}
      />
    </>
  );
}