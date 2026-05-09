# OmniBot Initialization and Migration Plan

## Goal Description
Initialize a new standalone, highly secure, local-first AI application named "OmniBot" located in `d:\OmniBot`. The application will combine the capabilities of the "Cortex AI" module from NexusOS and the complete feature set of the Vibelab project into a unified, encrypted local architecture.

## Proposed Changes
### Project Initialization (`d:\OmniBot`)
#### [NEW] `Project_Docs/PROJECT_INSTRUCTIONS.md`
#### [NEW] `Project_Docs/Logs/DEVLOG.md`
#### [NEW] `Project_Docs/Logs/QA_LOOP_STATE.json`
#### [NEW] `دليل_نيكسوس_الشامل.md`
#### [NEW] `frontend/`
#### [NEW] `backend/`

### Feature Migration (Cortex AI + Vibelab)
#### [NEW] `backend/services/cortexService.js`
#### [NEW] `backend/services/vibelabIntegration.js`

### Verification & Deployment
#### [NEW] `d:\OmniBot\.gitignore`
Create an aggressive `.gitignore` to prevent any keys, databases, or local secrets from being tracking.
#### Git Initialization
Initialize, commit, and push repository to the main branch of `git@github.com:mmhassanin/OmniBot.git`. Ensure no `.env` files leak.

### System Launcher Implementation (Nuclear Start)
#### [NEW] `d:\OmniBot\start_omnibot.bat`
A highly robust batch script that starts `backend` (port 3001), `frontend` (port 5174), and `python-engine` (FastAPI) concurrently using `start cmd /k`. Pauses briefly and auto-launches edge/chrome to localhost.
#### [NEW] `d:\OmniBot\scripts\create_desktop_shortcut.js`
A native Node.js script. Dynamically resolves the `USERPROFILE/Desktop` path. Writes a temporary `.vbs` script that instantiates a `WScript.Shell` object to create an `OmniBot.lnk` pointing to `start_omnibot.bat`.

### Frontend Nuclear Overhaul (Cortex AI + Vibelab Integration)
#### [MODIFY] `frontend/src/App.jsx`
Complete teardown of the Vite boilerplate. Will establish a fullscreen, high-aesthetic layout acting as the primary CortexAI operational terminal.
#### [NEW] `frontend/src/components/CortexAI/*`
Migrated UI components from the NexusOS base. Includes chat windows, system metrics displays, and the Vibelab multimedia processing UI.
#### [MODIFY] `frontend/src/index.css`
Inject required Tailwind directives and specific deep-theme custom CSS for the military/secure visual identity.

### LM Studio Intelligence Bridge
#### [NEW] `backend/routes/models.js`
A dedicated Express route to fetch available models directly from the local LM Studio server (`http://localhost:1234/v1/models`). Includes aggressive error handling and timeouts.
#### [MODIFY] `frontend/src/components/CortexAI/CortexAI.jsx`
React `useEffect` updated to fetch models from `http://localhost:3001/api/models` on mount and dynamically populate the model-selector dropdown. Modify chat submission to route through backend proxy or hit LM Studio directly depending on strict configuration.

#### Infinite Automation Loop
Extend the Omni-Action Engine and Cortex AI with new capabilities dynamically without stopping.

### Nuclear Security Overhaul (Zero-Trust Sandbox)
#### [MODIFY] `backend/src/omniActionEngine.js`
Implement local, isolated Node.js `vm` sandboxing for all dynamically executed scripts. Add run-time circuit breakers (timeouts).
#### [MODIFY] `backend/src/config/mongodb.js` & Database Models
Enforce MongoDB payload encryption (AES-256) for all chat histories and stored prompts before storing.
#### [MODIFY] `backend/src/routes/models.js` and `backend/src/routes/chat.js`
Hardcode the AI routing to strictly use `http://localhost:1234` (LM Studio). Absolutely block any calls to external/paid AI APIs.

### Cortex AI Test Suite
#### [NEW] `backend/scripts/cortex_test_suite.js`
Build an automated local diagnostic script executing the 20-Question Cortex AI Test Suite covering Logic, Internet Search, Omni-Action Engine, and Fuzzing/Security.

## Verification Plan
### Automated Tests
- Diagnostic Node scripts.
- Antigravity Subagent testing loop (currently suspended due to API quota, using Local Diagnostic Scripts instead).

### Micro-Task 7: Visual Subagent UI Fuzzing & Autonomous Healing
Due to Constitutional Override (API Quota Limit), the 20-Question UI Matrix will be executed via a dedicated Local Diagnostic Script (`backend/scripts/test_microtask7.js`) that directly interfaces with the backend to prove functionality and persistence, rather than visual browser fuzzing.
#### [NEW] `backend/scripts/test_microtask7.js`
A local script that sequentially sends the 20 specific Micro-Task 7 queries to the backend, parses the responses, and validates them against the pass criteria defined in the prompt.
If any test fails, the agent will halt, fix the underlying code, and re-run.

### Phase 8: Python System Tray Launcher (Stealth Control Center)
#### [NEW] `d:\OmniBot\launcher.py`
A stealthy Python script running in the system tray. Manages the lifecycle of Node.js and Python-Engine processes. Uses `pystray` for the UI and `psutil` for process management.
#### [NEW] `d:\OmniBot\Project_Docs\Logs\omnibot.log`
Centralized log file for the launcher and project services.
#### [MODIFY] `Project_Docs/PROJECT_INSTRUCTIONS.md`
Declare the launcher as a "Core System Component".

