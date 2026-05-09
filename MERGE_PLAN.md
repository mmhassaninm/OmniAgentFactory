# NexusOS-main & OmniAgentFactory Merge Plan

## Overview
This plan details the process of merging NexusOS-main (the Shell) into OmniAgentFactory (the Brain) while maintaining existing functionality.

## Architecture
- **The Brain** (OmniAgentFactory): FastAPI backend (port 3001), evolution engine, Key Vault, MongoDB + ChromaDB.
- **The Shell** (NexusOS): Desktop OS interface, Skills, specialized agents (GhostDeveloper).

## Step-by-Step Mapping

### Step 1: Architecture Decision
- Keep OmniAgentFactory backend running on port 3001.
- Keep OmniAgentFactory frontend running on port 5173.
- Introduce NexusOS desktop as the main wrapper frontend on port 5174.

### Step 2: Skills to Tools Merge
- `browserSkill.js` → adapt into existing `browser_tool.py` or keep existing.
- `githubSkill.js` → `github_tool.py`
- `searchSkill.js` → `search_tool.py`
- `calendarSkill.js` → `calendar_tool.py`
- `emailSkill.js` → `email_tool.py`
- `discordSkill.js` → `discord_tool.py`
- `notionSkill.js` → `notion_tool.py`
- `obsidianSkill.js` → `obsidian_tool.py`
- Register all in `backend/tools/registry.py` and `backend/tools/router.py`.

### Step 3: Agent Integration
- Read `ghostDeveloper.js` and `ghostDeveloperEvolved.js`.
- Create `backend/agents/ghost_developer.py` as a specialist template.

### Step 4: Frontend-Nexus Creation
- Create `frontend-nexus/` copying from `NexusOS-main/apps/nexus-desktop/`.
- Add OmniBot apps as draggable windows using the WindowFrame component.
  - Agent Factory (OmniBot Factory)
  - Key Vault
  - Autonomous Mode
  - System Monitor (from NexusOS)
  - Egyptian Chatbot
  - Agent Manager

### Step 5: start_omnibot.bat Update
- Rewrite `start_omnibot.bat` to clean up old processes, start DBs, backend, both frontends, and print the status table.

### Step 6: docker-compose.yml Update
- Add `frontend-nexus` service on port 5174 to `docker-compose.yml`.

### Step 7: Documentation
- Update `MODIFICATION_HISTORY.md`.
