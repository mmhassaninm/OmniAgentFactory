# NEXUS_AUDIT_PLAN.md - MASTER AUDIT & REPAIR BLUEPRINT

This plan details the autonomous review and self-healing loop for NexusOS.

## STAGE A: Backend Core & IPC Wiring
**Objective:** Eliminate "Unauthorized IPC invoke channel" and "No handler registered" errors.

- [ ] **Audit `ipcRouter.js`:** 
    - Verify registration of `animus`, `chaos`, `pantheon` domains.
    - Path: `src/main/ipcRouter.js`
- [ ] **Audit `preload/index.js`:**
    - Ensure all frontend-requested channels are whitelisted.
    - Path: `src/preload/index.js`
- [ ] **Verify ESM/CJS Bridging:**
    - Ensure dynamic imports for `@nexus/backend-core` services work across the boundary.

## STAGE B: AI Orchestrator & VRAM Management
**Objective:** Ensure LM Studio stability and surgical prompting.

- [ ] **Audit `nexusPrimeEngine.js`:**
    - Check GPU status polling logic.
    - Verify smart switching between 8B (FAST) and 14B (SMART) models.
    - Path: `apps/backend-core/src/services/nexusPrimeEngine.js`
- [ ] **Audit Sentinel V3 Integration:**
    - Ensure `sentinelService.js` is correctly calling `PrimeEngine.promptRaw`.

## STAGE C: Frontend UI Components (Aesthetics & Security)
**Objective:** Enforce PREMIUM GLASSMORPHISM and zero context isolation violations.

- [ ] **Scanner: `window.require` violations:**
    - Search for any raw `require()` in `apps/nexus-desktop/src`.
    - Replace with `window.nexusAPI` calls.
- [ ] **Audit Styling Tokens:**
    - Ensure `backdrop-blur`, `bg-white/10`, and `border-white/20` (Glassmorphism) are consistently applied.
    - Path: `apps/nexus-desktop/src/index.css` and component-level classes.

## STAGE D: Python Daemon Connections
**Objective:** Confirm STDIN/STDOUT piping stability.

- [ ] **Audit `pythonOrchestrator.js`:**
    - Verify daemon path resolution on Windows.
    - Check health status of `shell` processes.
    - Path: `src/main/pythonOrchestrator.js`

---

## HEALING PROTOCOL (Phase 3)
1. For each `[ ]` item:
    - Read file chunk.
    - Identify logic/style gaps.
    - Apply surgical patches.
    - Mark `[x]`.

## VALIDATION LOOP (Phase 4)
1. Spawn dev env (`npm run dev`).
2. Listen to stdout/stderr.
3. Catch crashes → Auto-heal → Restart.
4. Goal: Zero errors in terminal for 15s.
