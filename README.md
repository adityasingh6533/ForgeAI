# ForgeAI

Transform your planning platform into a **live AI execution workspace**.  
Go from **Idea -> Plan -> Implementation -> Validation** in one continuous flow.

## What It Does

ForgeAI is built for makers who don’t want planning and execution in separate tools.

- Task guidance for structured execution
- Interactive chat mentor for context-aware help
- Review system to evaluate progress and output quality
- Live code runner to validate ideas quickly
- End-to-end workflow in one place:
  - Idea
  - Plan
  - Build
  - Validate

## Core Flow

1. Start with a raw idea
2. Break it into an actionable plan
3. Implement with AI-assisted workspace support
4. Run, test, and validate output
5. Iterate fast with feedback loop

## Tech Stack

- Frontend: React
- Backend: Node.js + Express
- Styling: Custom CSS
- AI Integration: API-driven assistant workflow

## Backend Setup

1. Go to `backend`
2. Create `.env` from `.env.example`
3. Set:
   - `OPENAI_API_KEY`
   - `MONGO_URI` (required for persistent session memory; if missing, backend runs in memory mode)
4. Start backend: `npm run dev`

Health check:
- `GET /health` now returns `persistence: "mongodb"` or `persistence: "memory"`

## Project Structure

```txt
.
├─ backend/
│  ├─ index.js
│  ├─ package.json
│  └─ package-lock.json
├─ frontend/
│  ├─ src/
│  │  ├─ pages/
│  │  ├─ components/
│  │  └─ styles/
│  ├─ public/
│  └─ package.json
└─ .gitignore
