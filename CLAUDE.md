# AGENTS.md
# OmniBot — Agent Factory
# Universal AI Agent Instructions
# Compatible with: Claude Code · Cursor · Copilot · Codex · Gemini CLI · Windsurf · RooCode · Zed
# Standard: Agentic AI Foundation (Linux Foundation) — agents.md

---

## ENVIRONMENT

- **Dev OS**: Windows 11 — all terminal commands use PowerShell ONLY
- **Runtime OS**: Ubuntu 22.04 LTS inside Hyper-V (all services run here)
- **Shell**: PowerShell ONLY for local commands — no `cmd`, no `cmd /c`, no bash/sh syntax
- **Runtime target**: All code must be Linux-compatible (Ubuntu 22.04 paths, line endings, etc.)
- **Docker**: All services run via Docker Compose — always use Linux-style paths inside containers
- **Python**: 3.11 (inside Docker container — do NOT assume system Python)
- **Node**: 20 LTS (inside Docker container)
- **Database**: MongoDB running as Docker service on port 27017
- **Vector DB**: ChromaDB running as Docker service

---

## PROJECT CONTEXT

- **Project name**: OmniBot — Autonomous Agent Factory
- **Stack**: Python 3.11 · FastAPI · LangGraph · MongoDB · ChromaDB · LiteLLM · React · Vite · TypeScript · Tailwind · Docker Compose
- **Architecture doc**: `agent_docs/architecture.md` — read before any backend task
- **Commands**: `agent_docs/commands.md` — read before running anything
- **Conventions**: `agent_docs/conventions.md` — read before creating any new file
- **DO NOT start any task without reading the relevant `agent_docs/` file first**

---

## TOOL REGISTRY — EXACT NAMES ONLY

| Tool                       | Purpose                                          |
|----------------------------|--------------------------------------------------|
| `read_file`                | Read full file content                           |
| `read_file_range`          | Read specific line range from a file             |
| `read_currently_open_file` | Read the currently open file in the editor       |
| `create_new_file`          | Create a new file with content                   |
| `edit_existing_file`       | Edit an existing file (must `read_file` first)   |
| `single_find_and_replace`  | Replace an exact string in a file                |
| `grep_search`              | Regex/text search across the codebase            |
| `file_glob_search`         | Find files by name pattern                       |
| `run_terminal_command`     | Execute PowerShell commands only                 |
| `view_diff`                | View current git diff                            |
| `ls`                       | List directory contents                          |
| `view_subdirectory`        | Browse a folder's contents                       |
| `codebase`                 | Semantic search across the codebase              |

> **IMPORTANT**: `exact_search` does NOT exist — use `grep_search` for all text/regex searches.
> **IMPORTANT**: Never invent or guess tool names outside this list.

---

## HARD CONSTRAINTS

### Shell & Tools
- DO NOT use `cmd`, `cmd /c`, or any non-PowerShell syntax
- DO NOT use any tool not listed in the Tool Registry above
- DO NOT invent or guess tool names

### File Editing
- DO NOT edit any file without calling `read_file` or `read_file_range` on it first in the same session
- DO NOT overwrite, reorder, or delete any entry in `MODIFICATION_HISTORY.md` — it is append-only

### Scope
- DO NOT modify files outside the scope of the current task
- DO NOT refactor, rename, or reformat code unrelated to the current task

