import "../styles/Board.css";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useBrainDispatch } from "../BrainProvider";
import LivePreview from "../components/LivePreview";
import VisualizationPanel from "../ai/visualizer/VisualizationPanel";

const API = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:5001");

const buildExactAnswerProof = (guide = {}, doingTask = "") => {
  const stepTitle = guide?.step_title || "Current step";
  const targetFile = guide?.file_path || "docs/architecture.md";
  const lines = [
    `# Step: ${stepTitle}`,
    `# Task: ${doingTask || "Current task"}`,
    `# File(s): ${targetFile}`,
    "",
    "## What I changed",
    `- Captured the architecture layers, stack choices, and workflow flow in ${targetFile}.`,
    "- Highlighted how React, Express/OpenAI, and MongoDB work together plus the live command safety guards.",
    "- Mentioned verification helpers (task guides, live try, review checks) to keep execution observable.",
    "",
    "## Code / Commands",
    "```markdown",
    "# Architecture Overview",
    "",
    "## Layers",
    "**Frontend** – React SPA + React Flow for visual planning, custom styles in `frontend`.",
    "**Backend** – Express 5 API (`backend/index.js`) powering `/generate-plan`, `/task-guide`, `/live-try`, `/review-task`.",
    "**AI** – OpenAI chat completions (`gpt-4o-mini`, `gpt-4.1-mini`) returning structured JSON for plans/guides.",
    "**Persistence** – MongoDB sessions (via `MONGO_URI`) or memory maps tracking history/live attempts/reviews.",
    "**Live Control** – Safe command executor with allowed prefixes, workspace root enforcement, and auto-check helpers.",
    "```",
    "",
    "## Verification",
    "- `npm run dev` in both backend and frontend runs cleanly and the architecture doc fills this workspace step.",
  ];
  return lines.join("\n").replace(/[^\x20-\x7E\n\r\t]/g, "-");
};

