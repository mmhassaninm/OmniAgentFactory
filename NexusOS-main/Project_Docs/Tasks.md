# NexusOS Migration Tasks Checklist



### Phase 1: Monorepo Foundation

- [ ] Initialize root `package.json` for the monorepo.
- [ ] Configure `pnpm-workspace.yaml` to explicitly map `apps/*` and `packages/*`.
- [ ] Configure `turbo.json` and define the build, lint, and dev pipelines.
- [ ] Set up global `.gitignore` to cover Node, Python (`.venv`, `__pycache__`), and OS-specific files.
- [ ] Create `Project_Docs/Logs/DEVLOG.md` to begin actively tracking system changes.



### Phase 2: Shared Packages Architecture

- [x] Scaffold `packages/ui` workspace.
- [x] Configure Tailwind CSS v4 within `packages/ui` and establish the Glassmorphism base utilities.
- [x] Scaffold `packages/logger` workspace for centralized backend/frontend logging.
- [x] Scaffold `packages/database` workspace to unify schemas (Models/SQLite configs).



### Phase 3: Python Environment Sandbox (`apps/python-chat`)

- [ ] Migrate `Privacy-First Local Chat Client` files into `apps/python-chat`.
- [ ] Establish `setup.bat` inside the Python app to programmatically create `.venv` and run `pip install -r requirements.txt`.
- [ ] Ensure Turborepo scripts properly ignore Python workflows or execute them as standalone CLI commands.



### Phase 4: Frontend Migrations (React/Vite)

- [ ] Port `Nexus/frontend` into `apps/web-nexus`.
- [ ] Port `Vibelab/frontend` into `apps/web-vibelab`.
- [ ] Port `Nexus-Prime-main/frontend` into `apps/web-prime`.
- [ ] Configure each frontend's `vite.config.js` to correctly consume `@nexus/ui` internal packages.



### Phase 5: Backend & Electron Integration (Native Modules)

- [ ] Port the Node.js backends into a unified `apps/backend-core` (or scoped logically).
- [ ] Port `Nexus-Smart-Backup` into `apps/desktop-backup`.
- [ ] Configure `.npmrc` inside `apps/desktop-backup` to safeguard native module compilation (e.g., `nut-js`).
- [ ] Write cross-platform start scripts (Node -> triggering Python instances safely).



### Phase 6: Core Testing & Auditing

- [ ] Trigger global `pnpm install` and verify zero workspace conflicts.
- [ ] Execute global `pnpm dev` and ensure Turborepo successfully hashes and builds UI dependencies before starting Vite/Express servers.
- [ ] Verify Electron packaging runs without `gyp` or native module binding errors on Windows.

### Phase 7: Monorepo Bootstrapping & Configuration

- [ ] Initialize master `package.json` for the root directory.
- [ ] Configure `pnpm-workspace.yaml` mapping `apps/*`, `packages/*`, and `tools/*`.
- [ ] Set up comprehensive global `.gitignore` covering Node caches, `.env` credentials, Python `.venv`, and OS clutter.
- [ ] Initialize `turbo.json` and map fundamental pipelines (build, dev, lint) with artifact caching rules.
- [ ] Scaffold the foundational directories: `apps/`, `packages/`, `tools/`.
- [ ] Initialize `Project_Docs/Logs/DEVLOG.md` for continuous chronological project tracking.



### Phase 8: Shared Packages Design & Setup

- [x] Scaffold the `packages/ui` directory.
- [x] Initialize `package.json` for `@nexus/ui` to prepare it for workspace linking.
- [x] Configure Tailwind CSS v4 specifically within the `packages/ui` context.
- [x] Define the base CSS variables and utilities for the "Premium Glassmorphism Design System".
- [x] Scaffold `packages/logger` for centralized, cross-workspace audit logs.
- [x] Scaffold `packages/database` to consolidate database connection pooling and schema definitions.
- [x] Run global `pnpm install` to link foundational packages across the workspace.

### Phase 11: AI Settings Optimization (Google AI & LM Studio)

- [x] Update `DEFAULT_SETTINGS` in `settingsService.js` to prioritize LM Studio.
- [x] Refactor `Settings.jsx` UI to only show Google Gemini and LM Studio (Local).
- [x] Replace OpenAI API Key field with LM Studio URL field in `Settings.jsx`.
- [x] Verify `aiService.js` handling of `local` and `google` providers.
### Phase 12: UI Consolidation (Nexus Chat vs Cortex AI)

