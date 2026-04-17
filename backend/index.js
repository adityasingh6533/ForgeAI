import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5001;
const currentFilePath = fileURLToPath(import.meta.url);
const isDirectRun = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === currentFilePath;
const execAsync = promisify(exec);
const LIVE_WORKSPACE_ROOT = process.env.LIVE_WORKSPACE_ROOT || path.resolve(process.cwd(), "..");
const FRONTEND_BUILD_DIR = path.resolve(process.cwd(), "frontend", "build");
const FRONTEND_INDEX_PATH = path.join(FRONTEND_BUILD_DIR, "index.html");
const MONGO_URI = process.env.MONGO_URI || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MAX_COMMAND_LENGTH = 300;
const SHELL_META_PATTERN = /[|&;<>()`$]/;
const BLOCKED_COMMAND_PATTERN = /\b(rm|rmdir|del|format|shutdown|reboot|mkfs|dd|chmod|chown|sudo|powershell|pwsh|cmd|bash|zsh|fish|scp|ssh)\b/i;
const ALLOWED_COMMAND_PREFIXES = [
  "cd ",
  "npm ",
  "pnpm ",
  "yarn ",
  "node ",
  "python ",
  "pytest",
  "jest",
  "vitest",
  "go test",
  "cargo test",
  "curl ",
  "echo ",
  "mkdir ",
  "touch ",
  "git status",
  "git diff",
  "ls",
  "dir",
  "Get-ChildItem",
  "cat ",
  "type ",
];

app.use(cors());
app.use(express.json({ limit: "4mb" }));

if (fs.existsSync(FRONTEND_BUILD_DIR)) {
app.use(express.static(FRONTEND_BUILD_DIR));
}

/* ===================== HEALTH ===================== */

app.get("/health", (_req, res) => {
res.json({
ok: true,
service: "phantasia-backend",
persistence: mongoEnabled ? "mongodb" : "memory",
aiConfigured: Boolean(OPENAI_API_KEY),
});
});
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/* ===================== PERSISTENT STORE ===================== */

const sessionSchema = new mongoose.Schema(
  {
    idea: { type: String, required: true },
    task: { type: String, required: true },
    history: { type: [mongoose.Schema.Types.Mixed], default: [] },
    liveAttempts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    reviewEvents: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);
sessionSchema.index({ idea: 1, task: 1 }, { unique: true });

const TaskSession = mongoose.models.TaskSession || mongoose.model("TaskSession", sessionSchema);

let mongoEnabled = false;

async function initPersistentStore() {
  if (!MONGO_URI) {
    console.warn("MONGO_URI not set. Running with in-memory session state.");
    return;
  }
  try {
    await mongoose.connect(MONGO_URI);
    mongoEnabled = true;
    console.log("MongoDB connected for persistent sessions.");
  } catch (err) {
    mongoEnabled = false;
    console.error("MongoDB connect failed. Falling back to memory store:", err.message);
  }
}

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
if (!openai) {
throw new Error("OPENAI_API_KEY is not configured on the server.");
}
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
const reviewEventMemory = new Map();

async function hydrateSessionIfNeeded(idea, task) {
const sessionKey = key(idea, task);
if (memory.has(sessionKey) || !mongoEnabled) return;
const existing = await TaskSession.findOne({ idea, task }).lean();
if (!existing) return;
memory.set(sessionKey, Array.isArray(existing.history) ? existing.history : []);
liveTryMemory.set(sessionKey, Array.isArray(existing.liveAttempts) ? existing.liveAttempts : []);
reviewEventMemory.set(sessionKey, Array.isArray(existing.reviewEvents) ? existing.reviewEvents : []);
}

async function getHistoryAsync(idea, task) {
await hydrateSessionIfNeeded(idea, task);
return memory.get(key(idea, task)) || [];
}

const getHistory = (idea, task) => memory.get(key(idea, task)) || [];

async function pushHistory(idea, task, step) {
const sessionKey = key(idea, task);
const prev = memory.get(sessionKey) || [];
const next = [...prev, step].slice(-40);
memory.set(sessionKey, next);
if (!mongoEnabled) return;
await TaskSession.findOneAndUpdate(
  { idea, task },
  { $set: { history: next }, $setOnInsert: { idea, task } },
  { upsert: true, new: false }
);
}

async function pushLiveAttempt(idea, task, attempt) {
const sessionKey = key(idea, task);
const prev = liveTryMemory.get(sessionKey) || [];
const next = [...prev, attempt].slice(-30);
liveTryMemory.set(sessionKey, next);
if (!mongoEnabled) return;
await TaskSession.findOneAndUpdate(
  { idea, task },
  { $set: { liveAttempts: next }, $setOnInsert: { idea, task } },
  { upsert: true, new: false }
);
}

async function pushReviewEvent(idea, task, event) {
const sessionKey = key(idea, task);
const prev = reviewEventMemory.get(sessionKey) || [];
const next = [...prev, event].slice(-30);
reviewEventMemory.set(sessionKey, next);
if (!mongoEnabled) return;
await TaskSession.findOneAndUpdate(
  { idea, task },
  { $set: { reviewEvents: next }, $setOnInsert: { idea, task } },
  { upsert: true, new: false }
);
}

async function getSessionContextAsync(idea, task) {
await hydrateSessionIfNeeded(idea, task);
const sessionKey = key(idea, task);
const history = memory.get(sessionKey) || [];
const liveAttempts = liveTryMemory.get(sessionKey) || [];
const reviewEvents = reviewEventMemory.get(sessionKey) || [];
return {
  history,
  liveAttempts,
  reviewEvents,
  latestHistory: history[history.length - 1] || null,
  latestLive: liveAttempts[liveAttempts.length - 1] || null,
  latestReview: reviewEvents[reviewEvents.length - 1] || null,
};
}

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

function extractKeywords(input = "") {
const text = String(input || "")
  .toLowerCase()
  .replace(/[^a-z0-9_\-/.\s]/g, " ");
const words = text.split(/\s+/).filter(Boolean);
const set = new Set();
for (const word of words) {
  if (word.length < 4) continue;
  if (["this", "that", "with", "from", "into", "have", "your", "step", "task", "code", "file", "json"].includes(word)) continue;
  set.add(word);
}
return set;
}

function overlapScore(aSet, bSet) {
if (!aSet.size || !bSet.size) return 0;
let hit = 0;
for (const token of aSet) {
  if (bSet.has(token)) hit += 1;
}
return hit;
}

function evaluateContextMatch(userCode = "", step = {}, task = "") {
const submissionTokens = extractKeywords(userCode);
const contextText = [
  task || "",
  step?.step_title || "",
  step?.instruction || "",
  step?.where_to_do || "",
  step?.file_path || "",
  step?.expected_result || "",
].join(" ");

const contextTokens = extractKeywords(contextText);
const commandTokens = extractKeywords(Array.isArray(step?.commands) ? step.commands.join(" ") : "");
const liveTokens = extractKeywords(Array.isArray(step?.live_try_commands) ? step.live_try_commands.join(" ") : "");
const filePath = String(step?.file_path || "").trim().toLowerCase();

const contextOverlap = overlapScore(contextTokens, submissionTokens);
const commandOverlap = overlapScore(commandTokens, submissionTokens);
const liveOverlap = overlapScore(liveTokens, submissionTokens);
const mentionsFilePath = filePath ? String(userCode || "").toLowerCase().includes(filePath) : false;

return {
  contextOverlap,
  commandOverlap,
  liveOverlap,
  mentionsFilePath,
  score: contextOverlap + commandOverlap + liveOverlap + (mentionsFilePath ? 2 : 0),
};
}

async function getLatestLiveTryForStep(idea, task, stepTitle = "") {
await hydrateSessionIfNeeded(idea, task);
const attempts = liveTryMemory.get(key(idea, task)) || [];
if (!attempts.length) return null;
if (!stepTitle) return attempts[attempts.length - 1];

const target = String(stepTitle || "").trim().toLowerCase();
for (let i = attempts.length - 1; i >= 0; i -= 1) {
  const current = attempts[i];
  if (String(current?.stepTitle || "").trim().toLowerCase() === target) {
    return current;
  }
}
return null;
}

function hasExecutableCommands(commands = []) {
return Array.isArray(commands) && commands.some((cmd) => {
  const text = String(cmd || "").trim().toLowerCase();
  if (!text) return false;
  return !/^echo\b/.test(text);
});
}

function hasStepLiveCommands(step = {}) {
return hasExecutableCommands(step?.live_try_commands);
}

function hasStrongAnchors(context = {}) {
return Boolean(
  context.mentionsFilePath ||
  context.commandOverlap > 0 ||
  context.liveOverlap > 0
);
}

function buildDeterministicReview({ evidence, context, liveAttempt, requiresLive }) {
const hasLiveAttempt = Boolean(liveAttempt && Array.isArray(liveAttempt.results));
const livePass = hasLiveAttempt ? liveAttempt.results.every((r) => r?.ok) : false;
const contextStrong = context.score >= 5;
const contextBasic = context.score >= 3;
const evidenceStrong = evidence.score >= 5;
const evidenceBasic = evidence.ok;
const strongAnchors = hasStrongAnchors(context);

let status = "wrong";
let feedback = "Proof does not clearly match this step yet.";
let fix = "Include step-specific code, commands, and expected result evidence.";

if (!requiresLive && evidenceStrong && contextStrong && strongAnchors) {
  status = "correct";
  feedback = "Deterministic checks passed with strong context match and concrete proof.";
  fix = "";
} else if (requiresLive && livePass && evidenceBasic && contextBasic && strongAnchors) {
  status = "correct";
  feedback = "Deterministic checks passed with matching proof and successful live execution.";
  fix = "";
} else if ((evidenceBasic && contextBasic) || (evidenceStrong && context.score >= 2)) {
  status = "partial";
  feedback = requiresLive
    ? "Evidence exists but live verification is required for final acceptance."
    : "Evidence exists but context alignment is incomplete.";
  fix = requiresLive
    ? "Run Live Try for this step and submit updated proof/output."
    : "Add exact file-path proof and command output for this step.";
} else if (!evidence.ok) {
  status = "wrong";
  feedback = evidence.reason || "Submission lacks concrete proof.";
  fix = "Share step-specific code block and command output.";
}

return {
  status,
  feedback,
  fix,
  correct_code: "",
  checks: {
    evidence,
    context,
    requiresLive,
    hasLiveAttempt,
    livePass,
  },
};
}

function sanitizeRelativePath(rawPath = "") {
const value = String(rawPath || "")
  .trim()
  .replace(/^["']|["']$/g, "")
  .replace(/\\/g, "/");
if (!value || value === ".") return "";
if (value.includes("..")) return "";
if (path.isAbsolute(value)) return "";
  return value;
}

function writeFileFromEcho(command = "", session) {
  const match = command.match(/^echo\s+(["'`])([\s\S]+?)\1\s*>\s*([^\s]+)$/i);
  if (!match) return null;
  const [, , payload, targetRaw] = match;
  const target = sanitizeRelativePath(targetRaw);
  if (!target) {
    return {
      type: "shell",
      command,
      ok: false,
      code: 1,
      cwd: session.cwd,
      stdout: "",
      stderr: "Invalid target path for echo redirect.",
      error: "Invalid target path."
    };
  }
  const absolute = path.resolve(session.cwd, target);
  if (!isInsideWorkspace(absolute)) {
    return {
      type: "shell",
      command,
      ok: false,
      code: 1,
      cwd: session.cwd,
      stdout: "",
      stderr: "Target path outside workspace.",
      error: "Invalid target path."
    };
  }
  try {
    if (/[&|;]/.test(payload)) {
      return {
        type: "shell",
        command,
        ok: false,
        code: 1,
        cwd: session.cwd,
        stdout: "",
        stderr: "Payload contains illegal characters.",
        error: "Payload rejected."
      };
    }
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, payload + "\n", "utf-8");
    return {
      type: "shell",
      command,
      ok: true,
      code: 0,
      cwd: session.cwd,
      stdout: `Wrote ${target}`,
      stderr: ""
    };
  } catch (err) {
    return {
      type: "shell",
      command,
      ok: false,
      code: err?.code || 1,
      cwd: session.cwd,
      stdout: "",
      stderr: err?.message || "Failed to write file from echo.",
      error: err?.message || "Write failed"
    };
  }
}

