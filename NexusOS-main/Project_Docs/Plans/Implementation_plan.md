# 🏗️ NEXUS-OS MASTER IMPLEMENTATION ROADMAP

### 🟢 PART 1: MONOREPO & ELECTRON SHELL INITIALIZATION

#### Phase 1: OS Monorepo Foundation & Workspace Setup
1. **Phase Objective**: Establish the root architecture for NexusOS, combining React Frontend, Node.js Backend, and Python Microservices into a single `npm workspaces` monorepo.
2. **Directory & File Restructuring**: Create `/NexusOS` root. Initialize `/src/main` (Electron Main), `/src/renderer` (React UI), and `/src/python-daemons`.
3. **Dependency Management**: Initialize root `package.json` with `concurrently`, `electron`, and `electron-builder`. Resolve conflicting dependencies between Nexus-Prime and Vibelab.
4. **Integration Points**: Bind `main.js` to serve `localhost:5173` (Vite dev server) during development, and load static files in production.
5. **Critical Risks & Refactoring**: Vite build paths colliding with Electron’s ASAR routing. Need strict path resolution strategies using Node's `path.join`.

#### Phase 2: Electron Main Process Architecture
1. **Phase Objective**: Structure the Electron lifecycle (App Ready, Window-all-closed, Quit) to act as the OS Kernel.
2. **Directory & File Restructuring**: Create `src/main/app.js`, `src/main/windowManager.js`, and `src/main/lifecycle.js`.
3. **Dependency Management**: Ensure strictly local modules. Remove all Express HTTP servers from the initial porting list.
4. **Integration Points**: OS boot sequence initializes hidden background processes before rendering the main Desktop UI.
5. **Critical Risks & Refactoring**: Zombie processes remaining alive after OS shutdown if lifecycle hooks fail to trigger `process.kill()`.

#### Phase 3: Strict Context Isolation & Security Preload
1. **Phase Objective**: Deeply enforce the Local-First/Privacy imperative by isolating the Renderer from Node.js globals.
2. **Directory & File Restructuring**: Establish `src/preload/index.js` and `src/main/ipcRouter.js`.
3. **Dependency Management**: Native Electron APIs only.
4. **Integration Points**: `contextBridge.exposeInMainWorld('nexusAPI', {...})` to explicitly map safe IPC channels (e.g., `window.nexusAPI.sendChatMessage()`).
5. **Critical Risks & Refactoring**: Accidental exposure of the `fs` or `child_process` module to the React layer, which severely compromises the vault security model.

---

### 🔵 PART 2: FRONTEND SHELL MIGRATION (NEXUS-PRIME)

#### Phase 4: Frontend Shell Migration & Vite Setup
1. **Phase Objective**: Port the entire visual framework of Nexus-Prime into the Electron Renderer.
2. **Directory & File Restructuring**: Move `Nexus-Prime/src/*` to `NexusOS/src/renderer/`.
3. **Dependency Management**: Migrate `tailwindcss v4`, `framer-motion`, and React Router. Resolve legacy CSS collisions.
4. **Integration Points**: Set up React Router to handle dynamic app launching on the Desktop layer.
5. **Critical Risks & Refactoring**: Total rewrite of any `fetch()` calls that were previously hitting external APIs, replacing them with `ipcRenderer.invoke()`.

#### Phase 5: Desktop Taskbar & Start Menu Evolution
1. **Phase Objective**: Transform standard web components into native-feeling OS components.
2. **Directory & File Restructuring**: `src/renderer/components/OS/{Taskbar, StartMenu, SystemTray}`.
3. **Dependency Management**: Use `Zustand` for lightning-fast UI state management across the OS.
4. **Integration Points**: Clicking a Taskbar icon sends an IPC message to the Main Process to allocate memory for a new app instance.
5. **Critical Risks & Refactoring**: React state desync between the Taskbar UI and the actual Electron background app states.

#### Phase 6: WindowManager & Multi-App Rendering Environment
1. **Phase Objective**: Build the draggable, resizable `WindowFrame` component for internal apps.
2. **Directory & File Restructuring**: Create `src/renderer/components/OS/WindowFrame.jsx`.
3. **Dependency Management**: Heavy reliance on CSS Grid/Flexbox and DOM manipulation. Local libraries only.
4. **Integration Points**: Native apps (Chat, System Monitor) render *inside* these dynamic `WindowFrame` components rather than opening new heavy Electron `BrowserWindows`.
5. **Critical Risks & Refactoring**: Deep component nesting causing severe DOM lag (Memory leaks from hidden components).

---

### 🟣 PART 3: BACKEND CORE INTEGRATION (VIBELAB/NEXUS)

