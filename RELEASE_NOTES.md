# OmniBot Release Notes

---

## v2.0.0 — Phase 13: Production-Grade Tool Calling + Autonomous Agent Loop
**Released: 2026-05-07**

### What's New

#### Tool Calling System
- Modular `backend/tools/` with 13 tools (web search, calculator, datetime, URL fetch, Python runner, code interpreter, sandbox, host execution, file ops, shell, drafts, scraper)
- ThreadPoolExecutor-based executor with ToolResult dataclass, 10-second timeout, and JSONL audit log
- Provider-agnostic tool schema conversion: OpenAI → Anthropic `input_schema` → Google `function_declarations`
- `tools_enabled` / `tool_names` fields on `POST /api/chat`
- New SSE events: `tool_start`, `tool_result`, `tool_error`
- `GET /api/tools`, `/schemas`, `/log`, `/stats` REST endpoints
- Tool stats injected into the Neuro stream HUD

#### OpenHands-style Agent Loop
- `backend/agent/` with Think → Act → Observe → Decide cycle
- `ShortTermMemory` rolling buffer (max 30 entries, preserves system message)
- Task planner that breaks complex work into numbered steps via LLM
- `POST /api/agent/run` SSE endpoint (streams: `agent_think`, `agent_act`, `agent_observe`, `agent_finish`)

#### Frontend
- `ToolCallCard.jsx` — animated card with running/done/error states, execution time badge, expandable output
- `AgentThoughtBubble.jsx` — purple-tinted italic streaming thought bubble
- `ToolSelector.jsx` — floating per-tool toggle panel with enable/disable all
- ⚡ Tools toggle + 🤖 Agent Mode toggle in `ChatInput.jsx`
- 8 new SSE event handlers in `CortexAI.jsx`
- Tools & Agent tab in `SettingsModal.jsx`

---

## v2.1.0 — Phase 5: Autonomous Architecture Upgrades (8 Directions)
**Released: 2026-05-07**

### Direction 1 — Semantic Tool Router
- `backend/tools/router.py`: keyword/pattern-based `score_tool_relevance()` (0.0–1.0)
- `get_routed_tool_names()`: top-K tool selection above `min_score=0.1`, max 5 tools
- Prevents context-window bloat on small models; negative signal penalties for false positives
- URL/math expression regex boost for `fetch_url` and `calculator`
- `tool_routing` SSE event emitted before first LLM call in chat and agent endpoints
- Frontend: teal pill strip "Tools selected: web_search, calculator" in streaming header

### Direction 2 — Tiered Memory System
- `backend/agent/tiered_memory.py`: three-tier memory architecture
  - Tier 1 — Working memory (current turn, instance-scoped)
  - Tier 2 — Session facts (in-process, max 60 deduped facts)
  - Tier 3 — Persistent (MongoDB `agent_memory` collection, AES-256 encrypted)
- Lightweight heuristic fact extraction (regex-based, no LLM call) from tool results
- Auto-extraction wired into agent loop on every successful tool observation
- REST endpoints: `GET /api/agent/memory`, `DELETE /api/agent/memory/session`, `POST /api/agent/memory/persistent`

### Direction 3 — Parallel Tool Execution
- Agent loop upgraded to `asyncio.gather()` for concurrent independent tool calls
- All `agent_act` events emitted before dispatch; all `agent_observe` events after gather completes
- `parallel=N` metadata in observe SSE events for frontend timing display
- Sequential fallback for single-tool iterations

### Direction 4 — Tool Result Intelligence
- `backend/tools/result_processor.py`: per-tool post-processing pipeline wired into `executor.py`
- `web_search`: deduplication, ranking by snippet length, "Key finding:" summary line
- `calculator`: large-number comma formatting, Inf/NaN detection with human-readable warnings
- `fetch_url`: readability extraction — collapse whitespace, strip privacy/cookie boilerplate, 2500-char cap
- `run_python`: traceback detection → error block, crude CSV → ASCII table conversion
- Universal silent failure detection (empty output, "no results", empty JSON, traceback patterns)

### Direction 5 — Self-Reflection & Plan Revision
- Agent loop reflects every 3 iterations via a lightweight LLM call (temp=0.3, max_tokens=200, no tools)
- Reflection prompt: "What have you learned? Are you on track? Should you change approach?"
- `agent_reflect` SSE event emitted to frontend
- Reflection injected as system message into ShortTermMemory for next iteration
- Frontend: reflection shown as teal thought bubble with 💭 prefix and `isReflection=true` flag

