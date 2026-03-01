import { Handle, Position } from "reactflow";

export default function CustomNode({ data }) {
  const label = data?.label || "";
  const size = data?.size || { width: 240, height: 72 };

  return (
    <div
      className="mind-node"
      style={{
        width: size.width,
        minHeight: size.height,
      }}
    >
      <Handle id="target-left" type="target" position={Position.Left} className="mind-handle" />
      <Handle id="target-right" type="target" position={Position.Right} className="mind-handle" />
      <Handle id="source-left" type="source" position={Position.Left} className="mind-handle" />
      <Handle id="source-right" type="source" position={Position.Right} className="mind-handle" />
      <div>{label}</div>
    </div>
  );
}