#### Phase 7: Node.js Core Extraction & API Elimination
1. **Phase Objective**: Dismantle the Express.js server and convert all REST controllers into native Main Process modules.
2. **Directory & File Restructuring**: `Vibelab/backend/controllers/*` -> `NexusOS/src/main/services/`.
3. **Dependency Management**: Strip `express`, `cors`, and HTTP middlewares.
4. **Integration Points**: `router.post('/api/chat', ...)` becomes `ipcMain.handle('api:chat', ...)`.
5. **Critical Risks & Refactoring**: Massive refactoring of `req.body` and `res.json()` patterns into pure functions returning Promisified objects.

#### Phase 8: Local Storage & KnowledgeManager Database
1. **Phase Objective**: Ensure 100% offline Graph Memory and document storage.
2. **Directory & File Restructuring**: Create `src/main/database/` with SQLite and/local MongoDB drivers.
3. **Dependency Management**: Integrate `sqlite3`, local vector stores.
4. **Integration Points**: IPC channels strictly handling DB Read/Write arrays to prevent locking the UI thread.
5. **Critical Risks & Refactoring**: Corrupting user data on rapid system reboots or unhandled IPC errors.

#### Phase 9: AI Services Porting (GhostDeveloper & PredictiveEngine)
1. **Phase Objective**: Embed the autonomous AI agents directly into the OS Background layer.
2. **Directory & File Restructuring**: Port `ghostDeveloper.js` and `predictiveEngine.js` to `src/main/services/ai/`.
3. **Dependency Management**: Local Node.js ML wrappers.
4. **Integration Points**: AI triggers proactive popup notifications in the desktop UI using `WebContents.send()`.
5. **Critical Risks & Refactoring**: Background AI entering infinite reasoning loops, creating 100% CPU lockups on the OS.

#### Phase 10: HiveMind Micro-Orchestration
1. **Phase Objective**: The master brain that routes local tasks between AI modules.
2. **Directory & File Restructuring**: Port `hiveMind.js` to `src/main/services/ai/hiveMind.js`.
3. **Dependency Management**: Strictly isolated logic. No external dependencies.
4. **Integration Points**: The primary bridge querying the local LM Studio / local Ollama endpoints.
5. **Critical Risks & Refactoring**: Handling Model Timeout errors gracefully without crashing the Electron Main process.

---

### 🟠 PART 4: SMART BACKUP & DAEMON WORKERS

#### Phase 11: Smart Backup Daemon Initialization 
1. **Phase Objective**: Port Electron-Smart-Backup to act as an invisible, self-managing OS Service.
2. **Directory & File Restructuring**: Move backup logic to `src/main/daemons/backupDaemon.js`.
3. **Dependency Management**: `fs-extra`, `archiver`. 
4. **Integration Points**: Operates securely inside Electron's `UtilityProcess` to prevent Main thread blocking.
5. **Critical Risks & Refactoring**: Archiving massive directories freezing I/O for the entire OS. Need chunking and rate-limiting.

#### Phase 12: File System Watcher & Vault Monitoring
1. **Phase Objective**: Real-time privacy monitoring and synchronization.
2. **Directory & File Restructuring**: Create `src/main/daemons/vaultMonitor.js`.
3. **Dependency Management**: `chokidar` for deep directory watching.
4. **Integration Points**: Dispatches IPC events to update the Taskbar with visually syncing indicators.
5. **Critical Risks & Refactoring**: "Save Loops" where the backup zip file triggers the watcher recursively.

#### Phase 13: System Tray & Native OS Lifecycle
1. **Phase Objective**: Keep NexusOS running completely invisible in the native Windows tray.
2. **Directory & File Restructuring**: `src/main/trayComponent.js`.
3. **Dependency Management**: Electron `Tray`, `Menu` APIs.
4. **Integration Points**: "Minimize to Tray" and "Silent Boot" functionalities.
5. **Critical Risks & Refactoring**: Breaking the "Nuclear Cleanup" protocol; ensuring tray exit fully cleans up all nested node and python workers.

---

### 🔴 PART 5: PYTHON MICROSERVICES & GEMINI VAULT

#### Phase 14: Python Orchestrator Integration
1. **Phase Objective**: Build an unbreakable bridge to manage Python sub-processes from Node.js.
2. **Directory & File Restructuring**: `src/main/pythonOrchestrator.js`.
3. **Dependency Management**: Node's `child_process.spawn`. Isolated `venv` requirement.
4. **Integration Points**: Reads `stdout`/`stderr` from Python and redirects streams into IPC WebSocket equivalents.
5. **Critical Risks & Refactoring**: Orphaned Python `python.exe` processes hogging memory if the Electron app crashes unexpectedly.