function splitCommandArgs(command = "") {
  if (!command || typeof command !== "string") return [];
  const args = [];
  let buffer = "";
  let quote = null;
  let escape = false;

  const pushBuffer = () => {
    if (buffer) args.push(buffer);
    buffer = "";
  };

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (escape) {
      buffer += char;
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        buffer += char;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      pushBuffer();
      continue;
    }
    buffer += char;
  }

  pushBuffer();
  return args;
}

function resolvePortableTarget(session, rawTarget) {
  const normalized = sanitizeRelativePath(rawTarget);
  if (!normalized) return null;
  const absolute = path.resolve(session.cwd, normalized);
  if (!isInsideWorkspace(absolute)) return null;
  return { normalized, absolute };
}

function runPortableMkdir(command = "", session) {
  const parts = splitCommandArgs(command);
  if (!parts.length || parts[0].toLowerCase() !== "mkdir") return null;

  const targets = parts.slice(1).filter((part) => part && part !== "-p");
  if (!targets.length) {
    return {
      type: "shell",
      command,
      ok: false,
      code: 1,
      cwd: session.cwd,
      stdout: "",
      stderr: "mkdir target missing.",
      error: "mkdir target missing."
    };
  }

  try {
    const created = [];
    for (const rawTarget of targets) {
      const target = resolvePortableTarget(session, rawTarget);
      if (!target) {
        return {
          type: "shell",
          command,
          ok: false,
          code: 1,
          cwd: session.cwd,
          stdout: "",
          stderr: `Invalid directory path: ${rawTarget}`,
          error: "Invalid directory path."
        };
      }
      fs.mkdirSync(target.absolute, { recursive: true });
      created.push(target.normalized);
    }

    return {
      type: "shell",
      command,
      ok: true,
      code: 0,
      cwd: session.cwd,
      stdout: `Directory ready: ${created.join(", ")}`,
      stderr: ""
    };
  } catch (err) {
    return {
      type: "shell",
      command,
      ok: false,
      code: err?.code || 1,
      cwd: session.cwd,
      stdout: "",
      stderr: err?.message || "mkdir failed.",
      error: err?.message || "mkdir failed."
    };
  }
}

