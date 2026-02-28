import { Handle, Position } from "reactflow";

export default function CustomNode({ data, selected }) {
  return (
    <div className={`mind-node ${selected ? "active" : ""}`} style={{ width: data?.size?.width }}>
      <Handle className="mind-handle" type="target" position={Position.Left} />
      {data.label}
      <Handle className="mind-handle" type="source" position={Position.Right} />
    </div>
  );
}