#### Phase 15: Privacy-First Chat Client (React/Python Bridge)
1. **Phase Objective**: Decouple the Python UI from its backend, routing all Chat output to the React Renderer via Node.
2. **Directory & File Restructuring**: Python Logic -> `src/python-daemons/chat/`. UI -> `renderer/components/Apps/ChatClient`.
3. **Dependency Management**: Python libraries (`google-generativeai`, `requests`).
4. **Integration Points**: Pure data streaming (Streaming HTTP/IPC) to create real-time typing effects in the React frontend.
5. **Critical Risks & Refactoring**: String encoding breaking Arabic text payloads during IPC transit between Python -> C++ (Node) -> JS (React).

#### Phase 16: Gemini Vault & Encryption Architecture
1. **Phase Objective**: Integrate the `Gemini_Vault.bat` logic into a natively executed cryptographic system.
2. **Directory & File Restructuring**: Port scripts to `src/python-daemons/vault/cryptography.py`. 
3. **Dependency Management**: Python `cryptography` libraries.
4. **Integration Points**: Secure IPC handshake sending Passkeys from React -> Node -> Python for local file decryption.
5. **Critical Risks & Refactoring**: Keeping the encryption key resident in RAM. Must guarantee secure memory wiping after vault locking.

---

### 🟡 PART 6: SYSTEM OPTIMIZATION, SECURITY & PACKAGING

#### Phase 17: Telemetry & System Monitor Implementation
1. **Phase Objective**: Build the internal NexusOS Task Manager.
2. **Directory & File Restructuring**: `src/renderer/components/Apps/SystemMonitor`.
3. **Dependency Management**: `systeminformation` node module safely loaded in Main.
4. **Integration Points**: Main process broadcasts CPU, RAM, and Microservice statuses every 2000ms.
5. **Critical Risks & Refactoring**: Polling telemetry creating an excessive IPC bottleneck.

#### Phase 18: Unified Context Logger & Error Handlers
1. **Phase Objective**: Centralize logging across React, Node, and Python into a single uncrashable stream.
2. **Directory & File Restructuring**: `src/main/utils/logger.js`.
3. **Dependency Management**: `winston` or `pino`.
4. **Integration Points**: Piping Python `stderr` and React ErrorBoundaries to local `.log` files.
5. **Critical Risks & Refactoring**: Ensuring no sensitive User/Vault text is EVER written to the flat log files. 

#### Phase 19: Global State Hardening & IPC Event Bus
1. **Phase Objective**: Stabilize state mutations across all virtual OS components.
2. **Directory & File Restructuring**: Establish a strict Publisher/Subscriber bus in `eventBus.js`.
3. **Dependency Management**: Native Node `EventEmitter`.
4. **Integration Points**: AI triggers automatically update React contexts without manual polling.
5. **Critical Risks & Refactoring**: `MaxListenersExceededWarning` causing catastrophic failure from zombie IPC listeners.

#### Phase 20: Build Pipelines & PyInstaller Compilation
1. **Phase Objective**: Compile Python microservices into standalone `.exe` binaries to eliminate Python `.venv` dependencies for the end user.
2. **Directory & File Restructuring**: Create `build/` scripts and `.spec` configurations.
3. **Dependency Management**: `pyinstaller`.
4. **Integration Points**: The Node Orchestrator dynamically executes the `.exe` (Production) or `.py` (Development) depending on `process.env`.
5. **Critical Risks & Refactoring**: Windows Defender flagging unsigned PyInstaller executables as False-Positive Trojans.

#### Phase 21: Full System Profiling & QA Audit
1. **Phase Objective**: Execute extreme memory leak testing on the React DOM and Electron V8 Engine.
2. **Directory & File Restructuring**: N/A (Testing phase).
3. **Dependency Management**: Chrome DevTools Profiler, Jest.
4. **Integration Points**: End-to-end OS stress testing (opening 10 apps simultaneously while Vault writes data).
5. **Critical Risks & Refactoring**: Main Thread freezing. Requires moving any detected heavy routines to `WorkerThreads`.

#### Phase 22: Electron Builder & Final NexusOS Deployment
1. **Phase Objective**: Package the Monorepo into a single, polished Windows executable.
2. **Directory & File Restructuring**: Configure `electron-builder.yml`.
3. **Dependency Management**: `electron-updater` for offline-capable patch deployments.
4. **Integration Points**: Packing `dist/main`, `dist/renderer`, and local Python assets into an `.asar` archive.
5. **Critical Risks & Refactoring**: Application bloat (Sizes exceeding 1.5GB+). We need to aggressively tree-shake node_modules.

