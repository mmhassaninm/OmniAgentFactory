# NexusOS Prevention Guide

> Every bug we fix teaches us a pattern. This document captures root causes and prevention rules so the same class of bug never returns.

---

## 🔴 Rule #1: IPC Payload Extraction

**Root Cause:** Frontend sends `invoke(channel, { key: value })`. The IPC handler receives the wrapped object as a single parameter, but the backend function expects a raw primitive (e.g., a plain string ID).

**Example:** `animus:inject` received `{ itemId: "abc123" }` but passed it directly to `approveAndInject(itemId)`, which called `new ObjectId({ itemId: "abc123" })` → **silent throw**.

**Prevention Rule:**
```javascript
// ❌ WRONG — passes entire payload object
ipcMain.handle('service:action', async (event, data) => {
    return service.method(data);
});

// ✅ CORRECT — extract specific fields
ipcMain.handle('service:action', async (event, payload) => {
    const id = typeof payload === 'string' ? payload : payload?.itemId;
    return service.method(id);
});
```

**Scope:** Every `ipcMain.handle` that passes user data to a backend method.

---

## 🔴 Rule #2: Bridge Method Completeness

**Root Cause:** `bridge.js` only had `invoke()`. When `ThermalAlertListener` called `nexusBridge.receive()`, it threw `is not a function`.

**Prevention Rule:** The bridge abstraction layer MUST mirror every method exposed by `window.nexusAPI` in the preload:
- `invoke(channel, payload)` — request/response
- `receive(channel, callback)` — main→renderer push
- `send(channel, data)` — renderer→main fire-and-forget

**Scope:** Any new preload method MUST be proxied in `bridge.js` immediately.

---

## 🟡 Rule #3: MongoDB ObjectId Validation

**Root Cause:** Passing non-string values to `new ObjectId()` causes cryptic errors that are hard to debug.

**Prevention Rule:**
```javascript
// Always validate before constructing
if (typeof itemId !== 'string' || itemId.length !== 24) {
    return { error: 'Invalid ObjectId format' };
}
const oid = new ObjectId(itemId);
```

**Scope:** Every backend function that accepts a user-provided MongoDB ID.

---

## 🟡 Rule #4: Named vs Default Exports

**Root Cause:** `import { nexusBridge }` vs `import nexusBridge` — using the wrong import style causes `undefined` at runtime, with no build-time error from Vite.

**Prevention Rule:**
- Files that `export default` → import with `import X from '...'`
- Files that `export const` → import with `import { X } from '...'`
- Never mix both in the same module for the primary export

**Scope:** All service modules (`bridge.js`, `toastBus.js`, etc.)

---

## 🟡 Rule #5: Post-Action State Sync

**Root Cause:** After mutating data (inject/reject), the frontend removed items from local state via `.filter()` instead of re-fetching from MongoDB. This causes stale state if the backend operation fails.

**Prevention Rule:** After any mutation call, **re-fetch** the authoritative state from the backend:
```javascript
// ❌ WRONG — optimistic local removal
setQueue(prev => prev.filter(item => item.id !== id));

// ✅ CORRECT — re-fetch from MongoDB
const result = await nexusBridge.invoke('animus:inject', { itemId: id });
if (result?.success) await refresh();
```

**Scope:** All dashboard components that modify backend state.