function runPortableTouch(command = "", session) {
  const parts = splitCommandArgs(command);
  if (!parts.length || parts[0].toLowerCase() !== "touch") return null;

  const targets = parts.slice(1).filter(Boolean);
  if (!targets.length) {
    return {
      type: "shell",
      command,
      ok: false,
      code: 1,
      cwd: session.cwd,
      stdout: "",
      stderr: "touch target missing.",
      error: "touch target missing."
    };
  }

  try {
    const touched = [];
    const now = new Date();
    for (const rawTarget of targets) {
      const target = resolvePortableTarget(session, rawTarget);
      if (!target) {
        return {
          type: "shell",
          command,
          ok: false,
          code: 1,
          cwd: session.cwd,
          stdout: "",
          stderr: `Invalid file path: ${rawTarget}`,
          error: "Invalid file path."
        };
      }
      fs.mkdirSync(path.dirname(target.absolute), { recursive: true });
      if (!fs.existsSync(target.absolute)) {
        fs.writeFileSync(target.absolute, "", "utf-8");
      }
      fs.utimesSync(target.absolute, now, now);
      touched.push(target.normalized);
    }

    return {
      type: "shell",
      command,
      ok: true,
      code: 0,
      cwd: session.cwd,
      stdout: `File ready: ${touched.join(", ")}`,
      stderr: ""
    };
  } catch (err) {
    return {
      type: "shell",
      command,
      ok: false,
      code: err?.code || 1,
      cwd: session.cwd,
      stdout: "",
      stderr: err?.message || "touch failed.",
      error: err?.message || "touch failed."
    };
  }
}

