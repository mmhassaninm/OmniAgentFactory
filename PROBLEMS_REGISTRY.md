# PROBLEMS REGISTRY

## 🔴 نظام تسجيل المشاكل — منع تكرار الأخطاء

This registry tracks all discovered problems and their solutions. It prevents the system from solving the same problem twice and provides solution history.

**Statuses:** `in_progress` → `solved` | `won't_fix` | `deferred`

| ID | المشكلة | التشخيص | الحل المنفذ | الملفات | تاريخ الاكتشاف | تاريخ الحل | حالة التحقق |
|----|---------|---------|------------|---------|----------------|---------|----|
| PROB-001 | BrowserTool timeout — executor.py had 10s timeout, browser ops timeout at 15-30s | All tools had same timeout, browser operations need 20-45s | Created dynamic `TOOL_TIMEOUTS` dict with per-tool timeouts. `execute_tool()` now calls `get_tool_timeout()` | backend/tools/executor.py | 2026-05-10 | 2026-05-10 | ✅ verified |
| PROB-002 | BrowserTool Headless Mode Issues — Playwright crashes in Docker (no display), shows nothing on Windows host | Platform detection missing: no logic for Windows vs Docker | Added `platform.system() == "Windows"` check. Windows=headful, Docker=headless unless `AGENT_MODE=human_in_loop` | backend/tools/browser_tool.py | 2026-05-10 | 2026-05-10 | ✅ verified |
| PROB-003 | DuckDuckGo Selectors Breaking — `.result__body`, `.result__title` classes change frequently | HTML structure scraping is brittle | Replaced Playwright selectors with `duckduckgo_search` DDGS library API. Calls `ddgs.text(query)` instead of scraping | backend/tools/browser_tool.py | 2026-05-10 | 2026-05-10 | ✅ verified |
| PROB-004 | MoneyAgent ANTHROPIC_KEY Dependency — Failed if key not present, no fallback | Direct `anthropic.AsyncAnthropic()` client, no cascading | Switched to `await call_model()` via LiteLLM cascader. Pitch generation works with any provider | backend/agent/money_agent_loop.py | 2026-05-10 | 2026-05-10 | ✅ verified |
| PROB-005 | Missing Desktop Control Tool — No way to control mouse/keyboard on Windows | Feature not implemented | Created `backend/tools/desktop_control_tool.py` with full DesktopControlTool class. Integrated into executor dispatcher | backend/tools/desktop_control_tool.py | 2026-05-10 | 2026-05-10 | ✅ verified |

---

## 📊 Statistics

- **Total Problems:** 5
- **Solved:** 5
- **In Progress:** 0
- **Won't Fix:** 0
- **Resolution Rate:** 100%

---

## 🔗 See Also

- [EVOLUTION_IDEAS_REGISTRY.md](EVOLUTION_IDEAS_REGISTRY.md) — أفكار بدل مشاكل
- [MODIFICATION_HISTORY.md](MODIFICATION_HISTORY.md) — سجل التعديلات التفصيلي