### Direction 6 — Ollama Integration
- `backend/services/providers/ollama_provider.py`: extends `OpenAICompatibleProvider`
- Checks availability via native `/api/tags` endpoint (not OpenAI-compat `/models`)
- `list_models()` returns size (GB), quantization level, family from Ollama native API
- `_model_supports_tools()`: whitelist of 18 known tool-capable model families
- Tool schemas automatically stripped for incapable models (no hallucinated tool calls)
- Registered in `ProviderRegistry` — appears as "Ollama (Local)" in Settings UI
- Added to auto-detect priority order: LM Studio → Ollama → Groq → OpenAI → ...

### Direction 7 — Agent Personas
- `backend/agent/personas.py`: 4 specialized personas
  - 🔬 Research Agent — web_search/fetch_url first, source citation required
  - 💻 Code Agent — run/debug/verify code cycle
  - 📊 Data Analyst — numerical rigor, chart suggestions
  - 🤖 General Agent — versatile default (unchanged prior behavior)
- Persona system prompt overrides `AGENT_SYSTEM` when set
- Preferred tools pushed to front of routing list before semantic scoring
- `persona` field on `AgentRunRequest` (default: "general")
- `GET /api/agent/personas` endpoint for frontend discovery
- `PersonaSelector.jsx`: floating dropdown with colored pills, description tooltips
- Renders in chat header when Agent Mode is active; disabled during streaming

### Direction 8 — Agent Replay *(Wildcard — not in any OSS agent framework)*
- `backend/agent/run_logger.py`: captures every SSE event as a timestamped step
- Every agent run persisted to MongoDB `agent_runs` collection with full step log
- `agent_run_id` SSE event emitted at loop start so frontend can link to the run
- REST endpoints: `GET /api/agent/runs`, `GET /api/agent/runs/{run_id}`, `DELETE /api/agent/runs/{run_id}`
- `AgentReplayer.jsx`: full-featured replay UI
  - Lists past runs with task preview, persona icon, status (running/success/failed), date
  - Play/Pause/Step-by-Step controls
  - Variable replay speed: 0.5x – 10x (respects real `delta_ms` timing between steps)
  - Color-coded step display per event type (think=purple, act=amber, observe=green, reflect=cyan, finish=teal)
- 🎬 Replay button appears in chat header when Agent Mode is on

---

## Architecture Summary (v2.1.0)

| Layer | Key Files |
|---|---|
| Tool routing | `backend/tools/router.py` |
| Tool execution | `backend/tools/executor.py` + `result_processor.py` |
| Tool registry | `backend/tools/registry.py` (13 tools, 3-format conversion) |
| Agent loop | `backend/agent/loop.py` (Think→Act→Observe→Reflect→Decide) |
| Agent memory | `backend/agent/tiered_memory.py` (3 tiers) |
| Agent personas | `backend/agent/personas.py` (4 personas) |
| Agent replay | `backend/agent/run_logger.py` + `agent_runs` MongoDB collection |
| Ollama provider | `backend/services/providers/ollama_provider.py` |
| Frontend | `ToolCallCard`, `AgentThoughtBubble`, `ToolSelector`, `PersonaSelector`, `AgentReplayer` |
| Backend endpoints | `/api/chat`, `/api/agent/run`, `/api/agent/memory`, `/api/agent/personas`, `/api/agent/runs`, `/api/tools` |

## Competitive Differentiators

1. **Semantic Tool Router** — no other framework selects tools by message relevance before the LLM call
2. **Agent Replay** — no equivalent in OpenHands, AutoGen, CrewAI, or LangGraph
3. **Tiered Memory with auto-extraction** — session facts persist without user intervention
4. **Parallel tool execution** — `asyncio.gather()` across all tool calls in a single LLM response
5. **Per-tool result intelligence** — silent failure detection, readability extraction, number formatting
6. **Ollama with tool-support detection** — automatically disables tool schemas for incapable models
7. **Self-reflection every 3 iterations** — plan revision baked into the loop, not bolted on
8. **Zero new npm packages** — all features delivered with existing frontend dependencies
