 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/README.md b/README.md
index b2da7540ba5c53a6ebb9e6208bafdd2f8de52c77..5d8fa082457c6e34d42cff207ede666faed8fa15 100644
--- a/README.md
+++ b/README.md
@@ -1,44 +1,55 @@
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
 
+## What's New in ForgeAI (Current Innovation Layer)
+
+- **AI-generated plan + mindmap output in one call**: the planner now produces structured features, API/database outlines, execution steps, and a hierarchical mindmap JSON for instant architecture visibility.
+- **Step-by-step coding mentor with memory-aware guidance**: task guidance adapts using stored step history, latest live execution attempts, and latest review signals.
+- **Deterministic proof-quality gate before AI review**: submissions are first evaluated with rule-based evidence and context matching checks so low-signal proofs are blocked early.
+- **Live Try execution engine for real validation**: supports guarded shell commands plus HTTP request execution, captures per-command pass/fail diagnostics, and tracks workspace directory context.
+- **Automatic step-level checks**: runs local file/test checks inferred from step context and reports pass/fail summaries.
+- **Session intelligence + persistence**: each task session stores history, live attempts, and review events (MongoDB when configured, in-memory fallback otherwise), and exposes session-insight endpoints for progress telemetry.
+- **Visual execution intelligence UI**: board events feed an AI “brain” event bus powering timeline/kanban/architecture visualizations, risk/quality trends, and optimization insights.
+- **Integrated live preview panel**: guide steps can include `previewHtml`, rendered directly in a sandboxed iframe alongside command and run-status feedback.
+
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
 
EOF
)
