## 1. Project Overview & Objectives

The goal is to migrate legacy projects (`Nexus`, `Nexus-Prime`, `Vibelab`, `Nexus-Smart-Backup`, and `Privacy-First Local Chat Client`) into a singular, hyper-efficient Monorepo architecture (`NexusOS-main`). We will effectively utilize **Turborepo** and **pnpm workspaces** to handle internal dependencies, caching, and builds, ensuring performance under hardware limits (24GB RAM).

## 2. Shared Architecture & UI (`@nexus/ui`)

To unify the aesthetic and eliminate duplicate inline styling, we will create a dedicated internal package:
- **Package:** `packages/ui` (alias: `@nexus/ui`).
- **Styling:** Tailwind CSS v4.
- **Design System:** Strictly built around the "Premium Glassmorphism Design System" (translucent cards, blur drops, hyper-modern gradients, and micro-animations).
- **Goal:** All ported web apps (`apps/web-nexus`, `apps/web-vibelab`, etc.) will import their core components and design tokens directly from this package.

## 3. Handling Native Dependencies (Node/Electron on Windows)

Native modules (`nut-js`, `screenshot-desktop`, `multer`, `sqlite3`, etc.) are notorious for breaking in hoisted monorepo setups due to hardcoded paths to `node_modules` during `node-gyp` builds.
- **Isolation Strategy:** Native dependencies will NOT be hoisted to the monorepo root.
- **Configuration:** We will use `pnpm`'s `.npmrc` in specific packages (like `apps/desktop-backup`) to enforce strict dependency resolution. If necessary, we will use `injected` dependencies or `node-linker=hoisted` locally within the Electron app workspace to mimic a standard installation, preventing `gyp` binding failures on Windows.
- **Electron Builder:** `electron-builder` configurations will be scoped strictly to the `apps/desktop-backup` directory to prevent interference with Turborepo's caching.


## 4. Node.js & Python Coexistence

The Monorepo will act as an umbrella, but Python and Node.js will NOT share a dependency manager.
- **Workspace Containment:** The Python app (`Privacy-First Local Chat Client`) will be housed inside `apps/python-chat`.
- **Environment Isolation:** We will use standard `venv` to create an isolated Python virtual environment explicitly inside `apps/python-chat/.venv`. `pnpm` will be instructed to completely ignore this directory via `.npmignore` and `pnpm-workspace.yaml` exclusions if necessary.
- **Python Native Packages:** Packages like `openai-whisper` and Torch will be installed securely inside the local `venv`, entirely decoupled from Node.js `node_modules`.
- **Interoperability:** Node.js/Electron will interact with the Python ecosystem by spawning child processes that target the specific `.venv/Scripts/python.exe` binary, or through a local WebSocket/HTTP interface (e.g., Flask/FastAPI).


## 5. Target Monorepo Structure

NexusOS-main/

├── apps/

│ ├── web-nexus/ # (Migrated Nexus React frontend)

│ ├── web-vibelab/ # (Migrated Vibelab React frontend)

│ ├── web-prime/ # (Migrated Nexus-Prime frontend)

│ ├── desktop-backup/ # (Migrated Nexus-Smart-Backup Electron wrapper)

│ ├── backend-core/ # (Unified backend services and DB logic)

│ └── python-chat/ # (Migrated Privacy-First Local Chat Client)

├── packages/

│ ├── ui/ # @nexus/ui (Glassmorphism + Tailwind v4)

│ ├── database/ # @nexus/db (Shared models/schemas)

│ ├── logger/ # @nexus/logger (Centralized logging system)

│ └── config-eslint/ # (Shared linting rules)

├── Project_Docs/

│ ├── Implementation_plan.md

│ ├── Tasks.md

│ └── Logs/

│ └── DEVLOG.md # Master execution log

├── package.json

├── pnpm-workspace.yaml

└── turbo.json




## Phase 6: Auditing & Architectural Strategy

