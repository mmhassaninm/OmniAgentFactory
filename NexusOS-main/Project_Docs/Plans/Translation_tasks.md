# NexusOS Translation & Localization Checklist

- [x] **1. React Frontend Subsystem Setup**
  - [x] Install `react-i18next` and `i18next`.
  - [x] Create `src/renderer/locales/en.json` and `src/renderer/locales/ar.json`.
  - [x] Initialize `i18n.js` config in the React root.
  - [x] Create a `LanguageContext` provider to toggle HTML `dir` attributes globally.

- [x] **2. UI Refactoring for Logical RTL Support**
  - [x] Audit all Tailwind CSS classes across `Nexus-Prime` components.
  - [x] Replace hardcoded left/right CSS (e.g., `ml-4`, `pl-2`) with logical CSS (e.g., `ms-4`, `ps-2`).
  - [x] Integrate local fonts for Arabic (e.g., Cairo/Tajawal) and configure Tailwind theme to switch families depending on language.

- [x] **3. Electron Main Process Localization**
  - [x] Setup `src/main/locales.js` dictionary in the Main process (Integrated via Settings IPC).
  - [x] Refactor `src/main/components/tray.js` to build dynamic context menus based on selected language.
  - [x] Ensure the IPC `window.nexusAPI.invoke('os:change-language', lang)` updates the Main process state and rebuilds the tray.s dynamically.

- [x] **4. Python & Background Daemon Synchronization**
  - [x] Append OS language tag metadata to AI IPC prompts.
  - [x] Translate Node.js notification alerts before sending `WebContents.send()` to the UI.
  - [x] Set up strict UTF-8 encoding checks in the Python standard output handlers to prevent text corruption.