- [ ] Merge `python:stdout` IPC listener from `ChatClient.jsx` to `CortexAI.jsx`.
- [ ] Remove `ChatClient.jsx` from `StartMenu.jsx` mock apps.
- [ ] Remove `ChatClient` routes in `WindowFrame.jsx`.
- [ ] Ensure `osStore.js` `openApps` default is empty.
- [ ] Delete `ChatClient.jsx` file.

### Phase 13: Nexus-Prime Deep Dive & Porting

- [ ] Inspect legacy `Nexus-Prime-main/frontend/src/components` for valuable widgets.
- [ ] Port `NetGuardModal.jsx` to `apps/nexus-desktop`.
- [ ] Refactor `NetGuardModal.jsx` styles to use Tailwind v4 and Glassmorphism.
- [ ] Add NetGuard back to `StartMenu.jsx`.
- [ ] Verify `aiService.js` compatibility (it should remain independent).

### Phase 14: One-Click Launchers

- [x] Create `launchers` directory in the project root.
- [x] Create `launchers/start-web.bat` with environment variables and web dev server start logic.
- [x] Create `launchers/start-app.bat` to launch the Electron app.
- [x] Create `launchers/create-shortcuts.cjs` to construct Desktop `.lnk` shortcuts via PowerShell.
- [x] Check off tasks in `Tasks.md` and append to `DEVLOG.md`.

### Phase 15: Deep Clean Launchers

- [x] Add process cleanup (`taskkill` for `node.exe`/`electron.exe`) to `.bat` files.
- [x] Add port liberation (5173, 3001) using `netstat` and `taskkill` to `.bat` files.
- [x] Add Vite cache wipedown (`rmdir`) to `.bat` files.
- [x] Run Node.js script to recreate desktop shortcuts pointing to updated launchers.
- [x] Verify cleanup with dummy `node.exe` process.

### Phase 16: Kernel Critical Fixes

- [x] Fix missing `ipcMain` import in `apps/backend-core/src/main.js`.
- [x] Fix `authService` ReferenceError in `apps/backend-core/src/main.js`.
- [x] Add `@electron/rebuild` to `package.json` and run terminal rebuild command.
- [x] Verify `hive:orchestrateTask` and `ai:predict` handlers register successfully.

### Phase 17: Nexus-Sentinel (Self-Healing Service)

- [x] Create `docs/Sentinel-Architecture.md` blueprint.
- [x] Implement `apps/backend-core/src/services/sentinelService.js`.
- [x] Hook Sentinel into `apps/backend-core/src/main.js` boot sequence.
- [x] Verify self-healing loop with intentional crash test.

### Phase 18: Sentinel V2 — Omniscient Multi-Runtime Matrix

- [x] Update `docs/Sentinel-Architecture.md` with V2 section.
- [x] Enhance `sentinelService.js` with warning-level interception & BackgroundHealingQueue.
- [x] Create `src/python-daemons/kernel/sentinel_hook.py`.
- [x] Upgrade `pythonOrchestrator.js` with `[SENTINEL_PY_INTERCEPT]` bridge.
- [x] Create `src/python-daemons/kernel/sabotage_warning.py` test script.
- [x] Live verification of cross-runtime healing.

### Phase 19: Sentinel-UI Boundary (Frontend Self-Healing)

- [x] Update `docs/Sentinel-Architecture.md` with UI Boundary docs.
- [x] Create `apps/nexus-desktop/src/components/OS/ErrorBoundary.jsx`.
- [x] Wrap `App` in `ErrorBoundary` in `main.jsx`.
- [x] Add `sentinel:heal-ui` IPC channel in `main.js`.
- [x] Implement `handleUIIntercept` in `sentinelService.js` to patch JSX and await Vite HMR.
- [x] Create `sabotageReact.jsx` and run live UI crash test.
- [x] Phase 19.6: Fix UI Healing Loop by sending explicit `sentinel:heal-complete` IPC event and adding manual reload timeout.

### Phase 20: Nexus Forge (AI Art Research Center)

