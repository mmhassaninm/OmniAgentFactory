# Architecture

See CLAUDE.md → ARCHITECTURE section for the canonical module map and data flow.

## Phase 7 Nuclear Evolution Modules (2026-05-09)

| Module | Purpose |
|---|---|
| `backend/core/prompt_autopsy.py` | Analyzes every failed evolution cycle — stores structured failure diagnosis in `prompt_autopsies` collection; injects hints into future improvement prompts |
| `backend/core/roi_tracker.py` | Tracks tokens consumed vs. score improvement per cycle; computes ROI ratio; used for scheduling prioritization |
| `backend/core/factory_mirror.py` | Self-awareness layer — answers 5 questions about factory state via LLM + MongoDB stats; results cached 30 min; powers Factory Pulse UI panel |
| `backend/core/genealogy.py` | Agent genealogy tree — tracks parent/child/bred-from relationships, generation numbers, bloodline stats; exposed via REST |
| `backend/core/dead_letter.py` | Dead letter system — converts permanently failing agents to Ghost Agents (👻); extracts failure autopsies and lessons into collective memory; supports one-click resurrection |
| `backend/core/meta_improver.py` | Factory self-improvement — tracks factory-wide cycle count, triggers LLM analysis of evolution performance every 50 cycles, A/B tests new prompt templates |
| `backend/core/prompt_evolver.py` | Self-Rewriting Prompt Templates — versions the improvement prompt itself and evolves it when it shows diminishing returns; 30% A/B test split, 15% improvement threshold for promotion |

## New REST Endpoints (Phase 7)
| Method | Path | Description |
|---|---|---|
| GET | `/api/factory/mirror` | 5 LLM self-awareness insights (cached 30 min) |
| DELETE | `/api/factory/mirror/cache` | Force-invalidate mirror cache |
| GET | `/api/factory/roi` | Token ROI rankings for all agents |
| GET | `/api/factory/genealogy` | Full genealogy tree with bloodline stats |
| GET | `/api/factory/genealogy/{agent_id}` | Ancestry chain + children for one agent |
| GET | `/api/factory/ghosts` | List all Ghost Agents |
| POST | `/api/factory/ghosts/{agent_id}/resurrect` | Resurrect a Ghost Agent with inherited lessons |
| POST | `/api/factory/agents/{agent_id}/dead-letter-check` | Manually trigger dead letter processing |
| GET | `/api/factory/meta` | Meta-improver status + A/B test state |
| GET | `/api/factory/morning-report` | Latest morning factory health briefing |
| GET | `/api/factory/prompt-evolver` | Self-Rewriting Prompt Templates status |

## New MongoDB Collections (Phase 7)
| Collection | Purpose |
|---|---|
| `prompt_autopsies` | Structured failure diagnoses per rollback |
| `roi_records` | Per-cycle token cost vs score improvement records |
| `factory_mirror_cache` | 30-minute cached mirror insights |
| `agent_genealogy` | Parent/child/generation records per agent |
| `ghost_agents` | Failed agent autopsies and resurrection state |
| `factory_meta_scores` | Factory-wide performance metrics over time |
| `prompt_ab_tests` | Active and historical A/B test records for evolution prompts |
| `prompt_templates` | Versioned improvement prompt templates |
| `agent_dream_states` | Night mode deep reflection code variants |
| `morning_reports` | Daily 06:00 factory health briefings |
| `factory_events` | Audit log for self-upgrade events |

## New Frontend Components (Phase 7)
| Component | Purpose |
|---|---|
| `frontend/src/components/FactoryPulse.tsx` | Accordion panel showing 5 LLM self-awareness insights; auto-refresh 5 min |
| `frontend/src/components/GenealogyTree.tsx` | Agent ancestry visualization on AgentDetail page |

## Phase 7 Evolution Loop Changes
- `build_improvement_prompt()` now accepts `autopsy_hints` and `active_template` parameters
- After every rollback: `analyze_failure()` called → autopsy stored → `_failure_counts[agent_id]++`
- Sleep interval: `base × 1.5^consecutive_failures` (Failure Tax, max 1800s)
- After every commit/rollback: `record_cycle()` called for ROI tracking
- After every commit/rollback: `meta_improver.record_cycle()` called for factory-wide cycle count
- Failure lessons from Ghost agents injected into collective_memories for agents with similar goals
- Dead letter check runs after each rollback when version ≥ 10 and score ≤ 0.05
- Genealogy `register_agent_birth()` called in `factory.create_agent()`

## Phase 5 New Modules (2026-05-07)

| Module | Purpose |
|---|---|
| `backend/tools/router.py` | Semantic tool selection — scores tools 0.0-1.0 by message relevance |
| `backend/tools/result_processor.py` | Per-tool post-processing; silent failure detection |
| `backend/agent/tiered_memory.py` | 3-tier memory: working/session/MongoDB-persistent |
| `backend/agent/personas.py` | 4 agent personas with system prompt overrides and preferred tools |
| `backend/agent/run_logger.py` | Persists every agent run as step-by-step replay document to MongoDB |
| `backend/services/providers/ollama_provider.py` | Ollama local inference; per-model tool-support detection |
| `frontend/src/components/Agent/PersonaSelector.jsx` | Persona pill dropdown in chat header |
| `frontend/src/components/Agent/AgentReplayer.jsx` | Step-by-step replay of past agent runs |

## New SSE Events (Phase 5)
- `tool_routing` — emitted before LLM call; contains `{selected, scores, reasons}`
- `agent_reflect` — emitted every 3 agent iterations; contains `{iteration, reflection}`
- `agent_run_id` — emitted at agent loop start; contains `{run_id}` for replay linking

## New REST Endpoints (Phase 5)
| Method | Path | Description |
|---|---|---|
| GET | `/api/agent/memory` | All 3 memory tiers |
| DELETE | `/api/agent/memory/session` | Clear session facts |
| POST | `/api/agent/memory/persistent` | Add persistent fact |
| GET | `/api/agent/personas` | List all personas |
| GET | `/api/agent/runs` | List recent agent runs |
| GET | `/api/agent/runs/{run_id}` | Full run with all steps (for replay) |
| DELETE | `/api/agent/runs/{run_id}` | Delete a run |
