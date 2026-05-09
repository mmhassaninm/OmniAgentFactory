# OmniBot — Living Project Instructions

## Project Context
- **Project Name**: OmniBot — Autonomous Agent Factory
- **Vision**: A high-end self-evolving agent factory that continuously runs, tests, and refines specialized autonomous agents.
- **Primary Stack**: Python 3.11, FastAPI, LangGraph, MongoDB, ChromaDB, LiteLLM, React, Vite, TypeScript, Tailwind, Docker Compose.

## Developer Environment Standards
1. **OS & Shell**: Windows 11 host with Ubuntu 22.04 LTS container runtime. All host command executions must run in **PowerShell only**.
2. **Path Separators**: Use Unix-style forward slashes `/` inside container paths and configuration files (like `docker-compose.yml` or Dockerfiles).
3. **Database Ports**:
   - MongoDB: `27017`
   - ChromaDB: `8000`
4. **Caching Rules**:
   - Maintain the cache directory on `D:\cache` for `pip`, `npm`, and model weights.
   - Use pip build cache mounts (`--mount=type=cache`) in Dockerfiles.

## Workflow Integration
- Update `MODIFICATION_HISTORY.md` with any structural code adjustments.
- Read files before editing. Never make blind modifications.
- Test system health before and after each evolution cycle.

## AGENT CHAT — CORE FACTORY FEATURE
Every agent in this factory MUST have a chat interface.
The "USE 💬" button is mandatory on every AgentCard and AgentDetail.
Route pattern: `/agent/{id}/chat` → `AgentChat.tsx` (singular `/agent/`, matching existing route convention)
Backend: `POST /api/factory/agents/{id}/run` executes the agent's `execute(input_data)` function.
Chat history persisted in MongoDB: `agent_conversations` collection.
The chat interface is the primary way users INTERACT with agents.
Evolution improves the agent. Chat is how you USE the agent.
These are two separate flows — never confuse them.

## EVOLUTION LOOP LAW — NON-NEGOTIABLE

The evolution loop NEVER exits due to errors.
Every exception is caught, logged as a thought, and recovered from.
The loop only stops when user clicks Stop/Pause.

- **Provider failures** → cascade to next provider (handled in model_router); if all fail, sleep 90s and continue.
- **Test failures** → log autopsy, continue next cycle.
- **MongoDB drops** → `_mongo_retry` retries 5 times (10s apart); after 5 failures logs thought, sleeps 30s, continues loop.
- **Any unknown error** → outer try/except logs `⚠ Unexpected error: …` + `↺ Recovering — next cycle in 30s`, sleeps 30s, continues.

Key rules:
- `_MONGO_FAILED` sentinel signals exhausted MongoDB retries — never treat as agent-not-found.
- MODEL_ROUTER_ERROR sleep is 90s (not 60s).
- The outer `except Exception` always ends with `continue`, never `return` or re-raise (except `CancelledError`).
 
## CRYPTOGRAPHIC KEY VAULT & DATABASE MIGRATIONS
1. **Credential Storage Security**:
   - All external API keys and secret developer credentials MUST be encrypted symmetrically using `cryptography.fernet.Fernet` before writing them to MongoDB.
   - Raw credentials must never be returned in plain text via the default REST routes. Masking (e.g., showing only the prefix and suffix with standard `••••••••` bullets) must be used on the frontend and default GET list responses.
   - Decrypted access values must only be fetched via dedicated `/reveal` routes with secure verification.
2. **MongoDB Index Migration Handling**:
   - When migrating schemas on existing collections, legacy unique indexes (e.g., `env_name_1` or old lookup constraints) must be proactively checked and dropped during collection seeding or startup initialization to prevent `E11000 duplicate key` conflicts when inserting new document formats with empty/null fields.