## Verification Plan (Phase 8)
### Automated/Local Tests
- Execution via `pythonw.exe` (No window).
- Process scanning and termination (Zero zombies).
- Desktop shortcut creation.
- "Restart" and "Exit" functional verification.

### Phase 9: Dynamic LLM VRAM Management
#### [MODIFY] `launcher.py`
Add `manage_lm_studio(action)` to start/stop routines. Startup unloads all models and explicitly loads `text-embedding-bge-m3`. Shutdown unloads all models. All API calls wrapped in robust try-except.
#### [MODIFY] `backend/src/routes/models.js`
Add a `POST /swap` endpoint to handle dynamic model unloading and loading via LM Studio API while protecting the embedding model.
#### [MODIFY] `frontend/src/components/CortexAI/CortexAI.jsx`
Intercept model selection from the dropdown. When a new model is selected for chat, trigger the backend `/api/models/swap` endpoint to manage memory in real-time.

### Phase 10: Architectural Nuking & Migration (FastAPI Unified Backend)
#### [NEW] `backend/requirements.txt` & `backend/main.py`
Establish a new unified Async Python FastAPI backend to replace the Node.js implementation. Merge any logic from `python-engine/main.py` into this new core.
#### [DELETE] Old Node.js `backend/` files (`package.json`, `src/*.js`) once migration is complete.
#### [NEW] `backend/services/omni_action_engine.py`
Refactor the Omni-Action Engine to utilize Python's `docker` SDK. Instead of local Node VM sandboxing, it will dynamically spin up ephemeral, internet-restricted Docker containers for code execution and instantly destroy them.
#### [NEW] `backend/models/database.py` (Encryption)
Use motor-asyncio. Implement AES-256-GCM encryption for all AI conversation histories.
#### [MODIFY] `frontend/src/services/bridge.js`
Refactor to communicate via HTTP to the new FastAPI backend on port 3001.
#### [MODIFY] `launcher.py`
Update launcher to only spawn `main.py` for the backend instead of the Node process and the old python engine.
#### [NEW] `backend/routers/models.py` & `backend/routers/chat.py`
Replicate the existing Express endpoints into FastAPI routers. Hardcode AI routing to strictly target local LM Studio (`http://localhost:1234`).
#### [NEW] QA Tests (Subagent or Selenium Fallback)
Write `backend/tests/selenium_fallback.py` to automate testing via local Chrome if the Antigravity Subagent's credits run out.

#### [NEW] `backend/workers/optimization_loop.py`
An infinite background loop that autonomously analyzes, refactors, and builds new capabilities for Cortex AI, logging directly to the DevLog/QA Tracker silently.

### Phase 11: Autonomous Swarm Intelligence & Vector Memory
#### [NEW] `backend/services/vector_db.py`
Integrate explicitly local ChromaDB (PersistentClient) storing data in `backend/chroma_db`. This serves as the "Long-Term Semantic Memory" for RAG.
#### [NEW] `backend/services/swarm/`
Build a Custom Multi-Agent Swarm routing exclusively to LM Studio (`localhost:1234`).
- `orchestrator.py`: Breaks down complex tasks and delegates to sub-agents.
- `coder.py`: Generates code based on specifications.
- `reviewer.py`: Reviews code for vulnerabilities and adherence to the project constitution.
- `researcher.py`: Generates queries and parses web search/scraping context.
#### [MODIFY] `backend/services/omni_action_engine.py`
Upgrade the Docker sandboxing capabilities to include headless browsing. It will spin up ephemeral containers containing Playwright/Selenium to execute visual or scraping tasks, instantly destroying them upon task completion.
#### [MODIFY] `backend/workers/optimization_loop.py`
Initiate the actual infinite background loop using `asyncio.create_task` in FastAPI's lifespan. The Swarm will continuously pull system tasks, optimize codebase files, update Cortex schemas, and save its learnings to the Vector DB without user intervention.

## Verification Plan (Phase 11)
### 1. Swarm Unit Tests
- Diagnostic script `backend/tests/test_swarm.py` to test agent delegation and Vector DB insertion/retrieval.
### 2. Browser Subagent Verification
- Launch the built-in Subagent browser to interact with the frontend, request a complex task, and verify that the backend Swarm successfully coordinates, executes the task in a Docker sandbox, and streams the final output to the React UI.

### Phase 12: Local LLM Continuous Polling Fix (Python Backend Migration)
#### [NEW] `backend/services/llm_interceptor.py`
Create a `BackgroundLLMClient` interceptor middleware around `httpx` that strictly checks `settings.proactiveBackgroundProcessing` before allowing any network request to port 1234. Block locally if disabled.
#### [MODIFY] `backend/services/ai_service.py`
Refactor the background `SleepWakeController` to gracefully handle the interceptor's blocking and prevent unnecessary queue processing if globally disabled.
#### [MODIFY] `backend/workers/optimization_loop.py`
Inject strict settings adherence inside the infinite `swarm` optimization loop to sleep when disabled.
#### [NEW] `backend/scripts/test_background_polling.py`
A local diagnostic script designed to definitively prove 0 network requests fire towards port 1234 when background AI settings are toggled off.