- **Objective:** Analyze all legacy projects (`Nexus`, `Nexus-Prime`, `Vibelab`, `Nexus-Smart-Backup`, `Privacy-First Local Chat Client`) and establish a robust, centralized foundation using Turborepo and `pnpm workspaces`.
- **Resource Management:** Operate strictly within the 24GB RAM hardware constraints by leveraging `pnpm`'s symlink-based dependency resolution and Turborepo's aggressive artifact caching.

## Phase 7: Shared Foundations & The UI Package

- **Strategy:** Build the shared foundation *before* migrating any applications to prevent code duplication and disjointed architectures.
### 2.1 The `@nexus/ui` Package (Premium Glassmorphism)
- Establish a discrete internal package: `packages/ui`.
- **Design Core:** Built purely on Tailwind CSS v4, enforcing the "PREMIUM GLASSMORPHISM DESIGN SYSTEM" (translucent interactive layers, strategic structural blur, optimized modern gradients, and micro-animations).
- **Goal:** All migrated frontends will consume standardized, highly-polished components directly from this package, ensuring a universal, top-tier aesthetic.
### 2.2 Core Utilities (`@nexus/logger`, `@nexus/database`)
- Extract redundant logic (e.g., logging formats, database ORM configurations) into standalone packages to guarantee uniform execution across the entire ecosystem.


## Phase 8: Migration Order

1. **Shared Packages:** `@nexus/ui`, `@nexus/logger`, `@nexus/database`, `@nexus/config`.
2. **Backend/Core Logic:** Migrate Node.js services to a unified `apps/backend-core` environment.
3. **Frontend Apps:** Port React/Vite web apps (`apps/web-nexus`, `apps/web-vibelab`) and link them to `@nexus/ui`.
4. **Desktop/Electron:** Port `Nexus-Smart-Backup` to `apps/desktop-backup`.
5. **Python Standalones:** Port `Privacy-First Local Chat Client` to `tools/python-chat` or `apps/python-chat`.


## Phase 9: Native Node/Electron Modules on Windows

*Native binaries like `nut-js`, `screenshot-desktop`, `multer`, and `sqlite3` frequently trigger `node-gyp` rebuild errors in hoisted monorepos on Windows.*
- **Isolation Strategy:** Native bindings will deliberately bypass workspace hoisting.
- **Execution:** We will utilize a package-scoped `.npmrc` file (e.g., inside `apps/desktop-backup/`) with configurations such as `node-linker=hoisted` (locally scoped) or utilize `pnpm`'s `injected` dependencies. This forces the physical installation of the module, ensuring binary paths resolve correctly during runtime.
- **Electron Builder:** Packaging configurations will remain hermetically sealed within the Electron app package to prevent Turborepo edge-case cache invalidations.



## Phase 10: Python Ecosystem Containment

Node.js and Python must coexist without pipeline collisions.
- **Containment:** The Python application will be sandboxed inside `apps/python-chat` (or `tools/python-chat`).
- **Virtual Environment (`.venv`):** Python dependencies (e.g., `openai-whisper`, `torch`) will be installed strictly in a localized `.venv`.
- **Workspace Exclusions:** Turborepo and `pnpm` will be configured via `.npmignore` and `pnpm-workspace.yaml` to entirely ignore the `.venv` and `__pycache__` directories.
## Phase 11: AI Settings Optimization (Google AI & LM Studio)

- **Objective:** Streamline the AI Cortex to support only the user's active providers (Google Gemini and LM Studio Local).
- **Default State:** Enforce LM Studio as the primary/default provider (`aiProvider: 'local'`) to align with the 70% usage target.
- **UI Refinement:** 
    - Prune OpenAI GPT-4 options from the settings dashboard.
    - Repostion the "Encryption Vault" to handle `geminiKey` and `localUrl` (LM Studio endpoint).
## Phase 12: UI Consolidation (Nexus Chat vs Cortex AI)

