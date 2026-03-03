import { useState, useCallback, useMemo } from "react";
import { useBrain } from "../../BrainProvider";
import KanbanView from "./KanbanView";
import TimelineView from "./TimelineView";
import ArchitectureView from "./ArchitectureView";
import "./visualization.css";
import {
  initialProjectState,
  createProjectStateFromBoard,
  applyReviewResult,
  applyLiveTryResult,
  predictProjectOutcome,
} from "./projectState";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function buildSparklinePoints(series, width = 320, height = 120) {
  if (!series.length) return "";
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const range = Math.max(max - min, 1);
  return series
    .map((value, index) => {
      const x = (index / Math.max(series.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
}

function buildRunDependency(results = [], task = "") {
  const safeResults = Array.isArray(results) ? results : [];
  const nodes = [{ id: "task", label: task || "Active Task", x: 24, y: 72, health: 100 }];
  const edges = [];

  safeResults.forEach((result, index) => {
    const commandText = String(result?.command || result?.url || "execution").trim();
    const short = commandText.length > 28 ? `${commandText.slice(0, 28)}...` : commandText;
    const nodeId = `run-${index}`;
    nodes.push({
      id: nodeId,
      label: short || `step-${index + 1}`,
      x: 174 + index * 140,
      y: 72,
      health: result?.ok ? 100 : 25,
    });

    const prevId = index === 0 ? "task" : `run-${index - 1}`;
    const prevNode = nodes.find((node) => node.id === prevId);
    const currNode = nodes.find((node) => node.id === nodeId);
    edges.push({
      id: `${prevId}-${nodeId}`,
      x1: prevNode.x + 54,
      y1: prevNode.y + 18,
      x2: currNode.x + 2,
      y2: currNode.y + 18,
      strength: currNode.health,
    });
  });

  return { nodes, edges };
}

export default function VisualizationPanel() {
  const [projectState, setProjectState] = useState(initialProjectState);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [activeView, setActiveView] = useState("empty");
  const [activeAddon, setActiveAddon] = useState("spike");
  const [history, setHistory] = useState([]);
  const [lastLiveRun, setLastLiveRun] = useState({ task: "", results: [] });
  const [stats, setStats] = useState({
    reviews: 0,
    correct: 0,
    partial: 0,
    wrong: 0,
    liveRuns: 0,
    livePass: 0,
  });
  const [board, setBoard] = useState({
    steps: [],
    todo: [],
    doing: null,
    done: [],
  });

  const pushHistory = useCallback((eventType, nextState, quality) => {
    const predicted = predictProjectOutcome(nextState);
    setHistory((prev) => [
      ...prev.slice(-24),
      {
        at: Date.now(),
        eventType,
        score: predicted.score,
        risk: nextState.risk,
        quality: clamp(Math.round(Number(quality ?? predicted.score)), 0, 100),
      },
    ]);
  }, []);

  const handleBrainEvent = useCallback((event) => {
    if (!event) return;

    if (event.type === "BOARD_SYNC") {
      const nextBoard = {
        steps: Array.isArray(event.steps) ? event.steps : [],
        todo: Array.isArray(event.todo) ? event.todo : [],
        doing: event.doing || null,
        done: Array.isArray(event.done) ? event.done : [],
      };
      setBoard(nextBoard);
      setProjectState((prev) => {
        const merged = { ...prev, ...createProjectStateFromBoard(nextBoard) };
        return merged;
      });
      if (activeView === "empty" && nextBoard.steps.length) {
        setActiveView("kanban");
      }
    }

    if (event.type === "TASK_STARTED") {
      setSelectedSuggestion(event.task || null);
      setActiveView("kanban");
    }

    if (event.type === "REVIEW_RESULT") {
      const status = String(event.status || "").toLowerCase();
      setStats((prev) => ({
        ...prev,
        reviews: prev.reviews + 1,
        correct: prev.correct + (status === "correct" ? 1 : 0),
        partial: prev.partial + (status === "partial" ? 1 : 0),
        wrong: prev.wrong + (status === "wrong" ? 1 : 0),
      }));
      setProjectState((prev) => {
        const next = applyReviewResult(prev, event);
        const quality = status === "correct" ? 100 : status === "partial" ? 60 : 20;
        pushHistory("review", next, quality);
        return next;
      });
    }

    if (event.type === "LIVE_TRY_RESULT") {
      setStats((prev) => ({
        ...prev,
        liveRuns: prev.liveRuns + 1,
        livePass: prev.livePass + (event.ok ? 1 : 0),
      }));
      setLastLiveRun({
        task: event.task || "",
        results: Array.isArray(event.results) ? event.results : [],
      });
      setActiveView("architecture");
      setProjectState((prev) => {
        const next = applyLiveTryResult(prev, event);
        pushHistory("live_try", next, event.ok ? 100 : 0);
        return next;
      });
    }

    if (event.type === "TASK_COMPLETED") {
      setActiveView("timeline");
    }

    if (event.type === "TASK_RESET") {
      setProjectState(initialProjectState);
      setSelectedSuggestion(null);
      setActiveView("empty");
      setHistory([]);
      setLastLiveRun({ task: "", results: [] });
      setBoard({ steps: [], todo: [], doing: null, done: [] });
      setStats({
        reviews: 0,
        correct: 0,
        partial: 0,
        wrong: 0,
        liveRuns: 0,
        livePass: 0,
      });
    }
  }, [activeView, pushHistory]);

  useBrain(handleBrainEvent);

  const prediction = predictProjectOutcome(projectState);
  const hasBoardData = board.steps.length > 0;
  const hasEvaluationData = stats.reviews > 0 || stats.liveRuns > 0;
  const baselineBoardState = useMemo(() => createProjectStateFromBoard(board), [board]);
  const spikePoints = buildSparklinePoints(history.map((entry) => entry.score));
  const qualityPoints = buildSparklinePoints(history.map((entry) => entry.quality));
  const dependency = useMemo(
    () => buildRunDependency(lastLiveRun.results, lastLiveRun.task),
    [lastLiveRun.results, lastLiveRun.task]
  );
  const livePassRate = stats.liveRuns ? Math.round((stats.livePass / stats.liveRuns) * 100) : 0;

  const renderView = () => {
    if (activeView === "kanban") {
      return <KanbanView todo={board.todo} doing={board.doing} done={board.done} />;
    }
    if (activeView === "timeline") {
      return <TimelineView steps={board.steps} done={board.done} doing={board.doing} />;
    }
    if (activeView === "architecture") {
      return <ArchitectureView task={lastLiveRun.task || board.doing || ""} results={lastLiveRun.results} />;
    }
    return <div className="visual-panel empty">Waiting for user action...</div>;
  };

  return (
    <div className="visual-wrapper">
      <div className="visual-area">{renderView()}</div>

      <div className="health-panel">
        <div className="health-header">
          <h3>Real Execution Outcome</h3>
          <button
            className="reset-btn"
            onClick={() => handleBrainEvent({ type: "TASK_RESET" })}
          >
            Reset
          </button>
        </div>

        <div className="prediction-card">
          {hasBoardData ? (
            <>
              <strong>{prediction.direction}</strong>
              <span>Confidence Score: {hasEvaluationData ? `${prediction.score}%` : "Pending evaluation"}</span>
              <p>{prediction.summary}</p>
              <p>Success Probability: {hasEvaluationData ? `${prediction.successProbability}%` : "Pending evaluation"}</p>
              <p>Maturity: {prediction.maturity}</p>
              <p>Est Delivery: {prediction.estimatedDelivery} days</p>
            </>
          ) : (
            <>
              <strong>Waiting for project board data</strong>
              <span>Confidence Score: N/A</span>
              <p>Start a task to initialize real execution metrics.</p>
              <p>Success Probability: N/A</p>
              <p>Maturity: Not Started</p>
              <p>Est Delivery: N/A</p>
            </>
          )}
        </div>

        {selectedSuggestion && (
          <div className="current-suggestion">
            Active Task: <strong>{selectedSuggestion}</strong>
          </div>
        )}

        <div className="comparison-banner">
          Delivery Reduced By:
          <strong>{hasBoardData ? ` ${Math.max(0, baselineBoardState.deliveryTime - projectState.deliveryTime)} days` : " N/A"}</strong>
        </div>

        <div className="addon-tabs">
          <button
            className={activeAddon === "spike" ? "addon-tab active" : "addon-tab"}
            onClick={() => setActiveAddon("spike")}
          >
            Spike
          </button>
          <button
            className={activeAddon === "deps" ? "addon-tab active" : "addon-tab"}
            onClick={() => setActiveAddon("deps")}
          >
            Dependencies
          </button>
          <button
            className={activeAddon === "sla" ? "addon-tab active" : "addon-tab"}
            onClick={() => setActiveAddon("sla")}
          >
            Trend
          </button>
        </div>

        <div className="addon-stage">
          {activeAddon === "spike" && (
            <div className="addon-card">
              <h4>Metric Spike Graph</h4>
              <svg viewBox="0 0 320 120" className="spark-svg" role="img" aria-label="Metric spike chart">
                <polyline points="0,118 320,118" className="spark-base" />
                <polyline points={spikePoints || "0,118 320,118"} className="spark-line score" />
                <polyline points={qualityPoints || "0,118 320,118"} className="spark-line risk" />
              </svg>
              <div className="addon-legend">
                <span className="legend score">Execution score</span>
                <span className="legend risk">Validation quality</span>
              </div>
            </div>
          )}

          {activeAddon === "deps" && (
            <div className="addon-card">
              <h4>Execution Dependency Graph</h4>
              <div className="dependency-graph">
                <div className="dependency-canvas">
                  <svg
                    viewBox={`0 0 ${Math.max(660, dependency.nodes.length * 150)} 188`}
                    className="dependency-lines"
                  >
                    {dependency.edges.map((edge) => (
                      <line
                        key={edge.id}
                        x1={edge.x1}
                        y1={edge.y1}
                        x2={edge.x2}
                        y2={edge.y2}
                        className={edge.strength >= 60 ? "dep-strong" : "dep-weak"}
                      />
                    ))}
                  </svg>
                  {dependency.nodes.map((service) => (
                    <div
                      key={service.id}
                      className={`service-node ${service.health >= 60 ? "healthy" : "fragile"}`}
                      style={{ left: service.x, top: service.y }}
                    >
                      <strong>{service.label}</strong>
                      <span>{service.health}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeAddon === "sla" && (
            <div className="addon-card">
              <h4>Observed Trend</h4>
              <svg viewBox="0 0 320 120" className="spark-svg" role="img" aria-label="Observed execution trend">
                <polyline points="0,118 320,118" className="spark-base" />
                <polyline points={spikePoints || "0,118 320,118"} className="spark-line breach" />
                <polyline points={qualityPoints || "0,118 320,118"} className="spark-line fix" />
              </svg>
              <div className="addon-legend">
                <span className="legend breach">Outcome score</span>
                <span className="legend fix">Validation quality</span>
              </div>
              <p className="sla-note">
                Events tracked: {history.length} | Reviews: {stats.reviews} | Live runs: {stats.liveRuns}
              </p>
            </div>
          )}
        </div>

        <div className="metric">
          <span className="metric-name">reviewAccuracy</span>
          <div className="metric-bar">
            <div
              className="metric-fill"
              style={{
                width: `${stats.reviews ? Math.round(((stats.correct + stats.partial * 0.5) / stats.reviews) * 100) : 0}%`,
              }}
            />
          </div>
          <span className="metric-value">
            {stats.reviews ? `${Math.round(((stats.correct + stats.partial * 0.5) / stats.reviews) * 100)}%` : "N/A"}
          </span>
        </div>

        <div className="metric">
          <span className="metric-name">liveTryPassRate</span>
          <div className="metric-bar">
            <div className="metric-fill" style={{ width: `${livePassRate}%` }} />
          </div>
          <span className="metric-value">{stats.liveRuns ? `${livePassRate}%` : "N/A"}</span>
        </div>

        {Object.entries(projectState).map(([key, value]) => {
          const isDelivery = key === "deliveryTime";
          const barWidth = isDelivery ? Math.min(100, value) : value;
          return (
            <div key={key} className="metric">
              <span className="metric-name">{key}</span>
              <div className="metric-bar">
                <div className="metric-fill" style={{ width: `${barWidth}%` }} />
              </div>
              <span className="metric-value">{isDelivery ? `${Math.round(value)} days` : `${Math.round(value)}%`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
