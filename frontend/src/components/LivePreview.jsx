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

export default function LivePreview({ guide, onClose }) {
  const previewDoc = useMemo(() => getPreviewDoc(guide), [guide]);
  const consoleText = [
    `Step: ${guide?.step_title || "Current Step"}`,
    "",
    "Instruction:",
    guide?.instruction || "No instruction available.",
    "",
    "Commands:",
    Array.isArray(guide?.commands) && guide.commands.length
      ? guide.commands.join("\n")
      : "No commands provided.",
    "",
    "Expected Result:",
    guide?.expected_result || "Not specified.",
  ].join("\n");

  return (
    <div className="live-try-overlay" role="dialog" aria-modal="true">
      <div className="live-try-modal">
        <div className="live-preview">
          <div className="live-header">
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="live-body">
            <iframe title="Live Preview" sandbox="allow-scripts" srcDoc={previewDoc} />
            <div className="live-console">
              <pre>{consoleText}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
