# OmniBot System Evolution & Optimization Plan (Evolve_plan.md)

This file tracks all discovered problems, missing components, and new features for the continuous, autonomous evolution of OmniBot.

---

## 📋 Evolution Backlog & Prioritization

### 🔴 Critical Priority
*   **Item:** Playwright Timeout and Fragile Scraping in `BrowserTool.search_web`
    *   **Description:** `BrowserTool.search_web` navigates to duckduckgo.com using Playwright page instances, waiting for and parsing brittle `.result__body` classes. This triggers frequent 30-second timeouts, slows down agent queries, and breaks when the search engine layout updates.
    *   **Proposed Fix:** Refactor to use the `duckduckgo_search` (DDGS) library API. If any exception occurs, gracefully fallback to safe defaults, never crashing.
    *   **Files Affected:** [browser_tool.py](file:///d:/2026/Projects/AI/NexusOS/backend/tools/browser_tool.py)
    *   **Status:** `[ completed ]`

### 🟡 High Priority
*   **Item:** Complete Enhanced File Operations API (IDEA-008)
    *   **Description:** The current files router `backend/routers/files.py` only lists folders (`GET /api/files`) but does not allow reading, writing/updating, or deleting files. This is needed for full file vault functionality.
    *   **Proposed Fix:** Add `/api/files/read`, `/api/files/write`, and `/api/files/delete` endpoints with strict pathlib-based traversal protection.
    *   **Files Affected:** [files.py](file:///d:/2026/Projects/AI/NexusOS/backend/routers/files.py)
    *   **Status:** `[ completed ]`

### 🟢 Medium Priority
*   **Item:** Registry Verification & Status Alignment
    *   **Description:** Verify actual codebase implementations for files listed in `EVOLUTION_IDEAS_REGISTRY.md` and align status codes from `pending` to `implemented` based on physical existence.
    *   **Proposed Fix:** Physically read files for `IDEA-001` (Autonomous Self-Evolution Core), verification checks, and update status accordingly.
    *   **Files Affected:** [EVOLUTION_IDEAS_REGISTRY.md](file:///d:/2026/Projects/AI/NexusOS/EVOLUTION_IDEAS_REGISTRY.md)
    *   **Status:** `[ completed ]`

### 🔵 Low Priority
*   **Item:** Live Browser Session WebSocket Streaming (IDEA-009)
    *   **Description:** Implement streaming Playwright screenshots and terminal outputs over WebSockets for live telemetry dashboards.
    *   **Proposed Fix:** Add WebSocket streaming hooks and integrate a dynamic dashboard viewer component.
    *   **Files Affected:** `backend/api/browser_session.py`, `frontend/src/components/BrowserViewer.tsx`
    *   **Status:** `[ pending ]`

---

## 🔄 Phase 2: Horizontal Discovery (New Issues) — 2026-05-11

### 🔴 CRITICAL — Security Issue: CORS Wildcard
*   **Description:** `allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"]` in backend/main.py line 227 exposes backend to any origin in production.
*   **Impact:** Production security risk; violates CORS best practices.
*   **Fix:** Remove `"*"` and replace with explicit environment-based origin list; add validation for production environments.
*   **Status:** `[ completed ]` — Fixed to use env-based origin list; wildcard removed

### 🔴 CRITICAL — Parallel Evolution Loops Without Coordination
*   **Description:** Two evolution systems run in parallel in main.py: (1) orchestrator.run_forever() at line 134, (2) start_infinite_dev_loop() at line 172. Both access MongoDB and model_router without explicit mutual exclusion or coordination.
*   **Impact:** Race conditions on MongoDB writes, duplicate work, resource contention.
*   **Fix:** Merge into single unified loop or add explicit mutex/coordination logic; stop one of the two.
*   **Status:** `[ pending ]`

### 🟡 HIGH — ImplementationRunner Never Executed
*   **Description:** EXECUTION_HISTORY.json is empty despite the system running for multiple sessions. ImplementationRunner exists but hasn't actually executed any approved ideas.
*   **Impact:** Evolution loop identifies ideas but never implements them; system lacks real learning.
*   **Fix:** Debug why ideas aren't reaching ImplementationRunner; add verbose logging; ensure loop calls execute_idea() with correct parameters.
*   **Status:** `[ pending ]`

### 🟡 HIGH — Missing Tests for Evolution Core
*   **Description:** No pytest tests exist for LoopOrchestrator, AgentCouncil, IdeaEngineV2, ProblemScanner, or ImplementationRunner.
*   **Impact:** No validation of core evolution logic; bugs discovered only at runtime.
*   **Fix:** Create `backend/tests/test_evolution_*.py` with unit + integration tests; add to CI/CD.
*   **Status:** `[ completed ]` — Created test_evolution_core.py with 10+ test cases for all modules

### 🟡 HIGH — Agent Council Uses Excessive API Calls
*   **Description:** AgentCouncil calls LLM for every single idea (3 agents + 1 moderator = 4 calls per idea), no caching. With 2-3 ideas/cycle every 120s, this is ~72-108 API calls/hour just for evaluation.
*   **Impact:** High token consumption; slow evaluation; unnecessary cost.
*   **Fix:** Add semantic caching using ChromaDB; if idea is similar to recently-evaluated idea (>0.8 similarity), reuse verdict.
*   **Status:** `[ pending ]`

### 🟡 HIGH — Dead Code: money_agent.py at Project Root
*   **Description:** `/NexusOS/money_agent.py` exists but actual Money Agent code is in `backend/agent/money_agent_loop.py`. Dual implementation creates confusion.
*   **Impact:** Maintenance burden; unclear which version is authoritative.
*   **Fix:** Delete root money_agent.py; ensure all imports point to backend/ version.
*   **Status:** `[ pending ]`

### 🟢 MEDIUM — DuckDuckGo Search Fallback Missing
*   **Description:** IdeaEngineV2 uses DDGS library for web search but has no fallback if DDGS fails or is blocked. Silent failure returns empty results.
*   **Impact:** Idea generation falls back to template ideas when web access unavailable.
*   **Fix:** Add secondary search via Google/Bing API OR use pre-cached knowledge base; add explicit logging of search failures.
*   **Status:** `[ pending ]`

### 🟢 MEDIUM — ProblemScanner Heuristics Too Basic
*   **Description:** Static analysis checks only for: sleep(10), bare except, missing async error handling, missing logger. These are too simplistic; high false-positive/false-negative rates.
*   **Impact:** Many real problems missed; irrelevant problems reported.
*   **Fix:** Expand heuristics to: unused imports, missing docstrings, complexity > 10, long methods (>50 lines), TODO comments, deprecated APIs.
*   **Status:** `[ pending ]`

---

## 🔄 Phase 2: Vertical Improvements (Existing Solutions Enhanced) — 2026-05-11

### UPGRADE-001: ImplementationRunner Logging & Diagnostics
*   **Description:** Enhance ImplementationRunner to emit detailed step-by-step logs; add telemetry for execution time, file change sizes, and success rates.
*   **Benefit:** Better observability into what's being implemented and why some executions fail.
*   **Status:** `[ pending ]` — Note: ImplementationRunner already has comprehensive logging in place

### UPGRADE-002: LoopOrchestrator Error Recovery
*   **Description:** Current exception handling catches all errors but doesn't distinguish between temporary failures (network) vs permanent failures (invalid code). Add smart backoff strategy.
*   **Benefit:** Faster recovery from transient issues; better detection of permanent problems.
*   **Status:** `[ completed ]` — Added error classification (temporary vs permanent) with different backoff times

### UPGRADE-003: AgentCouncil Verdict Caching via ChromaDB
*   **Description:** Add semantic similarity search to AgentCouncil; if new idea is >80% similar to recent idea, reuse cached verdict instead of calling LLM.
*   **Benefit:** 60-70% reduction in API calls for evaluation phase; faster cycle time.
*   **Status:** `[ pending ]` — High-impact optimization, requires ChromaDB integration

### UPGRADE-004: ProblemScanner Heuristics Expansion
*   **Description:** Enhance ProblemScanner with additional checks beyond sleep/except/logging: unused imports, complex functions, TODOs, deprecated APIs.
*   **Benefit:** Better detection of real problems; fewer false positives/negatives.
*   **Status:** `[ completed ]` — Added 5 new heuristic checks (unused imports, complexity, TODOs, etc.)

### UPGRADE-005: Evolution System Diagnostics API
*   **Description:** Add `/api/evolution/diagnostics` endpoint showing component readiness, database stats, and system health.
*   **Benefit:** Better visibility into system state; easier debugging when things fail.
*   **Status:** `[ completed ]` — Added comprehensive diagnostics endpoint with component status + warnings

### UPGRADE-006: Unified Evolution Loop (Merge Two Systems)
*   **Description:** Integrate infinite_dev_loop into LoopOrchestrator as a phase that runs every N cycles; eliminate duplicate systems.
*   **Benefit:** Single source of truth; no race conditions; easier to monitor and debug.
*   **Status:** `[ pending ]` — Requires careful merging of two parallel systems

### UPGRADE-007: Frontend Bundle Size Optimization with Code-Splitting
*   **Description:** Current 660KB main bundle → split into route-based chunks using React.lazy + dynamic imports.
*   **Benefit:** Faster initial load time; better performance on slow networks; improved CLS metric.
*   **Status:** `[ pending ]` — Requires refactoring App.tsx route definitions

### UPGRADE-008: Docker-Compose Configuration Modernization
*   **Description:** Remove obsolete `version` field; migrate to docker-compose v2 format.
*   **Benefit:** Eliminates deprecation warnings; future-proofs configuration.
*   **Status:** `[ pending ]` — Single-line change with testing

### UPGRADE-009: Enhanced Error Context Logging
*   **Description:** Add stack traces and detailed context to critical async operations (model_router, database operations, agent execution).
*   **Benefit:** Faster debugging; better observability of failure causes.
*   **Status:** `[ completed ]` — Enhanced error_log.py with extra_info parameter for richer diagnostics

### UPGRADE-010: Agent Execution Timeout Refinement
*   **Description:** Increase default `TOOL_TIMEOUTS["python"]` from 8s to 15s for slower operations; add adaptive timeout scaling based on code complexity.
*   **Benefit:** Fewer false timeouts on legitimate slow operations; better agent reliability.
*   **Status:** `[ pending ]` — Requires profiling actual execution times

---

## 🎯 Priority Matrix: What to Execute First

Based on impact + feasibility, execution order:
1. **CRITICAL FIX + QUICK WIN**: Remove version from docker-compose.yml (1 line, high value)
2. **CRITICAL + MEDIUM EFFORT**: Parallel evolution loop coordination (mutex or merge)
3. **EASY UPGRADE + MEDIUM VALUE**: Error context logging (existing framework, add fields)
4. **MEDIUM EFFORT + HIGH VALUE**: Frontend bundle code-splitting (better UX)
5. **MEDIUM EFFORT + MEDIUM VALUE**: Agent timeout refinement (requires benchmarking)

---

## 🛠️ Execution Checklist & Progress Tracker

- [x] **Previous Phase Items (COMPLETED)**
    - [x] Optimize `BrowserTool.search_web` to use the pre-installed `duckduckgo_search` library.
    - [x] Perform fallback validation testing to ensure zero crashes under service issues.
    - [x] Create path-safe file reading endpoint (`GET /api/files/read`).
    - [x] Create path-safe file writing endpoint (`POST /api/files/write`).
    - [x] Create path-safe file deletion endpoint (`DELETE /api/files/delete`).
    - [x] Test traversal security limits (verify trying to read files outside workspace returns HTTP 403/400).
    - [x] Inspect files in `backend/core/autonomous_evolution/` and update EVOLUTION_IDEAS_REGISTRY.md.

- [x] **Phase 1 (2026-05-11) Critical Fixes**
    - [x] Fix CORS security issue — removed wildcard, added env-based origin list
    - [x] Improve LoopOrchestrator error recovery — distinguish temporary vs permanent failures
    - [x] Expand ProblemScanner heuristics — added 5 new checks (unused imports, complexity, TODOs)
    - [x] Create comprehensive tests — test_evolution_core.py with 10+ test cases
    - [x] Add evolution system diagnostics — /api/evolution/diagnostics endpoint
    - [x] Create system health check utility — backend/utils/health_check.py

- [x] **Phase 1 Verification & Session 2 Fixes (2026-05-11)**
    - [x] Compile check backend code — ✓ All Python files compile successfully
    - [x] Frontend TypeScript verification — Fixed 3 TS errors (ImageViewer, PreLoader)
    - [x] Fix Docker build failures — Removed Windows-only dependencies from requirements.txt
    - [x] Fix desktop_control_tool imports — Made imports lazy to avoid Docker failures
    - [x] End-to-end system test — ✓ MongoDB + Docker fully operational
    - [x] API verification — ✓ Factory agents, evolution stats, model router all working
    - [x] Frontend bundle build — ✓ Successful (660KB, warning about chunk size)

---

## 🔄 Phase 2: Dual-Axis Discovery — 2026-05-11 (Current Session)

### AXIS 1: HORIZONTAL DISCOVERY (Completely New Issues)

### 🔴 CRITICAL — Frontend Bundle Size Optimization
*   **Description:** Vite build reports 660KB main JavaScript chunk (184KB gzipped). Recommendation to use dynamic imports for code-splitting.
*   **Impact:** Slower initial load time, poor performance on slow networks.
*   **Fix:** Implement route-based code-splitting using React.lazy() + Suspense; extract vendor chunks.
*   **Status:** `[ completed ]` — Route-based code-splitting reduced bundle from 660KB to 306KB (54% improvement)

### 🟡 HIGH — Docker-Compose Version Field Obsolete
*   **Description:** docker-compose.yml has `version: "3.9"` which triggers warning "the attribute `version` is obsolete".
*   **Impact:** Generates noise in logs; may not be supported in future Docker versions.
*   **Fix:** Remove version field and update to compose v2 format; test with `docker-compose config`.
*   **Status:** `[ completed ]` — Version field removed; docker-compose config validates successfully

### 🟡 HIGH — Potential Race Condition in Parallel Evolution Loops
*   **Description:** Evolve_plan.md notes two parallel systems (orchestrator + infinite_dev_loop) both accessing MongoDB without explicit coordination.
*   **Impact:** Possible write conflicts, duplicate work, resource contention.
*   **Fix:** Add mutex/lock coordination OR merge into single unified loop with phase-based execution.
*   **Status:** `[ pending ]` (previously noted, still unresolved)
