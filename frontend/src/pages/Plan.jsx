import "../styles/Plan.css";
import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactFlow, { Background, Controls, Position } from "reactflow";
import dagre from "dagre";
import AnimatedEdge from "../components/Graph/AnimatedEdge";
import CustomNode from "../components/Graph/CustomNode";
import "reactflow/dist/style.css";

const nodeTypes = { custom: CustomNode };
const edgeTypes = { animated: AnimatedEdge };
const MAX_NODE_WIDTH = 360;
const MIN_NODE_WIDTH = 220;

function getNodeSize(label) {
  const text = String(label || "");
  const width = Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, 140 + text.length * 4));
  const charsPerLine = Math.max(18, Math.floor((width - 40) / 8));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const height = Math.min(220, 34 + lines * 22);
  return { width, height };
}

function getLayoutedElements(nodes, edges) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 72, ranksep: 120 });

  nodes.forEach((node) => {
    graph.setNode(node.id, node.data.size);
  });

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  const layoutedNodes = nodes.map((node) => {
    const pos = graph.node(node.id);
    const { width, height } = node.data.size;
    return {
      ...node,
      position: {
        x: pos.x - width / 2,
        y: pos.y - height / 2
      }
    };
  });

  return { nodes: layoutedNodes, edges };
}

function buildNode(id, label) {
  const size = getNodeSize(label);
  return {
    id,
    type: "custom",
    data: { label, size },
    position: { x: 0, y: 0 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left
  };
}

export default function Plan() {
  const location = useLocation();
  const navigate = useNavigate();
  const { plan, idea } = location.state || {};
  const safePlan = plan ?? {};
  const steps = Array.isArray(safePlan.steps) ? safePlan.steps : [];
  const summary = safePlan.summary || "";
  const title = idea || "Project Plan";

  const { nodes, edges } = useMemo(() => {
    const source = plan ?? {};
    const features = Array.isArray(source.features) ? source.features : [];
    const database = Array.isArray(source.database) ? source.database : [];
    const apis = Array.isArray(source.apis) ? source.apis : [];

    const nextNodes = [buildNode("root", title)];
    const nextEdges = [];

    const addNode = (prefix, label, index) => {
      const id = `${prefix}-${index}`;
      nextNodes.push(buildNode(id, label));
      nextEdges.push({
        id: `e-root-${id}`,
        source: "root",
        target: id,
        type: "animated"
      });
    };

    features.forEach((feature, index) => addNode("f", feature, index));
    database.forEach((item, index) => addNode("d", item, index));
    apis.forEach((api, index) => addNode("a", api, index));

    return getLayoutedElements(nextNodes, nextEdges);
  }, [plan, title]);

  if (!plan) {
    return (
      <div className="plan-page">
        <div className="plan-container">
          <h2>No plan found</h2>
          <button onClick={() => navigate("/generate")}>Generate Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="plan-page">
      <div className="plan-container">
        <div className="plan-header">
          <h1>{title}</h1>
          <p>AI generated execution blueprint</p>
        </div>

        <div className="plan-split">
          <div className="mindmap">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              minZoom={0.4}
              maxZoom={1.8}
              zoomOnScroll
              zoomOnPinch
              panOnScroll
              panOnDrag
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              fitView
              fitViewOptions={{ padding: 0.35 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>

          <div className="idea-brief">
            <h3>Problem Brief</h3>
            <p>{summary}</p>

            <h4>Execution Roadmap</h4>
            <ol>
              {steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>

            <button className="start-btn" onClick={() => navigate("/thinking", { state: { mode: "build", plan, idea } })}>
              Start Building {"\u2192"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