#### Phase 23: Localization & i18n Architecture
1. **Phase Objective**: Implement system-wide dual language support (Arabic RTL / English LTR) across the OS ecosystem.
2. **Directory & File Restructuring**: Establish `src/renderer/locales/` for JSON dicts and integrate i18n into React context.
3. **Dependency Management**: Integrate `react-i18next` or a custom lightweight i18n context provider.
4. **Integration Points**: OS native menus, React DOM direction toggling (LTR/RTL), and Python Daemon dynamic language bridging via IPC.
5. **Critical Risks & Refactoring**: React re-render cascades on language toggle and maintaining strict layout integrity in bidirectional CSS.

#### Phase 24: Secure Build & Deployment Pipeline
1. **Phase Objective**: Establish a dual-mode (Local vs. GitHub Release) Electron build pipeline with secure token injection and silent startup scripts.
2. **Directory & File Restructuring**: Create `scripts/Build-NexusOS.bat`, `scripts/build_launcher.py`, and `scripts/start_launcher.py`.
3. **Dependency Management**: Native python and batch scripting for the pipeline.
4. **Integration Points**: Modifying root `package.json` for portable target, GitHub provider, and linking scripts to the npm build processes.
5. **Critical Risks & Refactoring**: Secure memory-only GitHub token handling to prevent leaking credentials in the repo.

#### Phase 25: Self-Hosted Backend & Cloudflare Tunnel Foundation
1. **Phase Objective**: Split the database architecture: Local data remains local (SQLite/MongoDB), while cloud data (Authentication, System limits) runs on a dedicated Node.js microservice securely exposed via Cloudflare Tunnels connected to MongoDB Atlas.
2. **Directory & File Restructuring**: Create cloud backend repo structure or isolate cloud services. Configure `dbConnection.js` for dual routing.
3. **Dependency Management**: Standard MERN auth packages (`mongoose`, `express` for the tunneled instance).
4. **Integration Points**: Electron IPC must now route "Cloud Events" (Login, Sync) to the tunneled backend, and "Local Events" (Vault, Chat History) directly to the local DB.
5. **Critical Risks & Refactoring**: Mixing up connections and leaking local Vault telemetry to the Cloud.

#### Phase 26: Secure Cloud Authentication & RBAC
1. **Phase Objective**: Implement a full JWT-based Authentication suite with Role-Based Access Control (RBAC).
2. **Directory & File Restructuring**: Update cloud backend with Auth controllers, verification logic, and user models.
3. **Dependency Management**: `jsonwebtoken`, `bcrypt`, nodemailer (or equivalent) for Email Activation.
4. **Integration Points**: React UI needs Login/Register screens. "Forgot Password" flow via Email securely linked to the cloud DB.
5. **Critical Risks & Refactoring**: Unsecured JWT storage in the Renderer. Must use httpOnly cookies or secure IPC in-memory variables.

#### Phase 27: Admin Control Panel UI
1. **Phase Objective**: Build an untouchable "Master Admin" role and a dashboard to manage users.
2. **Directory & File Restructuring**: Create `src/renderer/components/OS/AdminDashboard/`.
3. **Dependency Management**: React table components, chart libraries for user metric visualizations.
4. **Integration Points**: Dashboard fetches all registered users from the tunneled backend. Allows banning, deletion, and Admin-promotion via secure Cloud API endpoints.
5. **Critical Risks & Refactoring**: API endpoint exposure allowing standard users to spoof Admin elevation payloads.

#### Phase 28: Zero-Tolerance Secrets Manager & Settings UI
1. **Phase Objective**: Eliminate all hardcoded API Keys and establish a secure, UI-driven Secrets Manager in NexusOS.
2. **Directory & File Restructuring**: Expand `src/renderer/components/OS/Settings` to include advanced API/Secrets input forms.
3. **Dependency Management**: AES Encryption libraries (e.g., `crypto-js` or Node native crypto) for resting keys.
4. **Integration Points**: Keys inputted in UI are encrypted instantly, then routed either to the Local DB (Personal OpenAI keys) or the tunneled backend (System-level API keys) for storage.
5. **Critical Risks & Refactoring**: Storing keys in plain text; failure to encrypt/decrypt properly breaking downstream AI services in Python/Node.

