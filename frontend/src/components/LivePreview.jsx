import { useMemo } from "react";

function getPreviewDoc(guide) {
  if (!guide) return "";

  const htmlCandidate =
    guide.previewHtml ||
    guide.preview_html ||
    guide.html ||
    guide.code ||
    guide.template ||
    "";

  if (typeof htmlCandidate === "string" && htmlCandidate.trim()) {
    return htmlCandidate;
  }

  return `
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Live Preview</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; }
      .wrap { padding: 24px; }
      h2 { margin: 0 0 10px; font-size: 22px; }
      p { margin: 0; line-height: 1.6; }
      code { background: #e2e8f0; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h2>Live Preview Ready</h2>
      <p>No preview HTML found in guide. Add <code>previewHtml</code> from backend to render exact output.</p>
    </div>
  </body>
</html>
`;
}

export default function LivePreview({
  guide,
  onClose,
  liveRunning = false,
  liveResult = null,
  steps = [],
  done = [],
  doing = "",
}) {
  const previewDoc = useMemo(() => getPreviewDoc(guide), [guide]);
  const consoleText = [
    `Step: ${guide?.step_title || "Current Step"}`,
    "",
    "Instruction:",
    guide?.instruction || "No instruction available.",
    "",
    "Expected Result:",
    guide?.expected_result || "Not specified.",
  ].join("\n");

  const commands = Array.isArray(guide?.live_try_commands) && guide.live_try_commands.length
    ? guide.live_try_commands
    : Array.isArray(guide?.commands)
      ? guide.commands
      : [];
  const resultRows = Array.isArray(liveResult?.results) ? liveResult.results : [];
  const totalSteps = Array.isArray(steps) ? steps.length : 0;
  const doneCount = Array.isArray(done) ? done.length : 0;
  const progress = totalSteps ? Math.round((doneCount / totalSteps) * 100) : 0;
  const passCount = resultRows.filter((row) => row?.ok).length;
  const failCount = resultRows.length - passCount;

  return (
    <div className="live-try-overlay full" role="dialog" aria-modal="true">
      <div className="live-try-modal full">
        <div className="live-preview">
          <div className="live-header">
            <div className="live-header-meta">
              <strong>Live Integration Preview</strong>
              <span>{guide?.where_to_do ? `Workspace: ${guide.where_to_do}` : "Workspace: current project"}</span>
            </div>
            <div className="live-step-progress">
              <span>{`Progress: ${doneCount}/${totalSteps || 0} steps`}</span>
              <div className="live-progress-track">
                <div className="live-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <small>{doing ? `Active: ${doing}` : "No active task"}</small>
            </div>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="live-body">
            <div className="live-frame-wrap">
              <iframe title="Live Preview" sandbox="allow-scripts" srcDoc={previewDoc} />
            </div>
            <div className="live-console-wrap">
              <div className="live-console">
                <pre>{consoleText}</pre>
              </div>
              <div className="live-command-block">
                <h4>Integration Commands</h4>
                {commands.length ? (
                  <ol>
                    {commands.map((command, index) => (
                      <li
                        key={`${command}-${index}`}
                        className={resultRows[index] ? (resultRows[index].ok ? "ok" : "fail") : ""}
                      >
                        <code>{command}</code>
                        {resultRows[index] && (
                          <span>{resultRows[index].ok ? "Pass" : "Fail"}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No commands generated for this step yet.</p>
                )}
              </div>
              <div className="live-result-block">
                <h4>Live Result</h4>
                {liveRunning && <p>Running commands...</p>}
                {!liveRunning && liveResult && (
                  <>
                    <p className={liveResult?.ok ? "ok-text" : "fail-text"}>
                      {liveResult?.ok ? "Execution stable for this step." : "Weak points detected in execution."}
                    </p>
                    <p>{`Pass: ${passCount} | Fail: ${Math.max(failCount, 0)}`}</p>
                    {!!liveResult?.error && <p className="fail-text">{liveResult.error}</p>}
                    {resultRows.some((row) => !row?.ok) && (
                      <ul className="live-fail-list">
                        {resultRows
                          .filter((row) => !row?.ok)
                          .slice(0, 3)
                          .map((row, index) => (
                            <li key={`${row?.command || row?.url || "fail"}-${index}`}>
                              <code>{row?.command || row?.url || "execution"}</code>
                              <span>{row?.error || row?.stderr || row?.statusText || "failed"}</span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </>
                )}
                {!liveRunning && !liveResult && <p>Run Live Try to collect real integration output.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
