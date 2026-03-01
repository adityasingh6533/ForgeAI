import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5001;
const execAsync = promisify(exec);
const LIVE_WORKSPACE_ROOT = process.env.LIVE_WORKSPACE_ROOT || path.resolve(process.cwd(), "..");

app.use(cors());
app.use(express.json({ limit: "4mb" }));

/* ===================== HEALTH ===================== */

app.get("/health", (_req, res) => {
res.json({ ok: true, service: "phantasia-backend" });
});

if (!process.env.OPENAI_API_KEY) {
console.error("OPENAI_API_KEY missing in .env");
process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ===================== MODEL FALLBACK ===================== */

const MODELS = [
process.env.OPENAI_MODEL,
"gpt-4o-mini",
"gpt-4.1-mini"
].filter(Boolean);

const withTimeout = (promise, ms = 30000) =>
Promise.race([
promise,
new Promise((_, reject) =>
setTimeout(() => reject(new Error("AI timeout")), ms)
),
]);

async function jsonCompletion(messages, temperature = 0.2) {
let lastErr;
for (const model of MODELS) {
try {
return await withTimeout(
openai.chat.completions.create({
model,
response_format: { type: "json_object" },
messages,
temperature,
})
);
} catch (err) {
lastErr = err;
}
}
throw lastErr;
}

/* ===================== EXECUTION MEMORY ===================== */

const memory = new Map();
const key = (idea, task) => `${idea}::${task}`;
const liveTryMemory = new Map();
const liveShellSessions = new Map();

const getHistory = (idea, task) => memory.get(key(idea, task)) || [];
const pushHistory = (idea, task, step) => {
const prev = memory.get(key(idea, task)) || [];
memory.set(key(idea, task), [...prev, step]);
};

function evaluateSubmissionEvidence(input = "") {
const text = String(input || "");
const normalized = text.trim();

if (!normalized) {
return {
ok: false,
score: 0,
signals: [],
reason: "Submission is empty."
};
}

const signals = [];
const lengthScore = normalized.length >= 80 ? 1 : 0;
if (lengthScore) signals.push("meaningful_length");

if (/```[\s\S]*```/m.test(normalized)) signals.push("code_block");
if (/\b(import|export|const|let|function|class|def|return|SELECT|INSERT|CREATE)\b/i.test(normalized)) {
signals.push("code_keywords");
}
if (/\b(npm|pnpm|yarn|node|python|pytest|jest|vitest|git|docker|curl)\b/i.test(normalized)) {
signals.push("command_terms");
}
if (/(^|\n)\s*[-*]\s+/m.test(normalized)) signals.push("change_notes");
if (/[{}();<>]/.test(normalized)) signals.push("syntax_markers");

const score = lengthScore + signals.length;
const ok = normalized.length >= 40 && signals.length >= 2;

return {
ok,
score,
signals,
reason: ok
? ""
: "Add step-specific proof: code snippet, command output, and a short change note."
};
}

/* ===================== LIVE TRY HELPERS ===================== */

const LIVE_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const getSession = (idea, task) => {
const sessionKey = key(idea || "global", task || "global");
if (!liveShellSessions.has(sessionKey)) {
liveShellSessions.set(sessionKey, { cwd: LIVE_WORKSPACE_ROOT });
}
return liveShellSessions.get(sessionKey);
};

const asAbsoluteDir = (baseCwd, rawPath) => {
if (!rawPath) return baseCwd;
if (path.isAbsolute(rawPath)) return path.normalize(rawPath);
return path.normalize(path.resolve(baseCwd, rawPath));
};

async function runShellCommand(rawCommand, session) {
const command = String(rawCommand || "").trim();
if (!command) {
return { type: "shell", command, ok: false, error: "Empty command", cwd: session.cwd };
}

const cdMatch = command.match(/^cd\s+(.+)$/i);
if (cdMatch) {
const target = cdMatch[1].trim().replace(/^["']|["']$/g, "");
const nextDir = asAbsoluteDir(session.cwd, target);
if (!fs.existsSync(nextDir) || !fs.statSync(nextDir).isDirectory()) {
return {
type: "shell",
command,
ok: false,
code: 1,
cwd: session.cwd,
stdout: "",
stderr: "",
error: `Directory not found: ${nextDir}`
};
}
session.cwd = nextDir;
return {
type: "shell",
command,
ok: true,
code: 0,
cwd: session.cwd,
stdout: `Changed directory to ${session.cwd}`,
stderr: ""
};
}

try {
const { stdout, stderr } = await execAsync(command, {
cwd: session.cwd,
timeout: 15000,
maxBuffer: 1024 * 1024
});
return {
type: "shell",
command,
ok: true,
code: 0,
cwd: session.cwd,
stdout: stdout || "",
stderr: stderr || ""
};
} catch (err) {
return {
type: "shell",
command,
ok: false,
code: typeof err.code === "number" ? err.code : 1,
cwd: session.cwd,
stdout: err.stdout || "",
stderr: err.stderr || "",
error: err.message
};
}
}

function parseLiveCommand(command = "") {
const text = String(command || "").trim();
if (!text) return { method: "GET", url: "", headers: {}, body: undefined };

let method = "GET";
let url = "";
let body;
const headers = {};

const methodMatch = text.match(/^(GET|POST|PUT|PATCH|DELETE)\b/i);
if (methodMatch) {
method = methodMatch[1].toUpperCase();
}

const curlMethod = text.match(/-X\s+([A-Z]+)/i);
if (curlMethod) {
method = curlMethod[1].toUpperCase();
}

const urlMatch = text.match(/https?:\/\/[^\s"']+/i);
if (urlMatch) {
url = urlMatch[0];
}

const headerRegex = /-H\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))/gi;
for (const item of text.matchAll(headerRegex)) {
const raw = (item[1] || item[2] || item[3] || "").trim();
const splitAt = raw.indexOf(":");
if (splitAt > 0) {
const key = raw.slice(0, splitAt).trim();
const value = raw.slice(splitAt + 1).trim();
if (key) headers[key] = value;
}
}

const dataMatch = text.match(/(?:--data|-d)\s+(?:"([^"]*)"|'([^']*)'|([^\s]+))/i);
if (dataMatch) {
body = dataMatch[1] || dataMatch[2] || dataMatch[3] || "";
if (!text.match(/-X\s+/i)) {
method = "POST";
}
}

if (!LIVE_METHODS.has(method)) method = "GET";
return { method, url, headers, body };
}

/* ===================== GENERATE PLAN ===================== */

app.post("/generate-plan", async (req, res) => {
try {
const { idea } = req.body;
if (!idea) return res.status(400).json({ error: "Idea required" });

const completion = await jsonCompletion([
  {
    role: "system",
    content: `

You are a senior software architect.

Return JSON:
{ "summary":"", "features":[], "database":[], "apis":[], "steps":[], "mindmap":{"id":"root","label":"","description":"","children":[]} }

Rules:

- executable dev steps

- hierarchical mindmap

- no explanation
  `
  },
  { role: "user", content: idea }
  ]);
  
  res.json(JSON.parse(completion.choices[0].message.content));
  } catch (err) {
  res.status(500).json({ error: err.message });
  }
  });

/* ===================== TASK BRIEF ===================== */

app.post("/task-brief", async (req, res) => {
try {
const { idea, task } = req.body;

const completion = await jsonCompletion([
  {
    role: "system",
    content: `

Explain shortly what user is about to build.
Return JSON:
{ "goal":"", "what_you_build":"", "concepts":[], "files_expected":[] }
No code.
`
  },
  {
    role: "user",
    content: `Project: ${idea}\nTask: ${task}`
  }
],0.3);

res.json(JSON.parse(completion.choices[0].message.content));

} catch (err) {
res.status(500).json({ error: err.message });
}
});

/* ===================== TASK GUIDE ===================== */

app.post("/task-guide", async (req, res) => {
try {
const { idea, task } = req.body;

const history = getHistory(idea, task);

const completion = await jsonCompletion([
  {
    role: "system",
    content: `

You are a step-by-step coding mentor.

Return JSON:
{
"step_title":"",
"where_to_do":"",
"instruction":"",
"commands":[],
"live_try_commands":[],
"file_path":"",
"code":"",
"previewHtml":"",
"expected_result":"",
"next_hint":""
}

Rules:

- atomic steps

- include folder paths

- runnable commands
- prioritize implementation over theory
- if step is file-based, provide real working code in "code" (not pseudocode)
- if step is terminal-based, "commands" must be concrete and executable in order
- keep "instruction" practical and short (max 2 lines)
- if UI step exists, include renderable HTML in "previewHtml"
- include "live_try_commands" for testable commands (can be empty)
- do not include generic advice without actionable code/commands
`
  },
  {
    role: "user",
    content: `Project:${idea}\nTask:${task}\nHistory:${JSON.stringify(history)}`
  }
  ]);
  
  const json = JSON.parse(completion.choices[0].message.content);
  pushHistory(idea, task, json);
  res.json(json);
  } catch (err) {
  res.status(500).json({ error: err.message });
  }
  });

/* ===================== TASK CHAT (FOCUSED) ===================== */

app.post("/task-chat", async (req, res) => {
try {
const { idea, task, message, currentStep, userCode } = req.body;
const history = getHistory(idea, task);
const stepContext = currentStep || history[history.length - 1] || {};

const completion = await jsonCompletion([
  {
    role: "system",
    content: `
You are a hands-on coding assistant for one active task step.
Default behavior: give executable code/commands first, minimal theory.
Return strict JSON only: { "reply":"" }

Rules:
- prioritize ready-to-run answer
- if user asks "how", include exact commands and/or full code blocks
- avoid long conceptual text; keep explanations to max 2 short lines
- for code edits, output complete snippet for the target file section
- if info is missing, make a practical assumption and still provide usable code
`
  },
  {
    role: "user",
    content: `Project:${idea}\nTask:${task}\nCurrentStep:${JSON.stringify(stepContext)}\nUserProgress:${String(userCode || "").slice(0,2000)}\nQuestion:${message}`
  }
],0.2);

res.json(JSON.parse(completion.choices[0].message.content));

} catch (err) {
res.status(500).json({ error: err.message });
}
});

/* ===================== REVIEW ===================== */

app.post("/review-task", async (req, res) => {
try {
const { idea, task, userCode } = req.body;
const evidence = evaluateSubmissionEvidence(userCode);

if (!evidence.ok) {
return res.json({
status: "wrong",
feedback: evidence.reason,
fix: "Share concrete step proof with code/command output.",
correct_code: "",
evidence
});
}

const completion = await jsonCompletion([
  {
    role: "system",
    content: `
You are a fair implementation reviewer.
Judge only the asked task. Do not enforce unrelated extras.
If the submission satisfies the current task intent, mark it correct.
Accept valid alternative implementations and equivalent commands.
If user's result is achieved with a different method, mark correct.
Return JSON:
{ "status":"correct|partial|wrong","feedback":"","fix":"","correct_code":"" }
`}, { role: "user", content:`Project:${idea}\nTask:${task}\nSubmission:\n${String(userCode || "").slice(0,6000)}` }
]);

const parsed = JSON.parse(completion.choices[0].message.content || "{}");
const rawStatus = String(parsed?.status || "").toLowerCase();
const status = rawStatus.includes("correct") ? "correct" : rawStatus.includes("partial") ? "partial" : "wrong";

res.json({
status,
feedback: parsed?.feedback || "Reviewed.",
fix: parsed?.fix || "",
correct_code: parsed?.correct_code || "",
evidence
});

} catch (err) {
res.status(500).json({ error: err.message });
}
});

/* ===================== LIVE TRY (API TEST) ===================== */

app.post("/live-try", async (req, res) => {
let timeout;
try {
const { command, commands, url, method, headers, body, idea, task, stepTitle } = req.body || {};
const history = idea && task ? getHistory(idea, task) : [];
const latestStep = history[history.length - 1] || {};
const workflowCommand = latestStep?.live_try_commands?.[0] || latestStep?.commands?.[0];
const allCommands = Array.isArray(commands) && commands.length
? commands.filter(Boolean)
: [command || workflowCommand || ""].filter(Boolean);
const session = getSession(idea, task);
const results = [];

for (const item of allCommands) {
const parsed = parseLiveCommand(item);
const finalUrl = String(url || parsed.url || "").trim();
const finalMethod = String(method || parsed.method || "GET").toUpperCase();
const looksLikeHttp = Boolean(finalUrl && /^https?:\/\//i.test(finalUrl));

if (looksLikeHttp) {
if (!LIVE_METHODS.has(finalMethod)) {
results.push({
type: "http",
command: item,
ok: false,
status: 0,
statusText: "Unsupported HTTP method",
url: finalUrl,
method: finalMethod,
body: ""
});
continue;
}

const finalHeaders = { ...(parsed.headers || {}), ...(headers || {}) };
const finalBody = body ?? parsed.body;
const hasBody = finalBody !== undefined && finalBody !== null && finalMethod !== "GET";

if (hasBody && !finalHeaders["Content-Type"]) {
const textBody = typeof finalBody === "string" ? finalBody.trim() : "";
if (textBody.startsWith("{") || textBody.startsWith("[")) {
finalHeaders["Content-Type"] = "application/json";
}
}

const controller = new AbortController();
timeout = setTimeout(() => controller.abort(), 15000);

try {
const response = await fetch(finalUrl, {
method: finalMethod,
headers: finalHeaders,
body: hasBody ? String(finalBody) : undefined,
signal: controller.signal
});
clearTimeout(timeout);
timeout = null;
const responseText = await response.text();
results.push({
type: "http",
command: item,
ok: response.ok,
status: response.status,
statusText: response.statusText,
url: response.url || finalUrl,
method: finalMethod,
body: responseText
});
} catch (err) {
clearTimeout(timeout);
timeout = null;
results.push({
type: "http",
command: item,
ok: false,
status: 0,
statusText: err?.name === "AbortError" ? "Timed out" : "Failed",
url: finalUrl,
method: finalMethod,
body: "",
error: err.message
});
}
continue;
}

const shellResult = await runShellCommand(item, session);
results.push(shellResult);
}

const ok = results.every((r) => r.ok);

res.json({
ok,
tracked: Boolean(idea && task),
stepTitle: stepTitle || latestStep?.step_title || "",
cwd: session.cwd,
results
});

if (idea && task) {
const k = key(idea, task);
const prev = liveTryMemory.get(k) || [];
liveTryMemory.set(k, [
...prev,
{
at: new Date().toISOString(),
stepTitle: stepTitle || latestStep?.step_title || "",
results
}
]);
}
} catch (err) {
const message = err?.name === "AbortError" ? "Live try request timed out." : err.message;
res.status(500).json({ error: message });
} finally {
if (timeout) clearTimeout(timeout);
}
});

/* ===================== RESET ===================== */

app.post("/reset-task", (req, res) => {
const { idea, task } = req.body;
memory.delete(key(idea, task));
res.json({ ok: true });
});

app.listen(PORT, () => console.log("Phantasia backend running on " + PORT));