- **Objective:** Eliminate redundancy between "Nexus Chat" and "Cortex AI".
- **Action:** Merge streaming AI logic from `ChatClient.jsx` into `CortexAI.jsx`. Remove `ChatClient` from the OS definitions (`osStore.js`, `StartMenu.jsx`, `WindowFrame.jsx`) and filesystem to establish Cortex AI as the unified intelligent frontend.

## Phase 13: Nexus-Prime Deep Dive & Porting

- **Objective:** Port missing advanced features from the legacy `Nexus-Prime-main` repository into the current `NexusOS` workspace.
- **Action:** 
    - Port `NetGuardModal.jsx` to introduce advanced network and latency monitoring.
    - Adapt styling to Tailwind CSS v4 and the Glassmorphism Design System.
    - Wire the new feature into the `StartMenu` or `SystemMonitor` for user access.

## Phase 14: One-Click Launchers

- **Objective:** Provide a fast, single-click method to launch the NexusOS systems from the Windows Desktop.
- **Action:** 
    - Create a `launchers` directory in the project root.
    - Create `start-web.bat` to launch the Vite development server (`@nexus/desktop`) and open the browser.
    - Create `start-app.bat` to launch the native Electron desktop application.
    - Provide a programmatic Node.js script using PowerShell to generate `.lnk` shortcuts directly on the user's Desktop for these launchers.

## Phase 15: Deep Clean Launchers

- **Objective:** Ensure a 100% clean environment before booting NexusOS.
- **Action:**
    - Update `start-web.bat` and `start-app.bat` to forcefully kill any lingering `node.exe` or `electron.exe` processes.
    - Terminate any processes specifically listening on port 5173 (Vite) and 3001 (Nexus Bridge).
    - Clear the Vite cache (`apps\nexus-desktop\node_modules\.vite`).
    - Clear console output before launching and setting `NEXUS_BRIDGE=true`. Ensure `start-app.bat` starts the Vite server before Electron because it boots in Dev Mode.

## Phase 16: Kernel Critical Fixes & Native Compiles

- **Objective:** Resolve startup crashes related to IPC routing and native module ABI mismatches.
- **Action:** 
    - Fix missing `ipcMain` import in `apps/backend-core/src/main.js`.
    - Fix ReferenceError for `authService` in `apps/backend-core/src/main.js` (by importing or pruning legacy references).
    - Install and execute `@electron/rebuild` to synchronize `better-sqlite3` with Electron's ABI.
    - Verify that `BackendCore` initializes without unhandled promise rejections.

## Phase 17: Nexus-Sentinel (Autonomous Self-Healing Service)

- **Objective:** Build a self-healing runtime that intercepts crashes, analyzes them, and autonomously patches the codebase using AST analysis and AI inference.
- **Action:**
    - Create the architecture blueprint at `docs/Sentinel-Architecture.md`.
    - Implement `apps/backend-core/src/services/sentinelService.js` with the 5-Step Sentinel Loop.
    - Hook `sentinelService` into `apps/backend-core/src/main.js` as the first layer around the boot sequence.
    - Verify the self-healing loop by intentionally breaking a non-critical file.

## Phase 18: Sentinel V2 — Omniscient Multi-Runtime Matrix

- **Objective:** Upgrade Sentinel to a proactive, cross-runtime maintainer that heals warnings natively and operates across Node.js and Python.
- **Action:**
    - Enhance `sentinelService.js` with a BackgroundHealingQueue, console.warn/error monkey-patching, and process.on('warning') interception.
    - Create `sentinel_hook.py` to override Python's `sys.excepthook` and `warnings.showwarning` with JSON STDIO serialization.
    - Upgrade `pythonOrchestrator.js` with `[SENTINEL_PY_INTERCEPT]` prefix detection and routing to `sentinelService.handlePythonIntercept()`.
    - Add `_verifyPythonPatch()` using `python -m py_compile` for cross-runtime syntax verification.

## Phase 19: Sentinel-UI Boundary (Frontend Self-Healing)

