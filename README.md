
 # ForgeAI
 
-Transform your planning platform into a **live AI execution workspace**.  
-Go from **Idea -> Plan -> Implementation -> Validation** in one continuous flow.
+ForgeAI is a **live AI execution workspace** that turns ideas into build-ready plans, guided implementation steps, real execution checks, and validation feedback in one loop.
 
-## What It Does
+Instead of splitting thinking and shipping across multiple tools, ForgeAI keeps planning, coding guidance, run-time checks, and review in a single workflow.
 
-ForgeAI is built for makers who don’t want planning and execution in separate tools.
+---
 
-- Task guidance for structured execution
-- Interactive chat mentor for context-aware help
-- Review system to evaluate progress and output quality
-- Live code runner to validate ideas quickly
-- End-to-end workflow in one place:
-  - Idea
-  - Plan
-  - Build
-  - Validate
+## Why ForgeAI is different
 
-## Core Flow
+ForgeAI is not just a planner and not just a chat assistant. It combines:
 
-1. Start with a raw idea
-2. Break it into an actionable plan
-3. Implement with AI-assisted workspace support
-4. Run, test, and validate output
-5. Iterate fast with feedback loop
+- **Structured plan generation** (features, database, APIs, execution steps, and mindmap)
+- **Step-wise implementation guidance** with task memory
+- **Live run validation** (HTTP + guarded shell commands)
+- **Proof-based review** with deterministic quality gates
+- **Execution telemetry + visual intelligence** (kanban/timeline/architecture state)
 
-## Tech Stack
+---
 
-- Frontend: React
-- Backend: Node.js + Express
-- Styling: Custom CSS
-- AI Integration: API-driven assistant workflow
+## Current innovation layer (what’s new)
 
-## Backend Setup
+1. **Single-call plan + mindmap generation**  
+   `/generate-plan` returns structured project output in JSON (summary, features, database, APIs, steps, and hierarchical mindmap) to move from idea to architecture instantly.
 
-1. Go to `backend`
-2. Create `.env` from `.env.example`
-3. Set:
-   - `OPENAI_API_KEY`
-   - `MONGO_URI` (required for persistent session memory; if missing, backend runs in memory mode)
-4. Start backend: `npm run dev`
+2. **Memory-aware coding mentor flow**  
+   `/task-guide` guidance is generated using prior task history, latest live-try signal, and latest review signal for continuity instead of stateless responses.
 
-Health check:
-- `GET /health` now returns `persistence: "mongodb"` or `persistence: "memory"`
+3. **Deterministic proof gate before review AI decisions**  
+   Submissions are first scored for evidence quality (length + code/command/change signals) and context match to reduce low-signal or generic proof.
 
-## Project Structure
+4. **Live Try execution engine with safety constraints**  
+   `/live-try` supports both:
+   - HTTP execution (method/url/body/headers)
+   - Guarded shell execution with command restrictions and workspace-aware directory handling
+
+5. **Step-level auto-check execution**  
+   `/auto-checks` runs inferred checks for the active step and returns pass/fail summaries to increase validation confidence.
+
+6. **Session persistence + insight API**  
+   Session history, live attempts, and review events are stored in MongoDB when configured, with in-memory fallback. `/session-insights` exposes totals + latest review/live/step snapshots.
+
+7. **Visual execution intelligence via event bus**  
+   Board actions emit events into the AI brain layer and drive timeline/kanban/architecture views, with risk/quality/progress signals and optimization insight generation.
+
+8. **Integrated live preview panel for UI steps**  
+   Task guide can send `previewHtml`; frontend renders it in sandboxed iframe with command/result overlays for quick UI validation.
+
+---
+
+## Product flow
+
+1. **Home**: user enters project idea
+2. **Thinking**: app generates plan from backend AI
+3. **Plan**: visualizes architecture and execution graph
+4. **Board**: user executes tasks with briefs, guides, live try, reviews
+5. **Generate/Iterate**: repeat with feedback and validations
+
+---
+
+## Tech stack
+
+- **Frontend**: React + React Router + React Flow + custom CSS
+- **Backend**: Node.js + Express
+- **AI**: OpenAI Chat Completions (JSON-mode responses)
+- **Persistence**: MongoDB via Mongoose (optional but recommended)
+
+---
+
+## Repository structure
 
 ```txt
 .
 ├─ backend/
 │  ├─ index.js
 │  ├─ package.json
 │  └─ package-lock.json
 ├─ frontend/
+│  ├─ public/
 │  ├─ src/
-│  │  ├─ pages/
+│  │  ├─ ai/
 │  │  ├─ components/
+│  │  ├─ pages/
 │  │  └─ styles/
-│  ├─ public/
 │  └─ package.json
-└─ .gitignore
+└─ README.md
+```
+
+---
+
+## Backend API surface
+
+### Health
+- `GET /health`  
+  Returns service status and persistence mode (`mongodb` or `memory`).
+
+### Planning and guidance
+- `POST /generate-plan`
+- `POST /task-brief`
+- `POST /task-guide`
+- `POST /task-chat`
+
+### Validation and execution
+- `POST /review-task`
+- `POST /live-try`
+- `POST /auto-checks`
+
+### Session intelligence
+- `POST /session-insights`
+- `POST /reset-task`
+
+---
+
+## Environment variables
+
+Create `backend/.env` from `backend/.env.example` and set:
+
+- `OPENAI_API_KEY` (**required**)
+- `OPENAI_MODEL` (optional override)
+- `PORT` (optional, defaults to `5001`)
+- `MONGO_URI` (optional; enables persistent sessions)
+- `LIVE_WORKSPACE_ROOT` (optional; workspace root for Live Try shell commands)
+
+If `MONGO_URI` is missing/unavailable, backend automatically runs with in-memory state.
+
+---
+
+## Local setup
+
+### 1) Backend
+
+```bash
+cd backend
+npm install
+npm run dev
+```
+
+### 2) Frontend
+
+```bash
+cd frontend
+npm install
+npm start
+```
+
+Frontend runs on CRA default port and should call backend via:
+
+- `REACT_APP_API_URL` (optional)
+- default fallback: `http://localhost:5001`
+
+---
+
+## Notes on validation model
+
+ForgeAI’s validation loop is intentionally multi-layered:
+
+1. Quick deterministic checks on proof quality
+2. Context-match checks against active step/task
+3. Live execution telemetry (when available)
+4. Auto-check execution summary
+5. AI review output + fix guidance
+
+This improves reliability versus “chat-only” validation.
+
+---
+
+## Status
+
+ForgeAI currently provides a strong end-to-end loop for:
+
+- Idea-to-plan generation
+- Guided implementation
+- Real command/API validation
+- Review and iteration with task memory
+
+Next maturity gains should focus on stronger test orchestration, richer repo-aware diffs, and deeper team collaboration features.
 
EOF
)
