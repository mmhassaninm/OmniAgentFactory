# OmniBot — Autonomous Agent Factory
## Living Standards & Instructions

This document holds the core standards, development stack, and design aesthetics for OmniBot.

---

## Technical Stack

- **Backend**: FastAPI (Python 3.11) with Uvicorn, LangGraph, MongoDB, ChromaDB, LiteLLM.
- **Frontend**: Vite + React + TypeScript + Tailwind CSS (sleek dark mode design).
- **Environment**: Hyper-V Ubuntu 22.04 LTS target running Docker Compose; local commands are executed inside PowerShell on Windows 11.
- **Database**: MongoDB (port 27017) and ChromaDB vector database (port 8000).

---

## Design Aesthetics

- **Rich Aesthetics**: High-end UX/UI, vibrant curated colors (not generic red/blue), sleek glassmorphism, HSL tailwinds, subtle micro-animations.
- **Dynamic Design**: Fast interactive hover states, beautiful animated loaders, no blank/stale spaces, zero default placeholders.
- **Google Fonts**: Modern, premium typography (Outfit, Inter, Roboto).

---

## Directory Schema

- `backend/`: Python application server, endpoints, database interfaces, agent modules, worker threads.
- `frontend/`: React components, custom routes, Settings UI, and real-time WebSockets state dashboard.
- `agent_docs/`: Canonical references for architecture, commands, and known troubleshooting issues.

---

## Secure Configuration Standard

- **Encryption rule**: Every sensitive credential, token, or secret must be symmetrically encrypted before storing in MongoDB using AES-256. Plaintext credentials must never be hardcoded or saved in plaintext config files (such as `settings.json`).
- **Encryption Engine**: `backend/services/encryption.py` utilizing AESGCM symmetric cryptography.