## Phase 50: Aegis Overlord (Nuclear Self-Healing Watchdog)
1. **Phase Objective**: Evolve the existing Aegis daemon into a nuclear-level, completely independent watchdog (`aegis-overlord.js`) residing in the project root.
2. **Directory & File Restructuring**: Create `aegis-overlord.js`. Archive/Delete `aegis-daemon.js`.
3. **Dependency Management**: Native Node.js `fs`, `child_process`, `http`.
4. **Integration Points**: Monitors `nexus_os.log`, HTTP ports (3001, 5173). Parses missing modules to auto-run `pnpm install`. Includes Guillotine Rollback for failed LLM patches. Sniper for Zombie processes.
5. **Verification Steps**:
    - [ ] **Silent Audit**: Verify log existence and connectivity to `nexus_os.log`.
    - [ ] **Daemon Ignition**: Execute `node aegis-overlord.js` and verify Matrix Terminal render.
    - [ ] **Zombie Snipe Test**: Squat on port 3001 (backend) and verify Aegis kills the intruder.
    - [ ] **Auto-Install Test**: Run a dummy script triggering a missing module and verify Aegis auto-installs it.
    - [ ] **Dashboard Link**: Verify `aegis-overlord.bat` creates a functional desktop shortcut.

## Action Required
Please type **Proceed** to authorize the start of Phase 50 Verification.

---

## Phase 56: NexusCode — AI-Powered Code Editor
1. **Phase Objective**: Build a VS Code-like coding environment natively within NexusOS, powered by Monaco Editor and the existing Nexus-Prime engine.
2. **Directory & File Restructuring**: Create `apps/nexus-desktop/src/components/Apps/NexusCode.jsx`.
3. **Dependency Management**: Integrate `@monaco-editor/react`. (Manual install required per terminal block rule).
4. **Integration Points**: Bind `fs:write` and `fs:stat` in `fileSystemService.js` and IPC channels to allow direct local file operations. Connect AI chat panel via `prime:chat` IPC.
5. **Verification Steps**:
    - [ ] **Dependency Check**: Ensure `@monaco-editor/react` is installed in `package.json`.
    - [ ] **Backend IPC Test**: Verify `fs:write` properly sandwiches modifications via `dockerSandbox`.
    - [ ] **Editor Render Test**: Open `NexusCode` and ensure Monaco mounts securely without violating CSP rules.
    - [ ] **AI Context Test**: Execute an AI prompt within the editor and verify syntax styling and logic patching.

---

## Phase 49: Desktop Cleanup & Monitoring Consolidation
1. **Phase Objective**: Remove hovering widgets ("System HUD" and the hidden "Sabotage" test) from the desktop, ensuring all system monitoring is consolidated exclusively within the dedicated System Monitor application.
2. **Directory & File Restructuring**: Delete `SystemHUD.jsx` and `SabotageReact.jsx`. Update `App.jsx` to remove their imports and rendered components.
3. **Dependency Management**: N/A (Standard cleanup).
4. **Integration Points**: Ensure the removed `SystemHUD` telemetry listeners are either already present in `SystemMonitorApp.jsx` or safely removed if redundant. Ensure the "Monitor" app remains the sole source of system telemetry in the system.
5. **Verification Steps**:
    - [ ] **UI Audit**: Run the app and ensure the desktop is clean of the System HUD and Sabotage widget.
    - [ ] **Monitor Audit**: Open the "Monitor" app to verify system stats (CPU, RAM) still function correctly without the HUD.

---

## Phase 57: Legacy Feature Evolution & System Pulse
1. **Phase Objective**: Complete the constitutional mandate (Verify-Nexus.bat, System Pulse, Audit) and apply the Phoenix Protocol to 10x evolve a legacy component (`BiometricSetup.jsx` -> `NexusIdentityShield.jsx`).
2. **Directory & File Restructuring**: 
    - Create `Verify-Nexus.bat` on the user's Desktop.
    - Create `NexusIdentityShield.jsx` in `Apps` or `OS` components.
    - Add `System Pulse` to the OS header (`DesktopWidgets.jsx` or similar).
3. **Dependency Management**: Native modules, `lucide-react`.
4. **Integration Points**: 
    - `System Pulse` will read `NEXUS_INTEGRITY_LEDGER.json`.
    - `NexusIdentityShield` will be a desktop app that acts as a secure entryway simulation.
5. **Verification Steps**:
    - [x] **Bat Check**: Validate `Verify-Nexus.bat` exists on the Desktop.
    - [x] **Pulse Render Test**: Open the OS and verify the glowing Green/Red pulse in the top bar.
    - [x] **Identity Shield Execution**: Launch the new Identity Shield and ensure its 10x 3D visual animations render correctly in the browser without UI breaks.

---

