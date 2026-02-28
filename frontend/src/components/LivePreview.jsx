import { useEffect, useRef, useState } from "react";

export default function LivePreview({ guide, onClose, apiBase, idea, task, userInput }) {
  const iframeRef = useRef(null);
  const [logs, setLogs] = useState([]);
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const storageKey = `live-preview:${idea || "global"}:${task || "global"}`;

  const stripFence = (text, lang) => {
    const regex = new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "i");
    const match = String(text || "").match(regex);
    return match ? match[1].trim() : "";
  };

  const extractBlocks = (text) => {
    const raw = String(text || "").trim();
    if (!raw) return { html: "", css: "", js: "" };

    const htmlFence = stripFence(raw, "html");
    const cssFence = stripFence(raw, "css");
    const jsFence = stripFence(raw, "javascript") || stripFence(raw, "js");

    const htmlTag = raw.match(/<html[\s\S]*<\/html>|<body[\s\S]*<\/body>|<main[\s\S]*<\/main>|<div[\s\S]*<\/div>/i)?.[0] || "";
    const styleTag = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/i)?.[1]?.trim() || "";
    const scriptTag = raw.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1]?.trim() || "";

    const cssOnly = !htmlFence && !htmlTag && !jsFence && !scriptTag && /[.#][\w-]+\s*\{[\s\S]*\}/.test(raw) ? raw : "";
    const jsOnly = !htmlFence && !htmlTag && !cssFence && !styleTag && /(const|let|var|function|=>|document\.|window\.)/.test(raw) ? raw : "";

    return {
      html: htmlFence || htmlTag || "",
      css: cssFence || styleTag || cssOnly || "",
      js: jsFence || scriptTag || jsOnly || ""
    };
  };

  const loadBundle = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return {
        html: String(parsed.html || "<main><h2>Live Preview</h2><p>Start adding HTML/CSS/JS in steps.</p></main>"),
        css: String(parsed.css || "body{font-family:system-ui;padding:20px;}"),
        js: String(parsed.js || "")
      };
    } catch {
      return {
        html: "<main><h2>Live Preview</h2><p>Start adding HTML/CSS/JS in steps.</p></main>",
        css: "body{font-family:system-ui;padding:20px;}",
        js: ""
      };
    }
  };

  const saveBundle = (bundle) => {
    localStorage.setItem(storageKey, JSON.stringify(bundle));
  };

  const runCode = () => {
    const rawInput = String(userInput || "");
    const commandLikeInput = rawInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .every((line) => /^(npm|npx|pnpm|yarn|node|cd|mkdir|touch|echo|git|curl|GET|POST|PUT|PATCH|DELETE|python|pip|psql|mysql|mongosh)\b/i.test(line));
    const sourceCode = commandLikeInput ? String(guide?.code || "") : (rawInput || String(guide?.code || ""));
    if (!String(sourceCode).trim()) return;
    setLogs([]);

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    const next = extractBlocks(sourceCode);
    const prev = loadBundle();
    const merged = {
      html: next.html || prev.html,
      css: next.css ? `${prev.css}\n\n${next.css}` : prev.css,
      js: next.js ? `${prev.js}\n\n${next.js}` : prev.js
    };
    saveBundle(merged);

    const wrapped = `
      <html>
        <head>
          <style>${merged.css}</style>
        </head>
        <body>
          ${merged.html}
          <script>
            const send = (type, data) => parent.postMessage({ type, data }, "*");
            console.log = (...args) => send("log", args.join(" "));
            console.error = (...args) => send("error", args.join(" "));
            try {
              ${merged.js}
            } catch (e) {
              send("error", e.message);
            }
          <\/script>
        </body>
      </html>
    `;

    doc.open();
    doc.write(wrapped);
    doc.close();
  };

  const runApi = async () => {
    setResponse(null);

    try {
      setLoading(true);
      const userCommands = String(userInput || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("//") && !line.startsWith("#"));
      const commands = userCommands;
      if (!commands.length) {
        setResponse("No user commands found. Paste commands in textarea, then run Live Try.");
        return;
      }

      const res = await fetch(`${apiBase}/live-try`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands,
          idea,
          task,
          stepTitle: guide?.step_title || ""
        })
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Live try failed");
      }

      const lines = [];
      lines.push(`Workflow Attached: ${data.tracked ? "Yes" : "No"}`);
      lines.push(`Execution OK: ${data.ok ? "Yes" : "No"}`);
      lines.push(`Step: ${data.stepTitle || "-"}`);
      lines.push("Command Source: User Input");
      lines.push(`Current CWD: ${data.cwd || "-"}`);
      lines.push("");

      (data.results || []).forEach((r, i) => {
        lines.push(`Command #${i + 1}: ${r.command || "-"}`);
        lines.push(`Type: ${r.type || "-"}`);
        lines.push(`Status: ${r.ok ? "SUCCESS" : "FAILED"}${r.status ? ` (${r.status} ${r.statusText || ""})` : ""}`);
        if (r.method) lines.push(`Method: ${r.method}`);
        if (r.url) lines.push(`URL: ${r.url}`);
        if (r.cwd) lines.push(`CWD: ${r.cwd}`);
        if (r.stdout) lines.push(`STDOUT:\n${r.stdout}`);
        if (r.stderr) lines.push(`STDERR:\n${r.stderr}`);
        if (r.body) lines.push(`BODY:\n${r.body}`);
        if (r.error) lines.push(`ERROR: ${r.error}`);
        lines.push("");
      });

      setResponse(lines.join("\n"));
    } catch (e) {
      setResponse(`API Failed: ${e.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "log") {
        setLogs((prev) => [...prev, `[LOG] ${e.data.data}`]);
      }
      if (e.data?.type === "error") {
        setLogs((prev) => [...prev, `[ERROR] ${e.data.data}`]);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (String(userInput || "").trim()) {
      runApi();
    } else {
      setResponse("Live Try waits for your textarea commands. Empty input is not auto-executed.");
    }
    runCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="live-try-overlay">
      <div className="live-preview live-try-modal">
        <div className="live-header">
          <span>Live Try</span>
          {guide?.code && <button onClick={runCode}>Run Code</button>}
          <button onClick={runApi}>Run Commands</button>
          <button onClick={onClose}>Close</button>
        </div>

        <div className="live-body">
          <iframe title="runner" ref={iframeRef} sandbox="allow-scripts allow-forms allow-same-origin"></iframe>
          <div className="live-console">
            {logs.map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
            {loading && <div>Calling API...</div>}
            {response && <pre>{response}</pre>}
          </div>
        </div>
      </div>
    </div>
  );
}