- **Objective:** Extend Sentinel V2 to protect the React frontend by catching crashes, showing a healing UI, and autonomously patching JSX/CSS via backend IPC.
- **Action:**
    - Create `apps/nexus-desktop/src/components/OS/ErrorBoundary.jsx` to intercept React rendering errors and display a Glassmorphism "Healing in progress" fallback.
    - Update `apps/nexus-desktop/src/main.jsx` and `App.jsx` to wrap the app in the `ErrorBoundary`.
    - Establish a new IPC channel (`sentinel:heal-ui`) in `main.js` which triggers `sentinelService.handleUIIntercept()`.
    - Update `sentinelService.js` to process UI intercepts, prompt the Dual-Provider AI with the faulty React stack trace, patch the frontend file, and trigger Vite HMR to auto-resume the UI.
    - Verify with `sabotageReact.jsx` test component.

## Phase 20: Nexus Forge (AI Art Research Center)

- **Objective:** Build a premium dual-pane AI Art Research Command Center inside NexusOS.
- **Action:**
    - Create `fooocusBridge.js` for local Fooocus API (HTTP POST to `127.0.0.1:7865`).
    - Create `NexusForge.jsx` with Prompt Sculptor (LM Studio AI expansion) and Render Engine (Fooocus controls).
    - Register in StartMenu, WindowFrame, and IPC handlers (`forge:health`, `forge:generate`).
    - Inject hidden AI System Prompt for Greco-Roman classical art and photorealism prompt engineering.

## Phase 21: Nexus-Animus (Legacy DNA Sequencer)

- **Objective:** Build an automated tool that crawls legacy projects, extracts feature intentions via heuristics, evolves them through AI, and injects modernized modules into NexusOS.
- **Action:**
    - Create `animusSequencer.js` with a 4-step pipeline: Deep Crawler, Heuristic Analyzer (12 regex patterns), AI Evolution Engine, and Injection Matrix.
    - Register `animus:start-sequence` and `animus:status` IPC handlers.
    - Execute dry-run on the Vibelab legacy folder to validate semantic extraction and AI-driven evolution.

## Phase 22: Animus Persistent Daemon & DNA Vault

- **Objective:** Upgrade Animus from a one-shot script into a continuously running background daemon with persistent memory and a live approval dashboard.
- **Action:**
    - Add SQLite database (`animus.db`) with `animus_ledger` (dedup) and `evolution_queue` (approval) tables.
    - Build Micro-Extraction Engine (9 regex patterns: functions, hooks, configs, classes, CSS vars/animations, Python functions).
    - Implement Background Worker Daemon processing one file every 3 minutes.
    - Create `AnimusDashboard.jsx` with live progress, scrolling queue, INJECT/REJECT approval matrix, and live log footer.
    - Register 7 IPC handlers for daemon control, queue management, and approval workflow.

## Phase 23: Nexus-Architect (Proactive Evolution Daemon)

- **Objective:** Build an autonomous AI daemon that proactively analyzes the OS state and invents new features.
- **Action:**
    - Create `architectDaemon.js` with context gathering (apps, IPC, user focus), AI idea generation, auto-builder, and daemon lifecycle.
    - Create `ArchitectWidget.jsx` with idea display, expandable blueprint, Build It Now/Dismiss buttons.
    - Register 6 IPC handlers for daemon control, idea management, and auto-building.
    - Wire into StartMenu and WindowFrame.

## Phase 25: Nexus-Prime — Autonomous Cybernetic Architect

- **Objective:** Build a fully autonomous, local-only agentic AI system powered by LM Studio with tool calling, code review, and human approval.
- **Action:**
    - Create `nexusPrimeEngine.js` with LM Studio agentic loop (8 max cycles), 4 system tools, think-tag parser, and Pending Patch logic.
    - Create `NexusPrimeDashboard.jsx` with chat UI, DiffViewer, ThinkingAccordion, and Approve/Reject pipeline.
    - Register 5 IPC handlers for chat, patch management, and status.
    - Wire into StartMenu and WindowFrame.