## Phase 65: Nexus-Aura Ambient Context
1. **Phase Objective**: Synchronize the OS aesthetics (colors, glow, transitions) with the real-time system state (Health, Load, Time).
2. **Directory & File Restructuring**: Update `App.jsx` and `index.css`.
3. **Dependency Management**: Standard React & CSS Variables.
4. **Integration Points**: The system will read the Integrity Ledger and update CSS `--aura-` tokens.
5. **Verification Steps**:
    - [x] **Aura Audit**: Verify CSS tokens update when mock health state changes.
    - [x] **Pulse Sync**: Verify the desktop wallpaper pulse matches the Taskbar health pulse.

---

## Phase 66: Nexus Ghost Veil (Privacy Innovation)
1. **Phase Objective**: Build an AI-driven privacy tool to mask human figures in photos using advanced "Ghost Aura" aesthetics.
2. **Directory & File Restructuring**: Create `apps/nexus-desktop/src/components/Apps/NexusGhostVeil.jsx`. Modify `PantheonGallery.jsx` to integrate the "Veil" trigger.
3. **Dependency Management**: Canvas API, CSS Filters, and Framer Motion for holographic effects.
4. **Integration Points**: 
    - Pantheon Gallery will pass image base64 context to Ghost Veil.
    - Ghost Veil will allow saving back to the "Vault" or "Pictures" folder.
5. **Innovations**:
    - **Neural Body Segmentation**: AI-powered (simulated or canvas-assisted) mask generation.
    - **Pixelated Ghosting**: High-end cyberpunk pixelation style.
    - **Scrub & Mask**: Automated EXIF metadata removal.
    - **Aura Encryption Visuals**: The masking process looks like a holographic encryption scan.
6. **Verification Steps**:
    - [ ] **Image Hand-off**: Verify Gallery can launch Ghost Veil with the correct image.
    - [ ] **Mask Integrity**: Ensure the blur/pixelation covers the designated area correctly.
    - [ ] **Export Test**: Verify the processed image is saved without local metadata.

---

### 🟢 PART 12: NEXUS-PRIME ORCHESTRATOR & AI GATEWAY

#### Phase 49: AI Priority Queue, Zero-Shot Cache, and Nexus AI Control
1. **Phase Objective**: Centralize and strictly manage VRAM/AI operations. All AI tools (GhostDeveloper, Sentinel, Animus, knowledgeController) must route through `AiOrchestrator`, which features a Priority Queue and a MongoDB-backed Semantic Zero-Shot Cache to save VRAM on identical prompts.
2. **Directory & File Restructuring**:
    - Create `apps/backend-core/src/services/aiOrchestrator.js`
    - Refactor `apps/nexus-desktop/src/components/Apps/NexusPrimeDashboard.jsx` to double as the "Traffic Control Tower" (Live Queue, Cache Hit Rate). Rename OS entry to "Nexus AI Control 🎛️".
3. **Dependency Management**: Native `crypto` for hashing prompts, `mongodb` for the `ai_request_cache` collection.
4. **Integration Points**: Replace internal routes calling `aiService` or `nexusPrimeEngine` to strictly enqueue through `AiOrchestrator.prompt()`.
5. **Critical Risks & Refactoring**:
    - Blocking high-priority tasks (e.g., Sentinel Crash Recovery) due to long-running background tasks (e.g., Animus Evolution). The Priority Queue must effectively bypass or pause low-priority tasks.
    - Cache collision on heavily context-dependent UI state predictions (Zero-Shot Cache should only be 100% exact match).
6. **Verification Steps**:
    - Run the AI Control dashboard and submit multiple identical requests; verify UI shows a "Cache Hit".
    - Run an Animus background task (LOW) and a user chat prompt (HIGH); verify the chat prompt bypasses the background task in the Live Queue.

---

### 🟢 PART 13: COMPREHENSIVE SYSTEM OPTIMIZATION
#### Phase 67: App Deduplication & Legacy Optimization
1. **Phase Objective**: Complete the comprehensive NexusOS audit by eliminating duplicate apps (NexusGallery vs PantheonGallery) and integrating missing legacy status widgets.
2. **Directory & File Restructuring**: 
    - Delete `src/components/Apps/NexusGallery.jsx`.
    - Modify `src/components/Apps/PantheonGallery.jsx` to inherit Framer Motion native zoom/drag capabilities from `NexusGallery`.
    - Modify `src/components/Apps/SystemMonitor.jsx` to include real-time Network In/Out bandwidth sparkline graphs (replacing `NetSpeedWidget.jsx`).
    - Remove references to `NexusGallery` from `App.jsx`, `WindowFrame.jsx`, and `StartMenu.jsx`.
