# NexusOS Translation & i18n Architecture Plan

## 1. Objective
Achieve 100% native dual-language support (Arabic RTL / English LTR) across the entire NexusOS ecosystem. This encompasses the React frontend, Electron native menus, Python microservices, and system logging.

## 2. Technical Strategy

### A. React Frontend (Renderer Process)
- **Library**: `react-i18next` for robust state management without extreme re-rendering penalties.
- **Language Dictionaries**: Stored in `src/renderer/locales/en.json` and `src/renderer/locales/ar.json`.
- **Direction Toggle**: A global `ThemeProvider` or `LanguageProvider` will manipulate `document.documentElement.dir = 'rtl' | 'ltr'` dynamically.
- **CSS Architecture**: Use logical css properties (`margin-inline-start`, `padding-inline-end`) in Tailwind v4 instead of hardcoded `ml` or `pr` to automatically flip layouts without separate stylesheets.

### B. Electron Main Process
- **Native OS Elements**: Electron's `Menu`, `Tray`, and native `dialog` popups must respond to language changes.
- **IPC State Sync**: When the user changes language in React, it sends an `ipcRenderer.send('system:language-change', 'ar')` to the Main process to dynamically rebuild the native menus.
- **Boot Default**: The Main process reads the saved language preference from the local DB before creating the MainWindow to prevent localized flickering.

### C. Python & Node.js Background Daemons
- **AI Responses**: Ensure that Python models (Gemini / Local LLMs) are prompted via system instructions to respond in the selected OS language.
- **Daemon Errors & Logs**: All user-facing alerts (e.g., "Backup Complete", "Vault Locked") emitted from Node.js/Python must query an internal dictionary before being sent to the React UI via IPC.

## 3. Critical Constraints
- Do not let language switching break the secure React/Python IPC pipelines by enforcing strict UTF-8 payload encoding.
- Ensure all fonts loaded (e.g., Cairo for Arabic, Inter for English) are strictly bundled locally. No Google Font external CDNs allowed per privacy constraints.
