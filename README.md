# OmniBot — Autonomous Agent Factory

> Create, evolve, and manage AI agents that continuously improve themselves.

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│                   FRONTEND (React+TS+Tailwind)       │
│  Factory Dashboard  │  Agent Cards  │  Thought Logs  │
└──────────────┬───────────────────────┬───────────────┘
               │ REST API             │ WebSocket
┌──────────────▼───────────────────────▼───────────────┐
│                 FASTAPI BACKEND                       │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Factory │ │ Evolution│ │Checkpoint│ │  Model  │ │
│  │ (CRUD)  │ │ Engine   │ │ System   │ │ Router  │ │
│  └─────────┘ └──────────┘ └──────────┘ └─────────┘ │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │  Skill  │ │  Night   │ │  Budget  │ │  Kill   │ │
│  │ Library │ │ Scheduler│ │ Governor │ │ Switch  │ │
│  └─────────┘ └──────────┘ └──────────┘ └─────────┘ │
└──────┬──────────────┬──────────────┬─────────────────┘
       │              │              │
┌──────▼──────┐ ┌─────▼─────┐ ┌─────▼──────┐
│  MongoDB    │ │ ChromaDB  │ │  LiteLLM   │
│  (Storage)  │ │ (Vectors) │ │  (Models)  │
└─────────────┘ └───────────┘ └────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- At least one API key (Groq, OpenRouter, Gemini, or Anthropic)

### Setup

1. **Clone and configure:**
   ```bash
   cp .env.example .env
   # Edit .env and add your API keys
   ```

2. **Start all services:**
   ```bash
   docker-compose up -d --build
   ```

3. **Open the dashboard:**
   ```
   http://localhost:5173
   ```

### Local Development (without Docker)

**Backend:**
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 3001 --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**MongoDB:**
```bash
# Must be running on localhost:27017
# Install via: https://www.mongodb.com/try/download/community
```

## 🧬 Core Systems

| System | Description |
|--------|-------------|
| **Model Router** | Multi-provider LLM gateway with key rotation (Groq→OpenRouter→Gemini→Anthropic→Ollama) |
| **Checkpoint** | 3-phase evolution cycle (DRAFT→TEST→COMMIT) with crash recovery |
| **Evolution Engine** | Continuous agent improvement loop with automated testing |
| **Kill Switch** | 3 stop modes: Hard Stop, Soft Stop (after commit), Pause |
| **Skill Library** | Shared function repository discovered during evolution |
| **Night Scheduler** | Free-tier models only during 00:00-07:00 with reduced concurrency |
| **Catalog** | Auto-generated documentation for each agent |
| **Budget Governor** | Per-agent daily token limits |

## 📡 API Endpoints

### Agent CRUD
- `POST /api/factory/agents` — Create agent
- `GET /api/factory/agents` — List agents
- `GET /api/factory/agents/{id}` — Get agent detail
- `DELETE /api/factory/agents/{id}` — Delete agent

### Factory Control
- `POST /api/factory/agents/{id}/evolve` — Start evolution
- `POST /api/factory/agents/{id}/control` — Kill Switch (`hard_stop`, `soft_stop`, `pause`)
- `POST /api/factory/agents/{id}/resume` — Resume
- `POST /api/factory/agents/{id}/fix` — Inject priority fix
- `GET /api/factory/status` — Factory health

### WebSocket
- `ws://localhost:3001/ws/thoughts/{agent_id}` — Agent thought stream
- `ws://localhost:3001/ws/factory` — Factory-wide events

## 🌙 Night Mode

Automatically active between 00:00–07:00 (configurable):
- Uses only free-tier models
- Reduces max concurrent agents
- Doubles evolution interval for efficiency
- All logs prefixed with `[NIGHT]`

## 📝 Environment Variables

See [.env.example](.env.example) for all configuration options.

## 🛡️ Safety

- **Never crashes** — model router always recovers from failures
- **Never loses data** — checkpoint system rolls back on crash
- **Budget controls** — per-agent daily token limits prevent runaway costs
- **3 stop modes** — from graceful to immediate emergency stop