- [x] Create `apps/backend-core/src/services/fooocusBridge.js` backend service.
- [x] Create `apps/nexus-desktop/src/components/Apps/NexusForge.jsx` with dual-pane UI.
- [x] Register Nexus Forge in StartMenu `MOCK_APPS` and WindowFrame routing.
- [x] Register `forge:health` and `forge:generate` IPC handlers in `main.js`.
- [x] Inject AI Art System Prompt for the Prompt Sculptor.
- [ ] Live verification of app opening and IPC registration.

### Phase 21: Nexus-Animus (Legacy DNA Sequencer)

- [x] Scan legacy directory structure and validate accessibility.
- [x] Build `animusSequencer.js` with Deep Crawler + Heuristic Analyzer + AI Evolution Engine.
- [x] Create Injection Matrix for auto-categorization and file creation.
- [x] Register `animus:start-sequence` and `animus:status` IPC handlers.
- [ ] Execute dry-run on Vibelab legacy folder.

### Phase 22: Animus Persistent Daemon & DNA Vault

- [x] Upgrade `animusSequencer.js` with SQLite Ledger (`animus_ledger` + `evolution_queue` tables).
- [x] Build Micro-Extraction Engine (9 regex patterns for deep sub-file analysis).
- [x] Implement Background Worker Daemon (endless loop, 3-min cycle, ring-buffer log).
- [x] Create `AnimusDashboard.jsx` with live scrolling feed and INJECT/REJECT approval buttons.
- [x] Register AnimusDashboard in StartMenu and WindowFrame.
- [x] Register all new IPC handlers (`animus:daemon-start/stop`, `animus:queue`, `animus:inject`, `animus:reject`).
- [ ] Live verification of daemon startup and queue population.

### Phase 22.5: Targeted Injection (Ghost Developer V2 + Chaos Guardian V2)

- [x] Inject `ghostDeveloperEvolved.js` with desktopCapturer, aiService vision, IPC broadcasting.
- [x] Inject `chaosGuardianEvolved.js` with 12 attack vectors, AI patch generation, markdown reports.
- [x] Register `ghost:start/stop/status` and `chaos:run/status` IPC handlers.

### Phase 23: Nexus-Architect (Proactive Evolution Daemon)

- [x] Build `architectDaemon.js` with context gathering, AI idea generation, and auto-builder.
- [x] Create `ArchitectWidget.jsx` with idea display, expandable blueprint, Build/Dismiss buttons.
- [x] Register 6 Architect IPC handlers.
- [x] Add to StartMenu (💡 Lightbulb) and WindowFrame routing.

### Phase 23.5: Floating Architect Overlay Widget

- [x] Build `FloatingArchitectWidget.jsx` (absolute-positioned, z-30, spring animation).
- [x] Embed in `App.jsx` between Window Layer and Start Menu.
- [x] Simulate first AI idea pitch (Pantheon Gallery).

### Phase 24: Pantheon Gallery — AI Art Curation Engine

- [x] Build `pantheonService.js` with recursive Fooocus output scanning and Vision AI analysis stubs.
- [x] Build `PantheonGallery.jsx` with filterable mosaic grid, prompt-vs-result comparison, score badges.
- [x] Register 4 `pantheon:*` IPC handlers (`scan`, `getImages`, `analyze`, `status`).
- [x] Add to StartMenu (🖼️ purple) and WindowFrame routing.

### Phase 25: Nexus-Prime — Autonomous Cybernetic Architect

- [x] Build `nexusPrimeEngine.js` with LM Studio agentic loop (8 max cycles).
- [x] Implement 4 system tools: `readFile`, `writeFile` (Pending Patch), `executeCommand`, `runPlaywrightTest`.
- [x] Implement `<think>` tag parser for DeepSeek-R1 models.
- [x] Build `NexusPrimeDashboard.jsx` with chat UI, DiffViewer, ThinkingAccordion, Approve/Reject pipeline.
- [x] Register 5 `prime:*` IPC handlers.
- [x] Add to StartMenu (⚡ Zap violet) and WindowFrame routing.

### Phase 26: Global Toast Notification System

- [x] Build `toastBus.js` EventBus with .success()/.error()/.info()/.warning() methods.
- [x] Build `ToastManager.jsx` (z-35, bottom-left, [x] close, 15s auto-dismiss, progress bar).
- [x] Refactor `SabotageReact.jsx` to route Sentinel notification through toastBus.
- [x] Embed `ToastManager` in `App.jsx` between Architect overlay and Start Menu.
