# Conventions

## Naming
- Backend: Python / FastAPI only. No Node.js in backend.
- Frontend entry: `frontend/src/main.jsx` → `frontend/index.html` → `frontend/vite.config.js`

## Frontend Design System (Neural Dark — established 2026-05-07)
- All colors via CSS custom properties in `index.css :root` — never hardcode hex values in component files
- Variable naming: `--bg-base`, `--bg-panel`, `--bg-card`, `--bg-elevated` for backgrounds; `--accent-primary` (#00d4ff), `--accent-secondary` (#7c3aed), `--accent-success/warning/error` for status
- Utility class prefix: `nd-*` (e.g. `nd-bubble-ai`, `nd-avatar-ai`, `nd-dot`, `nd-tooltip`) — defined in `index.css`
- CSS tooltips: add `className="nd-tooltip"` + `data-tooltip="Label"` to any button; no extra markup required
- Sidebar active conversation: use `nd-conv-item nd-conv-active` + inline `borderLeftColor: accentHex` for folder-color glow
- Message bubbles: AI = `nd-bubble-ai` (purple left border), User = `nd-bubble-user` (teal right border)
- Scrollbars: use `custom-scrollbar` class — thin (3px), teal, only visible on hover
- Transitions: always `var(--t-base)` (200ms ease-out); fast interactions use `var(--t-fast)` (150ms)
- Framer Motion `layoutId="settings-tab-bg"` drives the sliding indicator in SettingsModal tabs
- Welcome screen SVG uses `nd-svg-node` / `nd-svg-edge` CSS animation classes (no JS)
- `nd-btn-gradient`: pseudo-element gradient border animation on hover; set `position: relative; z-index: 0` on the element

## Confirmed anti-patterns
- Do NOT use `subst` virtual drives to work around path issues — they cause Vite path resolution errors (see troubleshooting.md).
- Do NOT hardcode API keys anywhere in code.
- Do NOT add new npm packages for pure visual features — use CSS-only approaches (see Neural Dark redesign for reference).
