# 🛡️ Nexus-Sentinel: The Autonomous Self-Healing Matrix

## 🧠 Concept (Out-of-the-Box)
Standard auto-restarters (like nodemon or pm2) just blindly restart failing code. `Nexus-Sentinel` is a "Self-Evolving Code Surgeon". It intercepts crashes at the Node.js/V8 level, analyzes the Abstract Syntax Tree (AST), queries our Dual-Provider AI for a highly-scoped patch, applies it, and commits the successful fix to a Vector Database so it "learns" forever.

## ⚙️ The 5-Step Sentinel Loop
1. **The Interceptor (Zero-Downtime Trap):**
   - Hooks into `process.on('uncaughtException')`, `unhandledRejection`, and overwrites `console.error`.
   - Instead of killing the app, it freezes the specific corrupted module using Node's `vm` module or dynamic proxying.
2. **Context Builder (The Detective):**
   - Parses the Stack Trace to pinpoint the exact File, Line, and Column.
   - Uses `acorn` or `babel/parser` to extract the *exact function* or *class* where the error occurred (not just regex, which is brittle).
   - Fetches the last 3 Git commits for that file to understand recent changes.
3. **Memory Vault (Self-Evolution):**
   - Queries the local SQLite/VectorDB: *"Have we seen this exact Stack Trace + AST combination before?"*
   - If YES -> Apply historical patch instantly (0ms latency, bypassing AI).
4. **AI Surgical Prompting (Dual-Provider):**
   - If NO -> Sends the isolated AST chunk, the Error, and the Stack Trace to Gemini/LM Studio.
   - *Strict Constraint:* The AI is forced to return a JSON array of specific line replacements (e.g., `{"line": 42, "replaceWith": "if (authService && authService.init) {"}`).
5. **The Hot-Swapper & Verifier:**
   - Applies the patch using Node `fs`.
   - Spawns a hidden `child_process` to dry-run the patched file.
   - If it survives for 5 seconds without throwing -> Hotswap in main process, log to `DEVLOG.md`, and save the exact solution to the VectorDB.
   - If it fails -> Rollback, increase AI Temperature, and try strategy B.

---

## 🖥️ V2: Omniscient Multi-Runtime Matrix

### Cross-Language STDIO Hijacking
Sentinel V2 extends beyond Node.js. It monitors **all child processes** (Python, Shell) via their `stdout`/`stderr` streams. Any spawned Python process is injected with `sentinel_hook.py`, which overrides `sys.excepthook` and `warnings.showwarning`. Intercepted events are serialized as JSON and printed to `stdout` with the `[SENTINEL_PY_INTERCEPT]` prefix, creating a cross-runtime bridge.

### Warning-Level Background Healing
V1 only handled fatal crashes. V2 introduces a **BackgroundHealingQueue** that silently captures `console.warn`, `console.error`, and `process.on('warning')` events. Non-fatal warnings (deprecation notices, missing paths, failed loads) are queued and analyzed by the Dual-Provider AI **in the background**, generating patches that are applied on the **next boot** without interrupting the current session.

### Python Integration Loop
1. `pythonOrchestrator.js` spawns a Python child process.
2. `sentinel_hook.py` (imported at the top of any Python daemon) overrides `sys.excepthook` and `warnings.showwarning`.
3. On crash/warning, the hook prints `[SENTINEL_PY_INTERCEPT]{"type":"...", "message":"...", "file":"...", "line":...}` to stdout.
4. The Node.js orchestrator detects the prefix and routes the JSON payload to `sentinelService.handlePythonIntercept()`.
5. Sentinel analyzes the Python file, queries the AI, and patches it using Node.js `fs`.
6. The fix is saved to the Memory Vault for instant replay on future occurrences.

---

## 🎨 Sentinel-UI Boundary (Frontend Protection)

The final layer of the Sentinel Matrix protects the React Application.

### The ErrorBoundary Interceptor
A top-level `<ErrorBoundary>` wraps the React component tree. When a renderer crash occurs:
1. The UI instantly swaps to a secure "Healing in Progress..." Glassmorphism fallback screen.
2. The React error stack trace is extracted and forwarded to the backend via an IPC channel (`sentinel:heal-ui`).

### Frontend AST Healing & HMR
1. The backend `sentinelService.js` receives the UI crash payload.
2. It parses Vite's stacked error message to identify the mutated `.jsx` or `.css` file.
3. The Dual-Provider AI generates a surgical patch for the frontend code.
4. Sentinel applies the patch to the filesystem.
5. **Vite Hot Module Replacement (HMR)** detects the file change and automatically injects the fixed module into the running browser window safely.
6. The `ErrorBoundary` listens for a successful HMR/reload signal and unmounts the fallback UI, restoring the user's session autonomously without a hard refresh.

### Architecture Diagram
```
┌─────────────────────────────────────────────────────────┐
│                   NEXUS-SENTINEL V2                     │
│               Omniscient Multi-Runtime Matrix            │
├───────────────────────────┬─────────────────────────────┤
│     Node.js Runtime         │      Python Runtime          │
│  ┌─────────────────────┐  │  ┌───────────────────────┐  │
│  │ uncaughtException   │  │  │ sys.excepthook        │  │
│  │ unhandledRejection  │  │  │ warnings.showwarning  │  │
│  │ console.warn/error  │  │  │ traceback.format_exc  │  │
│  │ process.on('warning')│  │  │                       │  │
│  └─────────┬───────────┘  │  └───────────┬───────────┘  │
│            │              │              │              │
│            ▼              │     STDIO    ▼              │
│  ┌─────────────────────┐  │  ┌───────────────────────┐  │
│  │  sentinelService.js  │◄─┤──│ [SENTINEL_PY_INTERCEPT] │  │
│  └─────────┬───────────┘  │  └───────────────────────┘  │
│            │              │                              │
│            ▼              │                              │
│  ┌─────────────────────┐  │                              │
│  │  Dual-Provider AI    │  │                              │
│  │  (Gemini / LM Studio)│  │                              │
│  └─────────┬───────────┘  │                              │
│            ▼              │                              │
│  ┌─────────────────────┐  │                              │
│  │  Memory Vault (SHA)  │  │                              │
│  └─────────────────────┘  │                              │
└───────────────────────────┴─────────────────────────────┘
```
