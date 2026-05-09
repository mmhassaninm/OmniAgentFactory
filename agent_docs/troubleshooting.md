# Troubleshooting

## Vite "Failed to load /src/main.jsx — file not found"
**Cause**: `start_omnibot.bat` was using `subst S:` to map a virtual drive, then launching Vite from `S:\frontend`. Vite's internal `fs.realpathSync` + module resolver can produce path-not-found errors through the virtual drive.
**Fix**: Remove the `subst` setup. Use `%BASE_DIR%frontend` (where `BASE_DIR=%~dp0`) so Vite runs directly from the real absolute path. The `#` in the path that originally motivated the subst workaround no longer exists — the project is now at `D:\2026\Projects\AI\OmniBot-main`.
**Status**: Fixed 2026-05-06 in `start_omnibot.bat`.

## Uvicorn watching `S:\backend` instead of real path
**Cause**: Same `subst S:` setup — uvicorn was launched from `S:\backend`, so its file watcher reported the virtual drive path.
**Fix**: Same as above — use `%BASE_DIR%backend` absolute path directly.
**Status**: Fixed 2026-05-06 in `start_omnibot.bat`.

## NumPy 2.0 / chromadb incompatibility
**Symptom**: `AttributeError: module 'numpy' has no attribute 'float_'`
**Fix**: Pin `numpy<2.0` in `backend/requirements.txt`.

## `#` in project path breaking Vite (historical — no longer applies)
The project was previously at `D:\#2026\...`. The `#` caused Vite's URL parser to treat it as a fragment. Workaround was `subst S:`. Project has since been moved to `D:\2026\...` (no `#`), so the subst workaround is no longer needed and should NOT be used.