3. **Dependency Management**: Native `framer-motion` properties.
4. **Integration Points**: Ensures UI remains clean and prevents functional overlap, maintaining strict adherence to the Supreme System Constitution.
5. **Verification Steps**:
    - [ ] **Gallery Merge Validation**: Verify `PantheonGallery` launches correctly and supports native Framer Motion zoom/pan.
    - [ ] **Network Tracker**: Verify `SystemMonitor` displays active real-time graph data for NetIn / NetOut.
    - [ ] **Clean App Registry**: Verify no broken shortcuts exist in the StartMenu for the deleted `NexusGallery`.

---

### 🟢 PART 14: SYSTEM INTELLIGENCE & AGENTIC AI
#### Phase 68: Vibelab Chat Intelligence Integration
1. **Phase Objective**: Complete a sweeping audit of legacy Vibelab files and extract its core agentic features to make NexusOS fully autonomous. This includes The Citadel (Psychometrics), Autonomous Knowledge Vault (RAG), and Action Executor (Tool Use).
2. **Directory & File Restructuring**:
    - Create `src/main/services/ai/actionExecutor.js`.
    - Create `src/main/services/ai/knowledgeManager.js`.
    - Create `src/main/services/ai/profileManager.js`.
3. **Dependency Management**: Native `fs-extra`, `@langchain/community` (FAISS), `cheerio`, `axios`.
4. **Integration Points**: 
    - Connect local LM Studio `text-embedding-bge-m3` directly to FAISS for vector memory.
    - Connect AI tool execution into the existing `nexusPrimeEngine` or `AiOrchestrator`.
5. **Verification Steps**:
    - [ ] **The Citadel Check**: Verify `Psycho_Analysis.md` generating for `activeUser`.
    - [ ] **Memory Persistence Test**: Teach NexusChat a random fact, open a new chat, and test retrieval.
    - [ ] **Tool Execution Test**: Give NexusChat an explicit command to search the web or list files and verify execution log output.

---

### Phase 77: Ignition & Lifecycle Control
**Goal**: Create a native OS one-click launch experience and hard kill-switch lifecycle management.

#### 1. Ignition Shortcut
- **File**: `scripts/Nexus_Ignition.bat`
  - **Logic**: Use `start /b` for backend/frontend and `timeout` then `start http://localhost:5173`.
- **File**: `scripts/create-desktop-shortcut.js`
  - **Logic**: Use `ws-shortcut` or fallback VBScript to create a strict `.lnk` on the Desktop pointing to the bat file, run minimized.

#### 2. Kill Switch API
- **File**: `apps/backend-core/src/routes/powerRoutes.js` (or inject into `aiOrchestrator`)
  - **Logic**: `process.exit(0)` for shutdown, and spawn detached process for restart.
- **File**: Wire routes in `apps/backend-core/src/main.js`.

#### 3. Native UI Controls
- **File**: `apps/nexus-desktop/src/components/OS/StartMenu.jsx`
  - **Logic**: Add Power Options group at the bottom: "Restart" and "Shutdown".
  - **Action**: Fetch POST to `/api/power/*` and show an OS Toast ("Shutting down..."). 

#### 4. Verification Plan
- Run `node scripts/create-desktop-shortcut.js` and verify `.lnk` placement.
- Start servers using `Nexus_Ignition.bat`.
- Trigger `/api/power/shutdown` via `curl` or UI and verify `node.exe` termination.

---

## Phase 78: Federated Web Search (Legacy Forge)

### 1. Component Extraction
- Extract `performWebSearch` from Vibelab's `toolController.js`.
- It includes multi-engine fallback (Tavily, Bing, Google, Wikipedia) and an LLM "Critic Validation Loop".

### 2. Architecture Injection
- **[NEW] `apps/backend-core/src/skills/searchSkill.js`**: Create this file to export `performWebSearch`. Update logger to `@nexus/logger`.
- **[MODIFY] `apps/backend-core/src/services/nexusPrimeEngine.js`**: Register `performWebSearch` in the `_executeTool` switch statement so OpenClaw subagents can utilize the Federated Search.

### 3. Hardware-Aware Mandate
- The search executes lightweight HTTP calls and specifically uses `text-embedding-bge-m3` or the lightweight 7B model for the Critic Validation Loop to conserve VRAM.

### 4. Verification
- Use `node.js` locally to invoke the `searchSkill.js` with a query like "NexusOS".
- Open Nexus Chat and ask "ابحث في الانترنت عن تحديثات الذكاء الاصطناعي 2026", confirming the tool `performWebSearch` is invoked.

---

## Phase 79: Ghost Developer (Vision AI)

