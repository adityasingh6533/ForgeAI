import "../styles/Plan.css";
import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactFlow, { Background, Controls, Position } from "reactflow";
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

function estimateSectionHeight(itemsCount) {
  return 76 + itemsCount * 92;
}

function buildDistributedGraph(title, sections) {
  const nodes = [buildNode("root", title)];
  const edges = [];
  nodes[0].position = {
    x: -nodes[0].data.size.width / 2,
    y: -nodes[0].data.size.height / 2
  };

  const sideTotals = { left: 0, right: 0 };
  const planned = sections.map((section) => {
    const side = sideTotals.left <= sideTotals.right ? "left" : "right";
    const sectionHeight = estimateSectionHeight(section.items.length);
    sideTotals[side] += sectionHeight;
    return { ...section, side, sectionHeight };
  });

  const cursor = {
    left: -(sideTotals.left / 2),
    right: -(sideTotals.right / 2)
  };

  planned.forEach((section) => {
    const lane = section.side;
    const sectionY = cursor[lane] + section.sectionHeight / 2;
    cursor[lane] += section.sectionHeight;

    const categoryId = `cat-${section.key}`;
    const categoryX = lane === "left" ? -280 : 280;
    const childX = lane === "left" ? -620 : 620;
    const itemCount = section.items.length;
    const branchSpan = Math.max(0, (itemCount - 1) * 88);
    const branchStart = sectionY - branchSpan / 2;

    const categoryNode = buildNode(categoryId, section.label);
    categoryNode.position = {
      x: categoryX - categoryNode.data.size.width / 2,
      y: sectionY - categoryNode.data.size.height / 2
    };

    nodes.push(categoryNode);
    edges.push({
      id: `e-root-${categoryId}`,
      source: "root",
      sourceHandle: lane === "left" ? "source-left" : "source-right",
      target: categoryId,
      targetHandle: lane === "left" ? "target-right" : "target-left",
      type: "animated"
    });

    section.items.forEach((item, index) => {
      const itemId = `${section.key}-${index}`;
      const itemY = branchStart + index * 88;
      const itemNode = buildNode(itemId, item);
      itemNode.position = {
        x: childX - itemNode.data.size.width / 2,
        y: itemY - itemNode.data.size.height / 2
      };
      nodes.push(itemNode);

      edges.push({
        id: `e-${categoryId}-${itemId}`,
        source: categoryId,
        sourceHandle: lane === "left" ? "source-left" : "source-right",
        target: itemId,
        targetHandle: lane === "left" ? "target-right" : "target-left",
        type: "animated"
      });
    });
  });

  return { nodes, edges };
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
    const sections = [
      { key: "features", label: "Core Features", items: features },
      { key: "database", label: "Data Layer", items: database },
      { key: "apis", label: "API Surface", items: apis }
    ].filter((section) => section.items.length > 0);

    if (!sections.length) {
      return {
        nodes: [buildNode("root", title)],
        edges: []
      };
    }

    const graph = buildDistributedGraph(title, sections);
    return { nodes: graph.nodes, edges: graph.edges };
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
          <h1>Execution Blueprint</h1>
          <div className="plan-title-card">
            <p>{title}</p>
          </div>
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
