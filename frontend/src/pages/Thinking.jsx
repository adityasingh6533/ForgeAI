import "../styles/Thinking.css";
import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const API_BASE_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:5001");

const planSteps = [
  "Understanding your idea...",
  "Identifying core features...",
  "Designing database structure...",
  "Planning backend APIs...",
  "Generating execution roadmap..."
];

const buildSteps = [
  "Preparing your workspace...",
  "Loading guided build flow...",
  "Finalizing task board..."
];

export default function Thinking() {

  const location = useLocation();
  const navigate = useNavigate();
  const idea = location.state?.idea;
  const plan = location.state?.plan;
  const mode = location.state?.mode || "plan";
  const steps = mode === "build" ? buildSteps : planSteps;

  const [index, setIndex] = useState(0);
  const hasRequested = useRef(false);
  const timeoutRefs = useRef([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex(prev => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 700);
    return () => clearInterval(interval);
  }, [steps.length]);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    const cleanup = () => {
      isMounted = false;
      controller.abort();
      timeoutRefs.current.forEach((id) => clearTimeout(id));
      timeoutRefs.current = [];
      hasRequested.current = false;
    };

    if (!idea) {
      navigate("/generate");
      return;
    }

    if (hasRequested.current) return;
    hasRequested.current = true;

    if (mode === "build") {
      if (!plan) {
        navigate("/plan");
        return;
      }

      const id = setTimeout(() => {
        if (!isMounted) return;
        navigate("/board", {
          state: { plan, idea }
        });
      }, 1800);
      timeoutRefs.current.push(id);
      return cleanup;
    }

    const generatePlan = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/generate-plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea }),
          signal: controller.signal,
        });

        if (!res.ok) {
          let message = "Server failed";
          try {
            const data = await res.json();
            message = data?.error || message;
          } catch {
          }
          throw new Error(message);
        }

        const data = await res.json();

        const id = setTimeout(() => {
          if (!isMounted) return;
          navigate("/plan", {
            state: { plan: data, idea }
          });
        }, 2800);
        timeoutRefs.current.push(id);

      } catch (err) {
        if (!isMounted || err?.name === "AbortError") return;
        console.error("AI ERROR:", err);
        alert(`AI generation failed: ${err.message}`);
        navigate("/generate");
      }
    };

    generatePlan();
    return cleanup;

  }, [idea, navigate, mode, plan]);

  return (
    <div className="thinking-page">
      <div className="thinking-box">
        <div className="spinner"></div>
        <h2>{steps[index]}</h2>
      </div>
    </div>
  );
}