### 1. Component Extraction
- Extract `ghostDeveloper.js` from Vibelab legacy directory to NexusOS `apps/backend-core/src/services/`.
- Update Logger to `@nexus/logger`.

### 2. Backend Injection
- **[NEW] `npm install screenshot-desktop`** in `apps/backend-core`.
- **[MODIFY] `ui-bridge.js`**: Add the following endpoints:
  - `GET /api/ghost/stream` (SSE server)
  - `POST /api/ghost/start` (Starts background interval)
  - `POST /api/ghost/stop` (Kills background interval)
  - `GET /api/ghost/status`

### 3. Frontend UI Wiring
- **[NEW] `GhostListener.jsx`**: An invisible component in `apps/nexus-desktop/src/components/AI/` that connects to the SSE stream and dispatches OS toasts when `ghost_error` events arrive.
- **[MODIFY] `App.jsx`**: Render `<GhostListener />` in the background layer.
- **[MODIFY] `Settings.jsx`**: Add a toggle switch in the "Neural Link Configuration" tab to start/stop the Ghost Developer visually.

### 4. Hardware-Aware Mandate
- Scan interval is strictly set to 15 seconds to prevent continuous CPU spiking.
- Vision LLM checks are lightweight boolean outputs.

### 5. Verification
- Open VS Code with an obvious forced syntax error in view.
- Wait 15 seconds and verify the OS Toast appears detecting the exact error.

---

## Phase 82: God-Mode Anti-Refusal System Prompt Override

### 1. Component Analysis
- The Cortex AI (Nexus Prime Engine) is currently hallucinating standard cloud-LLM refusal responses (e.g., "I cannot play music") instead of utilizing its `windowsSkill` to interface with the local machine.
- This breaks the Omni-Action Engine paradigm. 

### 2. Prompt Architecture Update
- **[MODIFY] `apps/backend-core/src/services/nexusPrimeEngine.js`** (or relevant agent file): Inject a severe, upper-cased `CRITICAL DIRECTIVE` at the very top of `SYSTEM_PROMPT`.
- The directive will explicitly ban standard refusal phrases ("I cannot do this", "I am an AI", apologies) and demand mandatory tool usage (`executeCommand` via `windowsSkill`) for physical OS requests like opening websites, playing music, or launching apps.

### 3. Windows Skill (Tool) Enhancement
- **[MODIFY] `apps/backend-core/src/skills/windowsSkill.js`**: Review the existing module. Ensure `executeCommand` (or equivalent shell execution function) is aggressively robust. It should support opening native Windows apps and URLs (using `start` or `explorer` commands) and cleanly catch syntax errors without crashing the main Node thread.

### 4. Verification Plan
- Use the Dev Tools / OS Terminal to send a direct query to Cortex AI: "Open Anghami and play music."
- Verify that the AI responds with a Tool Call (`executeCommand` with `start https://play.anghami.com`) and does not output a conversational refusal.

---

## Phase 80: God-Mode Assimilation and Privacy Hardening

### 1. Database Security & Encryption (Nuclear Privacy)
- **Objective:** Implement AES-256 encryption for all sensitive data stored in local MongoDB/SQLite/NeDB (User Profiles, Chat History, Memory Cortex chunks).
- **Files to Modify:** `packages/database/index.js` (or relevant wrappers). Create `packages/database/encryption.js`.
- **Logic:** Encrypt strings before saving; decrypt upon retrieval. Ensure no plaintext user data is exposed.

### 2. Hardening the Omni-Action Engine
- **Objective:** Completely remove legacy mock subagents in `openClawBridge.js`. Force all execution natively through `windowsSkill.js` and `aiOrchestrator.js`.
- **Files to Modify:** `apps/backend-core/src/services/openClawBridge.js`, `apps/backend-core/src/services/aiOrchestrator.js`.
- **Logic:** Refactor `<tool_call>` JSON parsing logic in `aiOrchestrator.js` to strictly enforce local LLM constraints. Eject OpenClaw GitHub checks and mock agents. 

### 3. Cortex AI Continuous Learning
- **Objective:** Enable background asynchronous web scraping validation to feed the local Knowledge Base invisibly.
- **Files to Modify:** `apps/nexus-desktop/src/components/Apps/CortexAI.jsx`.
- **Logic:** Start an invisible interval that performs periodic `searchKnowledge` and `performSearch` to ingest new context directly into the DB.

### 4. Infinite Autonomous Evolution Loop
- **Objective:** Continuously analyze codebase, refine AI, optimize search, and upgrade Omni-Action Engine dynamically without waiting for prompts.
- **Verification:** Run diagnostic local node scripts verifying data gets encrypted and tools parse correctly.