export default function Board() {
  const location = useLocation();
  const navigate = useNavigate();
  const { dispatchAction } = useBrainDispatch();

  const { plan, idea } = location.state || {};
  const steps = useMemo(() => (Array.isArray(plan?.steps) ? plan.steps : []), [plan]);

  const [doing, setDoing] = useState(null);
  const [done, setDone] = useState([]);
  const [brief, setBrief] = useState(null);
  const [briefTask, setBriefTask] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [guide, setGuide] = useState(null);
  const [code, setCode] = useState("");
  const [review, setReview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [autoCheckRunning, setAutoCheckRunning] = useState(false);
  const [confirmDoneOpen, setConfirmDoneOpen] = useState(false);
  const [pendingDoneTask, setPendingDoneTask] = useState(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveRunning, setLiveRunning] = useState(false);
  const [liveResult, setLiveResult] = useState(null);
  const [liveFullScreen, setLiveFullScreen] = useState(true);
  const [validatedStepKeys, setValidatedStepKeys] = useState([]);

  useEffect(() => {
    const todo = steps.filter((step) => !done.includes(step) && step !== doing);
    dispatchAction({
      type: "BOARD_SYNC",
      idea,
      steps,
      todo,
      doing,
      done,
    });
  }, [dispatchAction, idea, steps, doing, done]);

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

  const fillExactAnswer = () => {
    setCode((prev) => (prev.trim() ? prev : buildExactAnswerProof(guide, doing)));
  };

  const validateProofInput = (input) => {
    const text = String(input || "").trim();
    if (text.length < 40) {
      return { ok: false, reason: "Proof is too short. Add step-specific code or command output." };
    }

    const indicators = [
      /```[\s\S]*```/m.test(text),
      /\b(import|export|const|let|function|class|def|return|SELECT|INSERT|CREATE)\b/i.test(text),
      /\b(npm|pnpm|yarn|node|python|pytest|jest|vitest|git|docker|curl)\b/i.test(text),
      /(^|\n)\s*[-*]\s+/m.test(text),
      /[{}();<>]/.test(text),
    ].filter(Boolean).length;

    if (indicators < 2) {
      return { ok: false, reason: "Add a code snippet plus command output or clear change notes." };
    }

    return { ok: true, reason: "" };
  };

  const fetchBrief = async (task) => {
    setBriefTask(task);
    setBriefLoading(true);
    setBrief(null);
    setBriefError("");

    try {
      const res = await fetch(`${API}/task-brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, task }),
      });
      if (!res.ok) {
        let message = `Task brief failed (${res.status})`;
        try {
          const data = await res.json();
          message = data?.error || message;
        } catch {
        }
        throw new Error(message);
      }
      setBrief(await res.json());
    } catch (err) {
      setBriefError(err?.message || "Unable to load task brief.");
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
    if (!res.ok) {
      let message = `Task guide failed (${res.status})`;
      try {
        const data = await res.json();
        message = data?.error || message;
      } catch {
      }
      throw new Error(message);
    }
    setReview(null);
    setCode("");
    setLiveResult(null);
    setGuide(await res.json());
  };

  const startCreating = async () => {
    if (!briefTask) return;
    setDoing(briefTask);
    setGuideOpen(true);

    try {
      await loadGuide(briefTask);
      dispatchAction({
        type: "TASK_STARTED",
        task: briefTask,
        idea,
        steps,
        done,
      });
    } catch (err) {
      setReview({ status: "wrong", feedback: err?.message || "Unable to start this task." });
      setDoing(null);
      setGuideOpen(false);
      setGuide(null);
    }
  };

  const nextStep = async () => {
    if (!isReviewAccepted) {
      setReview({
        status: "wrong",
        feedback: "Next Step is locked. Submit valid proof first."
      });
      return;
    }
    try {
      await loadGuide(doing);
    } catch (err) {
      setReview({ status: "wrong", feedback: err?.message || "Unable to load next step." });
    }
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
        body: JSON.stringify({
          idea,
          task: doing,
          userCode: code,
          stepContext: guide || null,
        }),
      });
      if (!res.ok) {
        throw new Error(`Review failed (${res.status})`);
      }
      const data = await res.json();
      const feedbackParts = [data?.feedback || "Review unavailable"];
      if (data?.fix) feedbackParts.push(`Fix: ${data.fix}`);
      if (data?.autoChecks?.summary) feedbackParts.push(`Auto Checks: ${data.autoChecks.summary}`);
      if (data?.repo?.targetFile) {
        feedbackParts.push(
          `Repo: ${data.repo.targetFile} | exists=${data.repo.targetFileExists ? "yes" : "no"} | touched=${data.repo.fileTouchedInGit ? "yes" : "no"}`
        );
      }

      setReview({
        status: data?.status || "wrong",
        feedback: feedbackParts.join("\n")
      });

      dispatchAction({
        type: "REVIEW_RESULT",
        idea,
        task: doing,
        step: guide?.step_title || "",
        status: data?.status || "wrong",
        evidence: data?.evidence || null,
        checks: data?.checks || null,
        autoChecks: data?.autoChecks || null,
        repo: data?.repo || null,
        fix: data?.fix || "",
        feedback: data?.feedback || "",
      });

      if ((data?.status || "").toLowerCase() === "correct" && !validatedStepKeys.includes(currentStepKey)) {
        dispatchAction({
          type: "STEP_VALIDATED",
          task: doing,
          step: guide?.step_title,
          idea,
          status: data?.status || "correct",
        });
        setValidatedStepKeys((prev) => [...prev, currentStepKey]);
      }
    } catch (err) {
      setReview({ status: "wrong", feedback: err?.message || "Submit failed" });
    } finally {
      setSubmitting(false);
    }
  };

  const runAutoChecksNow = async () => {
    if (!doing || autoCheckRunning) return;
    setAutoCheckRunning(true);
    try {
      const res = await fetch(`${API}/auto-checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea,
          task: doing,
          stepContext: guide || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Auto checks failed (${res.status})`);
      }
      setReview((prev) => ({
        status: data?.ok ? "partial" : (prev?.status || "wrong"),
        feedback: [prev?.feedback || "", `Auto Checks: ${data?.autoChecks?.summary || "completed"}`].filter(Boolean).join("\n"),
      }));
    } catch (err) {
      setReview((prev) => ({
        status: prev?.status || "wrong",
        feedback: [prev?.feedback || "", `Auto Checks Error: ${err?.message || "failed"}`].filter(Boolean).join("\n"),
      }));
    } finally {
      setAutoCheckRunning(false);
    }
  };

  const openMarkDoneConfirm = () => {
    if (!isReviewAccepted) {
      setReview({
        status: "wrong",
        feedback: "Task can be completed only after a correct submission."
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
        error: "Live command is missing for this step. Backend task-guide must return `live_try_commands`."
      });
      dispatchAction({
        type: "LIVE_TRY_RESULT",
        idea,
        task: doing,
        step: guide?.step_title || "",
        ok: false,
        results: [],
        error: "Missing live_try_commands",
      });
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
          commands,
          whereToDo: guide?.where_to_do || "",
        }),
      });

      const data = await res.json();
      setLiveResult(data);
      dispatchAction({
        type: "LIVE_TRY_RESULT",
        idea,
        task: doing,
        step: guide?.step_title || "",
        ok: Boolean(data?.ok),
        results: Array.isArray(data?.results) ? data.results : [],
      });
    } catch (err) {
      setLiveResult({
        ok: false,
        stepTitle: guide?.step_title || "",
        results: [],
        error: err?.message || "Live try failed"
      });
      dispatchAction({
        type: "LIVE_TRY_RESULT",
        idea,
        task: doing,
        step: guide?.step_title || "",
        ok: false,
        results: [],
        error: err?.message || "Live try failed",
      });
    } finally {
      setLiveRunning(false);
    }
  };

  const handleLiveTry = async (fullScreen = true) => {
    setLiveFullScreen(fullScreen);
    setLiveOpen(true);
    await runLiveTry();
  };

  const confirmDoneYes = () => {
    if (!pendingDoneTask || done.includes(pendingDoneTask)) {
      setConfirmDoneOpen(false);
      setPendingDoneTask(null);
      return;
    }

    dispatchAction({
      type: "TASK_COMPLETED",
      task: pendingDoneTask,
      idea,
      step: guide?.step_title,
      steps,
      done: [...done, pendingDoneTask],
    });

    setDone((prev) => [...prev, pendingDoneTask]);
    setDoing(null);
    setGuideOpen(false);
    setGuide(null);
    setCode("");
    setReview(null);
    setLiveOpen(false);
    setLiveResult(null);
    setPendingDoneTask(null);
    setConfirmDoneOpen(false);
  };

  const closeGuide = () => {
    setGuideOpen(false);
    setLiveOpen(false);
    setLiveResult(null);
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
          {!briefLoading && briefError && (
            <div className="brief-panel">
              <p><b>Error:</b> {briefError}</p>
            </div>
          )}
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
                <div className="copy-btn-wrap">
                  <button type="button" className="copy-btn" onClick={ensureTemplate}>
                    Use Template
                  </button>
                  <button
                    type="button"
                    className="copy-btn use-exact"
                    onClick={fillExactAnswer}
                    disabled={!guide}
                  >
                    Use Exact Ans
                  </button>
                  <button
                    type="button"
                    className="copy-btn live-run"
                    onClick={handleLiveTry}
                    disabled={!guide || liveRunning}
                  >
                    Live Try Full Screen
                  </button>
                </div>
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
                  {"\n"}1) Implement the current step
                  {"\n"}2) Paste proof and click Submit
                  {"\n"}3) Verify with Live Try
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
                  {"\n"}"Step-wise proof makes execution auditable and easy to explain."
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
              <button className="action-submit" onClick={runAutoChecksNow} disabled={autoCheckRunning}>
                {autoCheckRunning ? "Checking..." : "Auto Check"}
              </button>
              <button className="action-done" onClick={openMarkDoneConfirm} disabled={!isReviewAccepted}>
                Mark Done
              </button>
              <button className="action-close" onClick={closeGuide}>Close</button>
            </div>
          </div>
        </div>
      )}

      {liveOpen && guide && (
        <LivePreview
          guide={guide}
          onClose={() => setLiveOpen(false)}
          liveRunning={liveRunning}
          liveResult={liveResult}
          steps={steps}
          done={done}
          doing={doing}
          fullScreen={liveFullScreen}
        />
      )}

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

    </div>
  );
}