### Docker & Paths
- DO NOT use Windows paths (e.g. `C:\...`) inside Dockerfiles or docker-compose.yml
- DO NOT use `\` as path separator in any code that runs inside a container
- All volume mounts in docker-compose.yml use forward slashes

### Approach
- DO NOT repeat a failed approach — always diagnose the root cause and evolve the solution
- DO NOT auto-generate `PROJECT_INSTRUCTIONS.md` or `MODIFICATION_HISTORY.md` from LLM output alone

---

## WORKFLOW

### On every session start

read_file → PROJECT_INSTRUCTIONS.md
└─ If missing: create it with project name, stack, and known standards
read_file → MODIFICATION_HISTORY.md
└─ Scan for any past attempt matching the current task
└─ If found: state "Found similar attempt on [date]: [title]"
and explicitly describe how your approach differs
read_file → agent_docs/architecture.md   (if task is backend/infra related)
read_file → agent_docs/commands.md       (if task requires running anything)
read_file → agent_docs/conventions.md    (if task involves creating new files)


### After completing any task

Append to MODIFICATION_HISTORY.md (see format below)
Update PROJECT_INSTRUCTIONS.md if new permanent standards were discovered
Update the relevant agent_docs/ file if new stable knowledge was gained


---

## MODIFICATION_HISTORY.md — FORMAT

Append only. Never edit, reorder, or delete past entries.

```markdown
## [YYYY-MM-DD] — <short task title>
- Files changed : <comma-separated list>
- Approach      : <one-line description>
- Outcome       : success | partial | failed
- Notes         : <root cause if failed, or key lesson learned>
```

> This file is the agent's long-term memory across sessions.
> Its value compounds over time — protect it.

---

## ERROR RECOVERY PROTOCOL

When a task fails or produces unexpected output:

1. **Stop** — do not retry the identical approach
2. **Diagnose** — use `view_diff` and `read_file` to identify the root cause
3. **Revert** — restore changed files to their pre-task state if needed
4. **Log** — append a `failed` entry to `MODIFICATION_HISTORY.md` with the diagnosis
5. **Evolve** — state the new approach and how it differs, then execute

### Docker-specific recovery
If a Docker service fails to start:
1. Run `docker-compose logs <service>` to read the error
2. Never blindly rebuild — diagnose first
3. If a port conflict: check `agent_docs/commands.md` for the correct port map
4. If a volume issue: check Linux path formatting in docker-compose.yml

---

## CONTEXT MANAGEMENT

- DO NOT dump entire files into context when `grep_search` + `read_file_range` is sufficient
- If session length grows and response quality drops, say:
  *"Context window is accumulating noise — recommend starting a fresh session
  and loading MODIFICATION_HISTORY.md for continuity."*

---

## PROGRESSIVE DISCLOSURE

Read only the relevant file from `agent_docs/` before starting a task.
DO NOT read all files at once.
agent_docs/
├── architecture.md     ← module map, folder structure, data flow, MongoDB collections
├── commands.md         ← exact Docker, build, test, lint, and run commands
├── conventions.md      ← naming rules, patterns, confirmed anti-patterns
└── troubleshooting.md  ← known issues and their confirmed fixes

> When you discover stable knowledge during a task (a working command, a confirmed pattern),
> write it into the appropriate `agent_docs/` file before ending the session.

---

## PROJECT_INSTRUCTIONS.md — PURPOSE

Holds the living standards for this project. Update it when:
- A new tech or architectural decision is confirmed
- A naming or structural convention is established
- A tool, command, or workflow is standardized

It is NOT a task log — that belongs in `MODIFICATION_HISTORY.md`.

---

## FIRST SESSION CHECKLIST

If `agent_docs/` does not exist yet, create it with these starter files:

**agent_docs/commands.md** — create with this exact content:
```markdown
# OmniBot — Commands

## Start all services
docker-compose up -d --build

## Stop all services
docker-compose down

## View backend logs (live)
docker-compose logs -f backend

## View all logs
docker-compose logs -f

## Open backend shell
docker-compose exec backend bash

## Install a Python package inside container
docker-compose exec backend pip install <package>

## Open MongoDB shell
docker-compose exec mongo mongosh omnibot

## Rebuild one service only
docker-compose up -d --build backend

## Check running containers
docker ps

## Check service health
docker-compose ps
```

**agent_docs/architecture.md** — populate after reading the main OmniBot prompt.

---

*This file governs all agent behavior in this project.*
*Project-specific details live in `agent_docs/`.*
*Task history lives in `MODIFICATION_HISTORY.md`.*
