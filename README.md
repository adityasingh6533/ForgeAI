# ForgeAI

ForgeAI is a live AI execution workspace that turns ideas into build-ready plans, guided implementation steps, real execution checks, and validation feedback in one loop.

Instead of splitting thinking and shipping across multiple tools, ForgeAI keeps planning, coding guidance, run-time checks, and review in a single workflow.

## Why ForgeAI is different

ForgeAI combines:

- Structured plan generation
- Step-wise implementation guidance with task memory
- Live run validation
- Proof-based review with deterministic quality gates
- Execution telemetry and visual intelligence

## Current innovation layer

1. `/generate-plan` returns structured JSON with summary, features, database, APIs, steps, and mindmap.
2. `/task-guide` uses prior task history, latest live-try signal, and latest review signal for continuity.
3. Review flow scores proof quality and context match before deeper validation.
4. `/live-try` supports guarded HTTP and shell execution with workspace-aware constraints.
5. `/auto-checks` runs inferred checks for the active step and returns pass/fail summaries.
6. Session history, live attempts, and review events persist in MongoDB when configured, with memory fallback.
7. Board actions feed timeline, kanban, and architecture views through the brain event layer.
8. UI steps can render `previewHtml` in a sandboxed live preview panel.

## Product flow

1. Home: enter the project idea
2. Thinking: generate the plan from the backend AI
3. Plan: visualize architecture and execution graph
4. Board: execute tasks with briefs, guides, live try, and reviews
5. Iterate: repeat with feedback and validations

## Tech stack

- Frontend: React, React Router, React Flow, custom CSS
- Backend: Node.js, Express
- AI: OpenAI Chat Completions with JSON responses
- Persistence: MongoDB via Mongoose

## Backend API surface

- `GET /health`
- `POST /generate-plan`
- `POST /task-brief`
- `POST /task-guide`
- `POST /task-chat`
- `POST /review-task`
- `POST /live-try`
- `POST /auto-checks`
- `POST /session-insights`
- `POST /reset-task`

## Environment variables

Create `backend/.env` from `backend/.env.example` and set:

- `OPENAI_API_KEY` required
- `OPENAI_MODEL` optional
- `PORT` optional, defaults to `5001`
- `MONGO_URI` optional, enables persistent sessions
- `LIVE_WORKSPACE_ROOT` optional, used by Live Try shell commands

If `MONGO_URI` is missing, the backend falls back to in-memory state.

## Local setup

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm start
```

Frontend can use `REACT_APP_API_URL`; locally it falls back to `http://localhost:5001`.

## Vercel deploy

This repo is configured for a single Vercel project:

- `frontend/` builds as the site UI
- `api/[...route].js` loads the Express backend as a Vercel function
- production frontend requests use `/api`

Required Vercel environment variables:

- `OPENAI_API_KEY`
- `MONGO_URI` optional but recommended
- `OPENAI_MODEL` optional
- `LIVE_WORKSPACE_ROOT` optional

Deploy flow:

1. Import the repo into Vercel or run `vercel`
2. Set the environment variables in the Vercel project
3. Deploy from the repo root

## Repository structure

```txt
.
├─ api/
│  └─ [...route].js
├─ backend/
│  ├─ index.js
│  ├─ package.json
│  └─ package-lock.json
├─ frontend/
│  ├─ public/
│  ├─ src/
│  │  ├─ ai/
│  │  ├─ components/
│  │  ├─ pages/
│  │  └─ styles/
│  └─ package.json
├─ vercel.json
└─ .gitignore
```
