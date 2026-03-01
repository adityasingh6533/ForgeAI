import "../styles/Board.css";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useBrainDispatch } from "../BrainProvider";
import LivePreview from "../components/LivePreview";
import VisualizationPanel from "../ai/visualizer/VisualizationPanel";

const API = process.env.REACT_APP_API_URL || "http://localhost:5001";

export default function Board() {
  const location = useLocation();
  const navigate = useNavigate();
  const { dispatchAction } = useBrainDispatch();

  const { plan, idea } = location.state || {};
  const steps = plan?.steps || [];

  const [doing, setDoing] = useState(null);
  const [done, setDone] = useState([]);
  const [brief, setBrief] = useState(null);
  const [briefTask, setBriefTask] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guide, setGuide] = useState(null);
  const [code, setCode] = useState("");
  const [review, setReview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDoneOpen, setConfirmDoneOpen] = useState(false);
  const [pendingDoneTask, setPendingDoneTask] = useState(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveRunning, setLiveRunning] = useState(false);
  const [liveResultOpen, setLiveResultOpen] = useState(false);
  const [liveResult, setLiveResult] = useState(null);
  const [validatedStepKeys, setValidatedStepKeys] = useState([]);

  useEffect(() => {
    if (!plan) navigate("/");
  }, [plan, navigate]);

  if (!plan) return null;

  const normalizedStepTitle = (guide?.step_title || "").toLowerCase();
  const likelyPath =
    guide?.file_path ||
    guide?.path ||
    (normalizedStepTitle.includes("main") && normalizedStepTitle.includes("python")
      ? "app.py"
      : normalizedStepTitle.includes("api")
        ? "api/index.js"
        : normalizedStepTitle.includes("component")
          ? "src/components/Main.jsx"
          : "project file(s)");

  const proofTemplate = `# Step: ${guide?.step_title || "Implementation Step"}
# Task: ${doing || "Current task"}
# File(s): ${likelyPath}

## What I changed
- 

## Code / Commands
\`\`\`

\`\`\`

## Verification
- 
`;

  const isReviewAccepted = review?.status === "correct";
  const currentStepKey = `${doing || ""}::${guide?.step_title || ""}`;

  const ensureTemplate = () => {
    setCode((prev) => (prev.trim() ? prev : proofTemplate));
  };

  const validateProofInput = (input) => {
    const text = String(input || "").trim();
    if (text.length < 40) {
      return { ok: false, reason: "Proof bahut short hai. Step-specific code/command add karo." };
    }

    const indicators = [
      /```[\s\S]*```/m.test(text),
      /\b(import|export|const|let|function|class|def|return|SELECT|INSERT|CREATE)\b/i.test(text),
      /\b(npm|pnpm|yarn|node|python|pytest|jest|vitest|git|docker|curl)\b/i.test(text),
      /(^|\n)\s*[-*]\s+/m.test(text),
      /[{}();<>]/.test(text),
    ].filter(Boolean).length;

    if (indicators < 2) {
      return { ok: false, reason: "Code snippet + command output ya change notes add karo." };
    }

    return { ok: true, reason: "" };
  };

  const hasRenderablePreview = (inputGuide) => {
    const candidate =
      inputGuide?.previewHtml ||
      inputGuide?.preview_html ||
      inputGuide?.html ||
      inputGuide?.template ||
      inputGuide?.code ||
      "";

    return /<html|<!doctype|<body|<div|<main/i.test(String(candidate));
  };

  const fetchBrief = async (task) => {
    setBriefTask(task);
    setBriefLoading(true);
    setBrief(null);

    try {
      const res = await fetch(`${API}/task-brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, task }),
      });
      setBrief(await res.json());
    } finally {
      setBriefLoading(false);
    }
  };

  const loadGuide = async (task) => {
    const res = await fetch(`${API}/task-guide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, task }),
    });
    setReview(null);
    setCode("");
    setGuide(await res.json());
  };

  const startCreating = async () => {
    if (!briefTask) return;
    setDoing(briefTask);
    setGuideOpen(true);

    dispatchAction({
      type: "TASK_STARTED",
      task: briefTask,
      idea
    });

    await loadGuide(briefTask);
  };

  const nextStep = async () => {
    if (!isReviewAccepted) {
      setReview({
        status: "wrong",
        feedback: "Next Step lock hai. Pehle valid proof submit karo."
      });
      return;
    }
    await loadGuide(doing);
  };

  const submitReview = async () => {
    if (submitting || !doing) return;

    const quickCheck = validateProofInput(code);
    if (!quickCheck.ok) {
      setReview({ status: "wrong", feedback: quickCheck.reason });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/review-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, task: doing, userCode: code }),
      });
      const data = await res.json();

      setReview({
        status: data?.status || "wrong",
        feedback: data?.feedback || "Review unavailable"
      });

      if ((data?.status || "").toLowerCase() === "correct" && !validatedStepKeys.includes(currentStepKey)) {
        dispatchAction({
          type: "STEP_VALIDATED",
          task: doing,
          step: guide?.step_title
        });
        setValidatedStepKeys((prev) => [...prev, currentStepKey]);
      }
    } catch (err) {
      setReview({ status: "wrong", feedback: err?.message || "Submit failed" });
    } finally {
      setSubmitting(false);
    }
  };

  const openMarkDoneConfirm = () => {
    if (!isReviewAccepted) {
      setReview({
        status: "wrong",
        feedback: "Task complete karne se pehle Submit pe correct aana zaroori hai."
      });
      return;
    }
    setPendingDoneTask(doing);
    setConfirmDoneOpen(true);
  };

  const runLiveTry = async () => {
    if (!doing || !guide || liveRunning) return;

    const commands = Array.isArray(guide?.live_try_commands) && guide.live_try_commands.length
      ? guide.live_try_commands
      : Array.isArray(guide?.commands)
        ? guide.commands
        : [];

    if (!commands.length) {
      setLiveResult({
        ok: false,
        stepTitle: guide?.step_title || "",
        results: [],
        error: "Is step ke liye live command missing hai. Backend task-guide se `live_try_commands` return karo."
      });
      setLiveResultOpen(true);
      return;
    }

    setLiveRunning(true);
    try {
      const res = await fetch(`${API}/live-try`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea,
          task: doing,
          stepTitle: guide?.step_title || "",
          commands
        }),
      });

      const data = await res.json();
      setLiveResult(data);
      setLiveResultOpen(true);
    } catch (err) {
      setLiveResult({
        ok: false,
        stepTitle: guide?.step_title || "",
        results: [],
        error: err?.message || "Live try failed"
      });
      setLiveResultOpen(true);
    } finally {
      setLiveRunning(false);
    }
  };

  const handleLiveTry = async () => {
    if (hasRenderablePreview(guide)) {
      setLiveOpen(true);
    }
    await runLiveTry();
  };

  const confirmDoneYes = () => {
    dispatchAction({
      type: "TASK_COMPLETED",
      task: pendingDoneTask,
      idea,
      step: guide?.step_title
    });

    setDone((prev) => [...prev, pendingDoneTask]);
    setDoing(null);
    setGuideOpen(false);
    setCode("");
    setReview(null);
    setLiveOpen(false);
    setPendingDoneTask(null);
    setConfirmDoneOpen(false);
  };

  const closeGuide = () => {
    setGuideOpen(false);
    setLiveOpen(false);
  };

  return (
    <div className="board-page">
      <div className="board-header">
        <div className="board-idea-card">
          <h1>{idea}</h1>
        </div>
        <p>Execution Workspace</p>
      </div>

      <div className="board-layout">
        <div className="kanban">
          <div className="column">
            <h3>TODO</h3>
            {steps.filter((s) => !done.includes(s) && s !== doing).map((t, i) => (
              <div key={i} className="task" onClick={() => fetchBrief(t)}>{t}</div>
            ))}
          </div>

          <div className="column">
            <h3>DOING</h3>
            {doing && (
              <div className="task active" onClick={() => setGuideOpen(true)}>
                {doing}
              </div>
            )}
          </div>

          <div className="column">
            <h3>DONE</h3>
            {done.map((d, i) => (
              <div key={i} className="task done">{d}</div>
            ))}
          </div>
        </div>

        <div className="assistant">
          {brief && (
            <div className="brief-panel">
              <h3>AI Generation</h3>
              <p><b>Goal:</b> {brief.goal}</p>
              <p><b>Build:</b> {brief.what_you_build}</p>
              <button onClick={startCreating}>Start Creating</button>
            </div>
          )}
          {briefLoading && <div className="brief-panel"><p>Generating...</p></div>}
        </div>
      </div>

      <VisualizationPanel />

      {guideOpen && guide && (
        <div className="guide-overlay">
          <div className="guide-modal">
            <h2>{guide.step_title}</h2>

            <div className="guide-left">
              <p>{guide.instruction}</p>
              <div className="path">
                Target File: <b>{likelyPath}</b>
              </div>
              <div className="path">
                Goal: Paste only proof related to this step (not full project dump).
              </div>
            </div>

            <div className="guide-editor">
              <div className="code-label">
                Proof / Code Submission
                <button type="button" className="copy-btn" onClick={ensureTemplate}>
                  Use Template
                </button>
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={`Paste one of these:\n\n1) File code you created/updated\n2) Terminal output (run/test)\n3) Short explanation + key snippet\n\nTip: keep it step-specific.`}
              />
            </div>

            <div className="guide-chat">
              <div className="chat-messages">
                <div className="msg ai">
                  <b>Workspace flow:</b>
                  {"\n"}1) Step instruction implement karo
                  {"\n"}2) Proof paste karke Submit karo
                  {"\n"}3) Live Try se verify karo
                  {"\n"}4) Next Step / Mark Done
                </div>
                <div className="msg ai">
                  <b>What to paste now:</b>
                  {"\n"}- New/updated code for this step
                  {"\n"}- Relevant command output
                  {"\n"}- 2-3 line explanation (what changed + why)
                </div>
                <div className="msg ai">
                  <b>Avoid:</b>
                  {"\n"}- Full unrelated files
                  {"\n"}- Random text without proof
                  {"\n"}- Previous step code repeated again
                </div>
                <div className="msg ai">
                  <b>Presentation line for demo:</b>
                  {"\n"}"Yahan step-wise proof submit hota hai, isliye execution auditable aur explainable ban jata hai."
                </div>
              </div>
            </div>

            <div className="guide-actions">
              {review && (
                <div className={`review ${review.status}`}>
                  {review.feedback}
                </div>
              )}
              <button className="action-next" onClick={nextStep}>Next Step</button>
              <button className="action-submit" onClick={submitReview} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit"}
              </button>
              <button className="action-live" onClick={handleLiveTry} disabled={liveRunning}>
                {liveRunning ? "Running..." : "Live Try"}
              </button>
              <button className="action-done" onClick={openMarkDoneConfirm} disabled={!isReviewAccepted}>
                Mark Done
              </button>
              <button className="action-close" onClick={closeGuide}>Close</button>
            </div>
          </div>
        </div>
      )}

      {liveOpen && guide && <LivePreview guide={guide} onClose={() => setLiveOpen(false)} />}

      {confirmDoneOpen && (
        <div className="confirm-overlay">
          <div className="confirm-modal">
            <h3>Are You Satisfied?</h3>
            <div className="confirm-actions">
              <button onClick={confirmDoneYes}>Yes</button>
              <button onClick={() => setConfirmDoneOpen(false)}>No</button>
            </div>
          </div>
        </div>
      )}

      {liveResultOpen && (
        <div className="api-result-overlay">
          <div className="api-result-modal">
            <div className="api-result-header">
              <h4>Live Try Result {liveResult?.ok ? "(Pass)" : "(Needs Fix)"}</h4>
              <button onClick={() => setLiveResultOpen(false)}>Close</button>
            </div>
            <div className="api-result-body">
              <pre>{JSON.stringify(liveResult, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
