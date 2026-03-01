import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useBrain } from "../../BrainProvider";
import KanbanView from "./KanbanView";
import TimelineView from "./TimelineView";
import ArchitectureView from "./ArchitectureView";
import "./visualization.css";
import {
  ACTIONS,
  applyImpact,
  initialProjectState,
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

function buildSlaProjection(state, proofEvents) {
  const points = Array.from({ length: 10 }, (_, index) => {
    const week = index + 1;
    const base =
      16 +
      state.risk * 0.62 +
      state.complexity * 0.22 +
      state.teamLoad * 0.16 -
      state.speed * 0.28;

    const noFix = clamp(base + week * 1.8, 6, 95);
    const improvement = proofEvents * 4.2 + state.clarity * 0.08 + state.speed * 0.06;
    const withFix = clamp(noFix - improvement - week * 1.2, 2, 90);

    return {
      week,
      noFix: Math.round(noFix),
      withFix: Math.round(withFix),
    };
  });

  return points;
}

function getServiceDependency(state) {
  const services = [
    { id: "ui", label: "Client UI", x: 56, y: 86, health: state.clarity },
    { id: "api", label: "API Gateway", x: 220, y: 40, health: state.speed },
    { id: "auth", label: "Auth", x: 220, y: 132, health: 100 - state.risk },
    { id: "queue", label: "Event Queue", x: 390, y: 40, health: state.scalability },
    { id: "db", label: "Data Store", x: 390, y: 132, health: 100 - state.complexity },
    { id: "obs", label: "Observability", x: 548, y: 86, health: 100 - state.teamLoad },
  ];

  const links = [
    ["ui", "api"],
    ["ui", "auth"],
    ["api", "queue"],
    ["api", "db"],
    ["queue", "obs"],
    ["db", "obs"],
    ["auth", "db"],
  ];

  const getNode = (id) => services.find((s) => s.id === id);
  const edges = links.map(([from, to]) => {
    const a = getNode(from);
    const b = getNode(to);
    const strength = clamp(Math.round((a.health + b.health) / 2), 0, 100);
    return {
      id: `${from}-${to}`,
      x1: a.x + 54,
      y1: a.y + 18,
      x2: b.x + 54,
      y2: b.y + 18,
      strength,
    };
  });

  return { services, edges };
}

export default function VisualizationPanel() {
  const [projectState, setProjectState] = useState(initialProjectState);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [simulate, setSimulate] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [day, setDay] = useState(0);
  const [activeView, setActiveView] = useState("empty");
  const [proofEvents, setProofEvents] = useState(0);
  const [history, setHistory] = useState([]);
  const [activeAddon, setActiveAddon] = useState("spike");
  const intervalRef = useRef(null);

  const hasProofDrivenState = proofEvents > 0;

  const handleBrainEvent = useCallback((event) => {
    if (!event) return;

    if (event.type === "TASK_STARTED") {
      setSelectedSuggestion(event.task || event.payload?.task || null);
      setActiveView("kanban");
    }

    if (event.type === "STEP_VALIDATED") {
      setProofEvents((prev) => prev + 1);
      setSimulate(true);
      setActiveView("architecture");
      setProjectState((prev) => applyImpact(prev, ACTIONS.OPTIMIZE));
    }

    if (event.type === "TASK_COMPLETED") {
      setProofEvents((prev) => prev + 1);
      setSimulate(true);
      setActiveView("timeline");
      setProjectState((prev) => applyImpact(prev, ACTIONS.ADD_TIMELINE));
    }

    if (event.type === "TASK_RESET") {
      clearInterval(intervalRef.current);
      setProjectState(initialProjectState);
      setDay(0);
      setIsSimulating(false);
      setActiveView("empty");
      setSelectedSuggestion(null);
      setSimulate(false);
      setProofEvents(0);
      setHistory([]);
    }
  }, []);

  useBrain(handleBrainEvent);

  useEffect(() => {
    if (!simulate) return;

    clearInterval(intervalRef.current);
    setIsSimulating(true);
    setDay(0);

    let currentDay = 0;
    intervalRef.current = setInterval(() => {
      currentDay += 5;
      setDay(currentDay);

      setProjectState((prev) => {
        if (currentDay >= prev.deliveryTime) {
          clearInterval(intervalRef.current);
          setIsSimulating(false);
        }
        return prev;
      });
    }, 400);

    return () => clearInterval(intervalRef.current);
  }, [simulate, projectState.deliveryTime]);

  useEffect(() => {
    if (!hasProofDrivenState) return;

    setHistory((prev) => {
      const nextEntry = {
        event: proofEvents,
        day: projectState.deliveryTime,
        score: predictProjectOutcome(projectState).score,
        risk: projectState.risk,
        speed: projectState.speed,
      };

      if (prev.length && prev[prev.length - 1].event === proofEvents) {
        const copy = [...prev];
        copy[copy.length - 1] = nextEntry;
        return copy;
      }

      return [...prev.slice(-11), nextEntry];
    });
  }, [projectState, proofEvents, hasProofDrivenState]);

  const resetSimulation = () => {
    clearInterval(intervalRef.current);
    setProjectState(initialProjectState);
    setDay(0);
    setIsSimulating(false);
    setActiveView("empty");
    setSelectedSuggestion(null);
    setSimulate(false);
    setProofEvents(0);
    setHistory([]);
  };

  const prediction = predictProjectOutcome(projectState);
  const spikeSeries = history.map((entry) => entry.score);
  const spikePoints = buildSparklinePoints(spikeSeries);
  const riskPoints = buildSparklinePoints(history.map((entry) => 100 - entry.risk));
  const dependency = useMemo(() => getServiceDependency(projectState), [projectState]);
  const slaSeries = useMemo(
    () => buildSlaProjection(projectState, proofEvents),
    [projectState, proofEvents]
  );
  const slaNoFixPoints = buildSparklinePoints(slaSeries.map((s) => s.noFix));
  const slaFixPoints = buildSparklinePoints(slaSeries.map((s) => s.withFix));

  const renderView = () => {
    if (activeView === "kanban") return <KanbanView day={day} playing={isSimulating} />;
    if (activeView === "timeline") return <TimelineView day={day} playing={isSimulating} />;
    if (activeView === "architecture") return <ArchitectureView day={day} playing={isSimulating} />;

    return <div className="visual-panel empty">Waiting for user action...</div>;
  };

  return (
    <div className="visual-wrapper">
      <div className="visual-area">{renderView()}</div>

      <div className="health-panel">
        <div className="health-header">
          <h3>AI Predicted Project Outcome</h3>
          <button className="reset-btn" onClick={resetSimulation}>
            Reset
          </button>
        </div>

        <div className="prediction-card">
          {hasProofDrivenState ? (
            <>
              <strong>{prediction.direction}</strong>
              <span>Confidence Score: {prediction.score}%</span>
              <p>{prediction.summary}</p>
              <p>Success Probability: {prediction.successProbability}%</p>
              <p>Maturity: {prediction.maturity}</p>
              <p>Est Delivery: {prediction.estimatedDelivery} days</p>
            </>
          ) : (
            <>
              <strong>Waiting for proof-driven updates</strong>
              <span>Confidence Score: N/A</span>
              <p>Submit a valid step proof to start real project scoring.</p>
              <p>Success Probability: N/A</p>
              <p>Maturity: Not Started</p>
              <p>Est Delivery: N/A</p>
            </>
          )}
        </div>

        {selectedSuggestion && (
          <div className="current-suggestion">
            Active Strategy: <strong>{selectedSuggestion}</strong>
          </div>
        )}

        {isSimulating && <div className="simulation-day">Simulating Day: {day}</div>}

        <div className="comparison-banner">
          Delivery Reduced By:
          <strong>
            {hasProofDrivenState
              ? `${initialProjectState.deliveryTime - projectState.deliveryTime} days`
              : " N/A"}
          </strong>
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
            SLA Sim
          </button>
        </div>

        <div className="addon-stage">
          {activeAddon === "spike" && (
            <div className="addon-card">
              <h4>Metric Spike Graph</h4>
              <svg viewBox="0 0 320 120" className="spark-svg" role="img" aria-label="Metric spike chart">
                <polyline points="0,118 320,118" className="spark-base" />
                <polyline points={spikePoints || "0,118 320,118"} className="spark-line score" />
                <polyline points={riskPoints || "0,118 320,118"} className="spark-line risk" />
              </svg>
              <div className="addon-legend">
                <span className="legend score">Execution score</span>
                <span className="legend risk">Risk inversion</span>
              </div>
            </div>
          )}

          {activeAddon === "deps" && (
            <div className="addon-card">
              <h4>Service Dependency Graph</h4>
              <div className="dependency-graph">
                <div className="dependency-canvas">
                  <svg viewBox="0 0 660 188" className="dependency-lines">
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
                  {dependency.services.map((service) => (
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
              <h4>SLA Breach Prediction + Fix Simulation</h4>
              <svg viewBox="0 0 320 120" className="spark-svg" role="img" aria-label="SLA breach projection">
                <polyline points="0,118 320,118" className="spark-base" />
                <polyline points={slaNoFixPoints} className="spark-line breach" />
                <polyline points={slaFixPoints} className="spark-line fix" />
              </svg>
              <div className="addon-legend">
                <span className="legend breach">Without fixes</span>
                <span className="legend fix">With validated fixes</span>
              </div>
              <p className="sla-note">
                Week 10 breach risk: {slaSeries[slaSeries.length - 1]?.noFix}% vs{" "}
                {slaSeries[slaSeries.length - 1]?.withFix}%
              </p>
            </div>
          )}
        </div>

        {Object.entries(projectState).map(([key, value]) => {
          if (typeof value !== "number") return null;

          if (!hasProofDrivenState) {
            return (
              <div key={key} className="metric">
                <span className="metric-name">{key}</span>
                <div className="metric-bar">
                  <div className="metric-fill" style={{ width: "0%" }} />
                </div>
                <span className="metric-value">N/A</span>
              </div>
            );
          }

          const isDelivery = key === "deliveryTime";
          const barWidth = isDelivery ? Math.min(100, (value / 120) * 100) : value;

          return (
            <div key={key} className="metric">
              <span className="metric-name">{key}</span>
              <div className="metric-bar">
                <div className="metric-fill" style={{ width: `${barWidth}%` }} />
              </div>
              <span className="metric-value">{isDelivery ? `${value} days` : `${value}%`}</span>
            </div>
          );
        })}

      </div>
    </div>
  );
}
