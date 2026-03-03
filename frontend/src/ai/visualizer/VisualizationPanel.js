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

function buildOptimizationInsights({ projectState, stats, board, lastLiveRun, prediction, reviewDiagnostics }) {
  const insights = [];
  const recentResults = Array.isArray(lastLiveRun?.results) ? lastLiveRun.results : [];
  const failedRuns = recentResults.filter((item) => !item?.ok);
  const failRate = stats.liveRuns ? (stats.liveRuns - stats.livePass) / stats.liveRuns : 0;
  const reviewFailureRate = stats.reviews ? stats.wrong / stats.reviews : 0;
  const reviewPartialRate = stats.reviews ? stats.partial / stats.reviews : 0;

  if (failedRuns.length > 0) {
    const top = failedRuns[0];
    const reason = top?.error || top?.stderr || top?.statusText || "";
    insights.push({
      severity: "high",
      title: "Live execution weak point",
      evidence: `${top?.command || top?.url || "Command failure detected"}${reason ? ` | ${reason}` : ""}`,
      suggestion: "Fix this failing command first, then rerun Live Try to validate integration stability.",
    });
  }

  if (failRate >= 0.4) {
    insights.push({
      severity: "high",
      title: "Low live pass rate",
      evidence: `${stats.livePass}/${stats.liveRuns} live runs passed`,
      suggestion: "Add verification command per step and run it before moving to the next step.",
    });
  }

  if (reviewFailureRate >= 0.35) {
    insights.push({
      severity: "medium",
      title: "Review rejection risk",
      evidence: `${stats.wrong}/${stats.reviews} reviews marked wrong`,
      suggestion: "Submit step-specific proof with exact file path, command output, and expected result match.",
    });
  }

  if (reviewPartialRate >= 0.4) {
    insights.push({
      severity: "medium",
      title: "Validation quality is partial-heavy",
      evidence: `${stats.partial}/${stats.reviews} reviews are partial`,
      suggestion: "Strengthen proof completeness: code snippet + run output + why-change note for each step.",
    });
  }

  if (projectState.risk >= 70) {
    insights.push({
      severity: "high",
      title: "Project risk is elevated",
      evidence: `Risk metric ${Math.round(projectState.risk)}%`,
      suggestion: "Prioritize risky tasks in DOING with smaller, testable increments to reduce rollback impact.",
    });
  }

  if (projectState.complexity >= 70) {
    insights.push({
      severity: "medium",
      title: "Complexity trending high",
      evidence: `Complexity metric ${Math.round(projectState.complexity)}%`,
      suggestion: "Split broad tasks into atomic steps and validate each one with live commands.",
    });
  }

  if (projectState.teamLoad >= 75 && board.todo.length > 0) {
    insights.push({
      severity: "medium",
      title: "Execution load concentration",
      evidence: `${board.todo.length} tasks pending with team load ${Math.round(projectState.teamLoad)}%`,
      suggestion: "Clear one blocking TODO end-to-end before starting new parallel tasks.",
    });
  }

  if (prediction.successProbability < 55 && board.steps.length > 0) {
    insights.push({
      severity: "high",
      title: "Delivery confidence is weak",
      evidence: `Success probability ${prediction.successProbability}%`,
      suggestion: "Stabilize failing review/live signals first, then continue with feature expansion.",
    });
  }

  if (reviewDiagnostics.lowContextCount > 0) {
    insights.push({
      severity: "medium",
      title: "Step-context mismatch in reviews",
      evidence: `${reviewDiagnostics.lowContextCount} recent review(s) had weak context overlap`,
      suggestion: "Align submission with the exact step path, command, and expected result before submit.",
    });
  }

  if (reviewDiagnostics.missingLiveCount > 0) {
    insights.push({
      severity: "high",
      title: "Live verification missing",
      evidence: `${reviewDiagnostics.missingLiveCount} recent review(s) required live proof`,
      suggestion: "Run Live Try for that step and include execution output in proof.",
    });
  }

  if (reviewDiagnostics.fixSuggestions.length > 0) {
    const topFix = reviewDiagnostics.fixSuggestions[0];
    insights.push({
      severity: "medium",
      title: "Backend review fix hint",
      evidence: topFix,
      suggestion: "Apply this fix hint on current step, then resubmit proof for deterministic pass.",
    });
  }

  if (reviewDiagnostics.autoCheckFailureCount > 0) {
    insights.push({
      severity: "high",
      title: "Auto-check failures detected",
      evidence: `${reviewDiagnostics.autoCheckFailureCount} recent review event(s) include failed auto checks`,
      suggestion: "Resolve failing lint/test/build checks before marking task done.",
    });
  }

  return insights;
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
  const [recentReviews, setRecentReviews] = useState([]);

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
      setRecentReviews((prev) => [
        ...prev.slice(-9),
        {
          status,
          fix: String(event.fix || "").trim(),
          checks: event.checks || null,
          autoChecks: event.autoChecks || null,
          repo: event.repo || null,
          feedback: String(event.feedback || "").trim(),
          at: Date.now(),
        },
      ]);
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
      setRecentReviews([]);
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
  const reviewDiagnostics = useMemo(() => {
    const lowContextCount = recentReviews.filter((entry) => {
      const score = Number(entry?.checks?.context?.score || 0);
      return score > 0 && score < 3;
    }).length;
    const missingLiveCount = recentReviews.filter((entry) => {
      const requiresLive = Boolean(entry?.checks?.requiresLive);
      const hasLiveAttempt = Boolean(entry?.checks?.hasLiveAttempt);
      const livePass = Boolean(entry?.checks?.livePass);
      return requiresLive && (!hasLiveAttempt || !livePass);
    }).length;
    const fixSuggestions = recentReviews
      .map((entry) => entry.fix)
      .filter(Boolean)
      .slice(-3)
      .reverse();
    const autoCheckFailureCount = recentReviews.filter((entry) => {
      const failed = Number(entry?.autoChecks?.failed || 0);
      return failed > 0;
    }).length;

    return { lowContextCount, missingLiveCount, fixSuggestions, autoCheckFailureCount };
  }, [recentReviews]);
  const optimizationInsights = useMemo(
    () => buildOptimizationInsights({
      projectState,
      stats,
      board,
      lastLiveRun,
      prediction,
      reviewDiagnostics,
    }),
    [projectState, stats, board, lastLiveRun, prediction, reviewDiagnostics]
  );

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
          <button
            className={activeAddon === "optimize" ? "addon-tab active" : "addon-tab"}
            onClick={() => setActiveAddon("optimize")}
          >
            Optimize
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

          {activeAddon === "optimize" && (
            <div className="addon-card">
              <h4>Optimization Layer</h4>
              {optimizationInsights.length ? (
                <div className="opt-list">
                  {optimizationInsights.map((item, index) => (
                    <div key={`${item.title}-${index}`} className={`opt-item ${item.severity}`}>
                      <strong>{item.title}</strong>
                      <p>{item.evidence}</p>
                      <span>{item.suggestion}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="sla-note">No critical weak points detected from current execution evidence.</p>
              )}
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