function runPortableFilesystemCommand(command = "", session) {
  return runPortableMkdir(command, session) || runPortableTouch(command, session);
}

function inferWhereToDoFromCommands(commands = []) {
if (!Array.isArray(commands)) return "";
for (const cmd of commands) {
  const match = String(cmd || "").trim().match(/^cd\s+(.+)$/i);
  if (!match) continue;
  const candidate = sanitizeRelativePath(match[1]);
  if (candidate) return candidate;
}
return "";
}

function inferLiveTryCommands(commands = []) {
if (!Array.isArray(commands)) return [];
const preferred = commands.filter((cmd) => {
  const text = String(cmd || "").toLowerCase();
  return /(test|pytest|jest|vitest|curl|http|npm run|node|python|go test|cargo test)/.test(text);
});
const source = preferred.length ? preferred : commands;
return source
  .map((cmd) => String(cmd || "").trim())
  .filter(Boolean)
  .slice(0, 3);
}

function normalizeTaskGuide(raw = {}, task = "") {
const stepTitle = String(raw?.step_title || task || "Implementation Step").trim();
const instruction = String(raw?.instruction || "").trim();
const commands = Array.isArray(raw?.commands)
  ? raw.commands.map((cmd) => String(cmd || "").trim()).filter(Boolean)
  : [];
const filePath = sanitizeRelativePath(raw?.file_path || "");
const whereFromFile = filePath ? sanitizeRelativePath(path.posix.dirname(filePath)) : "";
const whereFromCommands = inferWhereToDoFromCommands(commands);
const whereToDo = sanitizeRelativePath(raw?.where_to_do || "") || whereFromCommands || whereFromFile || ".";
const liveTry = hasExecutableCommands(raw?.live_try_commands)
  ? raw.live_try_commands.map((cmd) => String(cmd || "").trim()).filter(Boolean).slice(0, 3)
  : inferLiveTryCommands(commands);

return {
  step_title: stepTitle,
  where_to_do: whereToDo,
  instruction: instruction || `Complete: ${stepTitle}`,
  commands,
  live_try_commands: liveTry,
  file_path: filePath || "",
  code: String(raw?.code || ""),
  previewHtml: String(raw?.previewHtml || ""),
  expected_result: String(raw?.expected_result || ""),
  next_hint: String(raw?.next_hint || ""),
};
}

function normalizeReviewStepContext(raw = {}) {
if (!raw || typeof raw !== "object") return null;
return normalizeTaskGuide(raw, raw?.step_title || "Implementation Step");
}

function buildCorrectionPack(step = {}) {
const expectedCommands = Array.isArray(step?.commands) ? step.commands.filter(Boolean) : [];
const liveTryCommands = Array.isArray(step?.live_try_commands) ? step.live_try_commands.filter(Boolean) : [];
const pieces = [];

if (step?.file_path) {
  pieces.push(`Target file: ${step.file_path}`);
}
if (expectedCommands.length) {
  pieces.push(`Expected commands:\n${expectedCommands.map((c) => `- ${c}`).join("\n")}`);
}
if (liveTryCommands.length) {
  pieces.push(`Live verify commands:\n${liveTryCommands.map((c) => `- ${c}`).join("\n")}`);
}
if (step?.expected_result) {
  pieces.push(`Expected result: ${step.expected_result}`);
}
if (step?.code) {
  pieces.push(`Reference implementation:\n${step.code}`);
}

return pieces.join("\n\n");
}

/* ===================== LIVE TRY HELPERS ===================== */

const LIVE_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_LIVE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const getSession = (idea, task) => {
const sessionKey = key(idea || "global", task || "global");
if (!liveShellSessions.has(sessionKey)) {
liveShellSessions.set(sessionKey, { cwd: LIVE_WORKSPACE_ROOT });
}
return liveShellSessions.get(sessionKey);
};

function isInsideWorkspace(targetPath) {
const root = path.resolve(LIVE_WORKSPACE_ROOT);
const candidate = path.resolve(targetPath);
const relative = path.relative(root, candidate);
return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isAllowedLiveUrl(rawUrl = "") {
try {
  const parsed = new URL(String(rawUrl || "").trim());
  return ALLOWED_LIVE_HOSTS.has(parsed.hostname) || parsed.hostname.endsWith(".localhost");
} catch {
  return false;
}
}

function isAllowedShellCommand(raw = "") {
const command = String(raw || "").trim();
if (!command) return false;
if (command.length > MAX_COMMAND_LENGTH) return false;
if (SHELL_META_PATTERN.test(command)) return false;
if (BLOCKED_COMMAND_PATTERN.test(command)) return false;
return ALLOWED_COMMAND_PREFIXES.some((prefix) => command.startsWith(prefix));
}

const asAbsoluteDir = (baseCwd, rawPath) => {
if (!rawPath) return baseCwd;
if (path.isAbsolute(rawPath)) return path.normalize(rawPath);
return path.normalize(path.resolve(baseCwd, rawPath));
};

const normalizeWorkspacePath = (rawPath = "") =>
String(rawPath || "")
  .trim()
  .replace(/^["']|["']$/g, "")
  .replace(/\\/g, "/");

function resolveWorkspaceDir(whereToDo = "") {
const candidate = normalizeWorkspacePath(whereToDo);
if (!candidate) return null;
if (path.isAbsolute(candidate)) return null;
if (candidate.includes("..")) return null;

const checks = [
  path.resolve(LIVE_WORKSPACE_ROOT, candidate),
];

for (const dir of checks) {
  if (isInsideWorkspace(dir) && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    return path.normalize(dir);
  }
}

return null;
}

function detectCommandTimeout(command = "") {
const text = String(command || "").toLowerCase();
if (/(npm|pnpm|yarn)\s+(install|ci|build|test)/.test(text)) return 120000;
if (/(pytest|jest|vitest|go test|cargo test|mvn test|gradle test)/.test(text)) return 120000;
if (/(npm|pnpm|yarn)\s+run\s+dev/.test(text)) return 30000;
return 45000;
}

async function runShellCommand(rawCommand, session) {
const command = String(rawCommand || "").trim();
if (!command) {
return { type: "shell", command, ok: false, error: "Empty command", cwd: session.cwd };
}

const portableResult = runPortableFilesystemCommand(command, session);
if (portableResult) {
return portableResult;
}

if (!isAllowedShellCommand(command)) {
return {
type: "shell",
command,
ok: false,
code: 1,
cwd: session.cwd,
stdout: "",
stderr: "",
error: "Blocked command. Only safe workspace commands are allowed."
};
}

const cdMatch = command.match(/^cd\s+(.+)$/i);
if (cdMatch) {
const target = cdMatch[1].trim().replace(/^["']|["']$/g, "");
const nextDir = asAbsoluteDir(session.cwd, target);
if (!isInsideWorkspace(nextDir)) {
return {
type: "shell",
command,
ok: false,
code: 1,
cwd: session.cwd,
stdout: "",
stderr: "",
error: "Directory is outside the configured workspace root."
};
}
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
timeout: detectCommandTimeout(command),
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

function splitShellCommands(command = "") {
  if (!command || typeof command !== "string") return [];
  const segments = [];
  let buffer = "";
  let quote = null;
  let escape = false;

  const pushSegment = () => {
    const trimmed = buffer.trim();
    if (trimmed) segments.push(trimmed);
    buffer = "";
  };

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (escape) {
      buffer += char;
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      buffer += char;
      continue;
    }
    if (quote) {
      buffer += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      buffer += char;
      continue;
    }
    if (char === ";" || (char === "&" && command[i + 1] === "&") || (char === "|" && command[i + 1] === "|")) {
      pushSegment();
      if ((char === "&" || char === "|") && command[i + 1] === char) {
        i += 1;
      }
      continue;
    }
    buffer += char;
  }

  pushSegment();
  return segments;
}

/* ===================== REPO-AWARE CHECKS ===================== */

function truncateText(input = "", max = 700) {
const text = String(input || "");
if (text.length <= max) return text;
return `${text.slice(0, max)}...`;
}

function normalizeGitPath(raw = "") {
return String(raw || "").trim().replace(/\\/g, "/");
}

async function getRepoSignals(step = {}, userCode = "") {
const workspace = path.resolve(LIVE_WORKSPACE_ROOT);
const targetFile = sanitizeRelativePath(step?.file_path || "");
const response = {
  workspace,
  targetFile,
  targetFileExists: false,
  fileTouchedInGit: false,
  changedFiles: [],
  targetDiffPreview: "",
  userMentionsTarget: false,
};

if (targetFile) {
  const absolute = path.resolve(workspace, targetFile);
  response.targetFileExists = fs.existsSync(absolute) && fs.statSync(absolute).isFile();
  response.userMentionsTarget = String(userCode || "").toLowerCase().includes(targetFile.toLowerCase());
}

try {
  const { stdout } = await execAsync("git status --porcelain", {
    cwd: workspace,
    timeout: 12000,
    maxBuffer: 1024 * 1024,
  });
  const changedFiles = String(stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => normalizeGitPath(line.slice(3).trim()));
  response.changedFiles = changedFiles.slice(0, 120);
  if (targetFile) {
    response.fileTouchedInGit = changedFiles.some((p) => p === targetFile || p.endsWith(`/${targetFile}`));
  }
} catch (err) {
  response.gitStatusError = truncateText(err?.message || "git status failed", 220);
}

if (targetFile && response.fileTouchedInGit) {
  try {
    const { stdout } = await execAsync(`git diff -- "${targetFile}"`, {
      cwd: workspace,
      timeout: 12000,
      maxBuffer: 1024 * 1024,
    });
    response.targetDiffPreview = truncateText(stdout, 900);
  } catch (err) {
    response.gitDiffError = truncateText(err?.message || "git diff failed", 220);
  }
}

return response;
}

async function runCommandWithCapture(command, cwd, timeout = 90000) {
try {
  const { stdout, stderr } = await execAsync(command, {
    cwd,
    timeout,
    maxBuffer: 1024 * 1024,
  });
  return {
    command,
    ok: true,
    stdout: truncateText(stdout, 900),
    stderr: truncateText(stderr, 600),
  };
} catch (err) {
  return {
    command,
    ok: false,
    stdout: truncateText(err?.stdout, 900),
    stderr: truncateText(err?.stderr || err?.message, 700),
  };
}
}

function resolveAutoCheckDir(step = {}) {
const whereToDo = sanitizeRelativePath(step?.where_to_do || "");
const filePath = sanitizeRelativePath(step?.file_path || "");
const candidate = whereToDo || (filePath ? path.posix.dirname(filePath) : "");
if (!candidate || candidate === ".") return null;
const absolute = path.resolve(LIVE_WORKSPACE_ROOT, candidate);
if (!absolute.startsWith(path.resolve(LIVE_WORKSPACE_ROOT))) return null;
if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) return null;
return absolute;
}

async function runAutoChecksForStep(step = {}) {
const rootDir = resolveAutoCheckDir(step) || path.resolve(LIVE_WORKSPACE_ROOT);
const packageJsonPath = path.join(rootDir, "package.json");
const checks = [];

if (fs.existsSync(packageJsonPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const scripts = pkg?.scripts || {};
    if (scripts.lint) {
      checks.push(await runCommandWithCapture("npm run lint", rootDir, 120000));
    } else if (scripts.test) {
      checks.push(await runCommandWithCapture("npm run test -- --watchAll=false --passWithNoTests", rootDir, 120000));
    } else if (scripts.build) {
      checks.push(await runCommandWithCapture("npm run build", rootDir, 120000));
    }
  } catch (err) {
    checks.push({
      command: "package-json-parse",
      ok: false,
      stdout: "",
      stderr: truncateText(err?.message || "Failed to parse package.json", 400),
    });
  }
}

const targetFile = sanitizeRelativePath(step?.file_path || "");
if (targetFile && /\.(m?js|cjs)$/i.test(targetFile)) {
  const absoluteTarget = path.resolve(LIVE_WORKSPACE_ROOT, targetFile);
  if (fs.existsSync(absoluteTarget) && fs.statSync(absoluteTarget).isFile()) {
    checks.push(await runCommandWithCapture(`node --check "${absoluteTarget}"`, path.dirname(absoluteTarget), 30000));
  }
}

const executed = checks.length;
const passed = checks.filter((c) => c.ok).length;
const failed = executed - passed;

return {
  rootDir,
  executed,
  passed,
  failed,
  checks,
  summary: executed === 0
    ? "No auto-check target detected for this step."
    : failed === 0
      ? `All ${executed} auto-check(s) passed.`
      : `${failed}/${executed} auto-check(s) failed.`,
};
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
if (!idea || !task) {
return res.status(400).json({ error: "idea and task are required." });
}

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
if (!idea || !task) {
return res.status(400).json({ error: "idea and task are required." });
}

const session = await getSessionContextAsync(idea, task);
const history = session.history;

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
- "where_to_do" must be a valid project-relative directory (example: "frontend", "backend", "src/components")
- "file_path" must be a valid project-relative path (example: "frontend/src/App.jsx")
- if UI step exists, include renderable HTML in "previewHtml"
- include at least one concrete command in "live_try_commands" for every executable step
- do not include generic advice without actionable code/commands
`
  },
  {
    role: "user",
    content: `Project:${idea}\nTask:${task}\nHistory:${JSON.stringify(history)}\nLatestLiveTry:${JSON.stringify(session.latestLive || {})}\nLatestReviewSignal:${JSON.stringify(session.latestReview || {})}`
  }
  ]);
  
  const json = JSON.parse(completion.choices[0].message.content);
  const normalized = normalizeTaskGuide(json, task);
  await pushHistory(idea, task, normalized);
  res.json(normalized);
  } catch (err) {
  res.status(500).json({ error: err.message });
  }
  });

/* ===================== TASK CHAT (FOCUSED) ===================== */

app.post("/task-chat", async (req, res) => {
try {
const { idea, task, message, currentStep, userCode } = req.body;
if (!idea || !task || !message) {
return res.status(400).json({ error: "idea, task, and message are required." });
}
const session = await getSessionContextAsync(idea, task);
const history = session.history;
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
    content: `Project:${idea}\nTask:${task}\nCurrentStep:${JSON.stringify(stepContext)}\nUserProgress:${String(userCode || "").slice(0,2000)}\nLatestLiveTry:${JSON.stringify(session.latestLive || {})}\nLatestReviewSignal:${JSON.stringify(session.latestReview || {})}\nQuestion:${message}`
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
const { idea, task, userCode, stepContext } = req.body;
if (!idea || !task) {
  return res.status(400).json({
    status: "wrong",
    feedback: "Missing required fields: idea and task.",
    fix: "Send both idea and task in request body.",
    correct_code: "",
    deterministic: true,
  });
}

const evidence = evaluateSubmissionEvidence(userCode);
const history = await getHistoryAsync(idea, task);
const providedStep = normalizeReviewStepContext(stepContext);
const latestStep = providedStep || history[history.length - 1] || {};
if (!latestStep?.step_title) {
  return res.status(400).json({
    status: "wrong",
    feedback: "No active step context found for review.",
    fix: "Load a step via task-guide and send stepContext from frontend.",
    correct_code: "",
    deterministic: true,
  });
}

const context = evaluateContextMatch(userCode, latestStep, task);
const latestLiveAttempt = await getLatestLiveTryForStep(idea, task, latestStep?.step_title || "");
const requiresLive = hasStepLiveCommands(latestStep);
const correctionPack = buildCorrectionPack(latestStep);

if (!evidence.ok) {
  const repo = await getRepoSignals(latestStep, userCode);
  const autoChecks = await runAutoChecksForStep(latestStep);
  await pushReviewEvent(idea, task, {
    at: new Date().toISOString(),
    task,
    stepTitle: latestStep?.step_title || "",
    status: "wrong",
    context,
    evidence,
    repo: {
      targetFile: repo.targetFile,
      targetFileExists: repo.targetFileExists,
      fileTouchedInGit: repo.fileTouchedInGit,
    },
    autoChecks: {
      executed: autoChecks.executed,
      passed: autoChecks.passed,
      failed: autoChecks.failed,
    },
    fix: "Share concrete step proof with code/command output.",
  });
  return res.json({
  status: "wrong",
  feedback: evidence.reason,
  fix: "Share concrete step proof with code/command output.",
  correct_code: correctionPack,
  evidence,
  repo,
  autoChecks,
  checks: {
    context,
    requiresLive,
    hasLiveAttempt: Boolean(latestLiveAttempt),
    livePass: Boolean(latestLiveAttempt && latestLiveAttempt.results?.every((r) => r?.ok)),
  },
  deterministic: true,
  });
}

const repo = await getRepoSignals(latestStep, userCode);
const autoChecks = await runAutoChecksForStep(latestStep);

const result = buildDeterministicReview({
  evidence,
  context,
  liveAttempt: latestLiveAttempt,
  requiresLive,
});

if (result.status !== "correct" && repo.targetFileExists && repo.fileTouchedInGit && repo.targetDiffPreview) {
  result.feedback = `${result.feedback}\nRepo signals detected real file changes for this step.`;
}

await pushReviewEvent(idea, task, {
  at: new Date().toISOString(),
  task,
  stepTitle: latestStep?.step_title || "",
  status: result.status,
  context,
  evidence,
  repo: {
    targetFile: repo.targetFile,
    targetFileExists: repo.targetFileExists,
    fileTouchedInGit: repo.fileTouchedInGit,
  },
  autoChecks: {
    executed: autoChecks.executed,
    passed: autoChecks.passed,
    failed: autoChecks.failed,
  },
  fix: result.fix || "",
});

res.json({
...result,
correct_code: result.status === "correct" ? "" : correctionPack,
evidence,
step_title: latestStep?.step_title || "",
 repo,
 autoChecks,
deterministic: true,
});

} catch (err) {
res.status(500).json({ error: err.message });
}
});

/* ===================== LIVE TRY (API TEST) ===================== */

app.post("/live-try", async (req, res) => {
let timeout;
try {
const {
  command,
  commands,
  url,
  method,
  headers,
  body,
  idea,
  task,
  stepTitle,
  whereToDo,
} = req.body || {};
const history = idea && task ? await getHistoryAsync(idea, task) : [];
const latestStep = history[history.length - 1] || {};
const workflowCommand = latestStep?.live_try_commands?.[0] || latestStep?.commands?.[0];
const allCommands = Array.isArray(commands) && commands.length
? commands.filter(Boolean)
: [command || workflowCommand || ""].filter(Boolean);
if (!allCommands.length) {
return res.status(400).json({ error: "At least one command or URL is required for live try." });
}
const session = getSession(idea, task);
const desiredDir = resolveWorkspaceDir(whereToDo || latestStep?.where_to_do || "");
if (desiredDir) {
  session.cwd = desiredDir;
}
const results = [];

for (const item of allCommands) {
const parsed = parseLiveCommand(item);
const finalUrl = String(url || parsed.url || "").trim();
const finalMethod = String(method || parsed.method || "GET").toUpperCase();
const looksLikeHttp = Boolean(finalUrl && /^https?:\/\//i.test(finalUrl));

if (looksLikeHttp) {
if (!isAllowedLiveUrl(finalUrl)) {
results.push({
type: "http",
command: item,
ok: false,
status: 0,
statusText: "Blocked host",
url: finalUrl,
method: finalMethod,
body: "",
error: "Live Try only allows localhost URLs."
});
continue;
}

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
timeout = setTimeout(() => controller.abort(), 20000);

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

    const shellCommands = splitShellCommands(item);
    for (const safeCommand of shellCommands) {
      const redirected = writeFileFromEcho(safeCommand, session);
      if (redirected) {
        results.push(redirected);
        continue;
      }
      const shellResult = await runShellCommand(safeCommand, session);
      results.push(shellResult);
    }
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
await pushLiveAttempt(idea, task, {
at: new Date().toISOString(),
stepTitle: stepTitle || latestStep?.step_title || "",
results
});
}
} catch (err) {
const message = err?.name === "AbortError" ? "Live try request timed out." : err.message;
res.status(500).json({ error: message });
} finally {
if (timeout) clearTimeout(timeout);
}
});

/* ===================== AUTO CHECKS ===================== */

app.post("/auto-checks", async (req, res) => {
try {
  const { idea, task, stepContext } = req.body || {};
  if (!idea || !task) {
    return res.status(400).json({ error: "idea and task are required." });
  }
  const history = await getHistoryAsync(idea, task);
  const latestStep = normalizeReviewStepContext(stepContext) || history[history.length - 1] || {};
  if (!latestStep?.step_title) {
    return res.status(400).json({ error: "No step context found for auto checks." });
  }

  const autoChecks = await runAutoChecksForStep(latestStep);
  res.json({
    ok: autoChecks.failed === 0,
    step_title: latestStep.step_title,
    autoChecks,
  });
} catch (err) {
  res.status(500).json({ error: err.message });
}
});

/* ===================== SESSION INSIGHTS ===================== */

app.post("/session-insights", async (req, res) => {
try {
  const { idea, task } = req.body || {};
  if (!idea || !task) {
    return res.status(400).json({ error: "idea and task are required." });
  }
  await hydrateSessionIfNeeded(idea, task);
  const sessionKey = key(idea, task);
  const history = memory.get(sessionKey) || [];
  const liveAttempts = liveTryMemory.get(sessionKey) || [];
  const reviews = reviewEventMemory.get(sessionKey) || [];

  const lastReview = reviews[reviews.length - 1] || null;
  const lastLive = liveAttempts[liveAttempts.length - 1] || null;

  res.json({
    ok: true,
    idea,
    task,
    totals: {
      stepsGenerated: history.length,
      liveAttempts: liveAttempts.length,
      reviews: reviews.length,
    },
    latest: {
      review: lastReview,
      live: lastLive,
      step: history[history.length - 1] || null,
    },
  });
} catch (err) {
  res.status(500).json({ error: err.message });
}
});

/* ===================== RESET ===================== */

app.post("/reset-task", async (req, res) => {
const { idea, task } = req.body;
const sessionKey = key(idea, task);
memory.delete(sessionKey);
liveTryMemory.delete(sessionKey);
reviewEventMemory.delete(sessionKey);
liveShellSessions.delete(sessionKey);
if (mongoEnabled) {
  await TaskSession.findOneAndDelete({ idea, task });
}
res.json({ ok: true });
});

app.get("/{*path}", (req, res, next) => {
if (!fs.existsSync(FRONTEND_INDEX_PATH)) {
  return next();
}
if (req.path.startsWith("/api/")) {
  return next();
}
return res.sendFile(FRONTEND_INDEX_PATH);
});

const storeInitPromise = initPersistentStore();

if (isDirectRun) {
storeInitPromise.finally(() => {
app.listen(PORT, () => console.log("Phantasia backend running on " + PORT));
});
}

export default app;

