# OmniBot — Autonomous Agent Factory

An AI-powered agent factory that creates, evolves, and manages autonomous agents. Built with FastAPI, React, MongoDB, ChromaDB, and LiteLLM.

## What This Project Actually Does

OmniBot is a self-evolving AI agent platform that:
1. **Creates autonomous agents** that can perform tasks, generate Shopify themes, and track income
2. **Self-evolves** via a built-in evolution engine that generates ideas, scans problems, evaluates them, and implements improvements
3. **Routes AI requests** across 5 tiers of LLM providers (OpenRouter, Groq, Cerebras, Gemini, Cloudflare, Ollama)
4. **Manages a Shopify theme swarm** — a team of 7 AI agents that collaboratively generate Shopify themes

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- MongoDB (local or Atlas at port 27017)
- Docker (optional, for containerized deployment)

### Setup

1. Clone the repository
2. Copy environment template:
   ```
   cp .env.example .env
   ```
3. **Fill in at least one LLM API key** in `.env` — without API keys, the evolution engine cannot function:
   - `OPENROUTER_KEY` (free tier: 200 req/day at openrouter.ai)
   - OR `GROQ_KEY` (free tier: 14,400 req/day at console.groq.com)
   - OR `GEMINI_KEY` (free tier: 1B tokens/month at aistudio.google.com)
4. Start the factory:
   ```
   start_omnibot.bat
   ```

### Manual Start
```
docker-compose up -d --build
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_KEY` | Yes* | — | OpenRouter API key |
| `GROQ_KEY` | No | — | Groq API key |
| `GEMINI_KEY` | No | — | Google Gemini API key |
| `CEREBRAS_KEY` | No | — | Cerebras API key |
| `CLOUDFLARE_KEY` | No | — | Cloudflare API key |
| `MONGODB_URL` | No | `mongodb://localhost:27017` | MongoDB connection string |
| `SELF_EVOLUTION_ENABLED` | No | `true` | Enable/disable self-evolution engine |
| `EVOLUTION_INTERVAL_HOURS` | No | `6` | Hours between evolution cycles |
| `REQUEST_TIMEOUT_SECONDS` | No | `30.0` | API request timeout |

*At least one LLM provider key is required

## Architecture

- **Backend**: FastAPI + Python 3.11 (in `backend/`)
- **Frontend**: React + TypeScript + Vite + Tailwind (in `frontend/`)
- **Database**: MongoDB + ChromaDB
- **AI Gateway**: LiteLLM (multi-provider cascade)
- **Self-Evolution**: 6-component engine in `backend/core/self_evolution/`
- **Autonomous Evolution**: IdeaEngine → AgentCouncil → LoopOrchestrator in `backend/core/autonomous_evolution/`

## Main Features

### 1. Autonomous Evolution System
Generates new ideas, scans for problems, evaluates them via an AI council, and implements improvements automatically. Runs on a 120-second cycle.

### 2. Multi-Provider Model Router
5-tier cascade: OpenRouter auto → OpenRouter free → specific free models → alternate cloud providers → local Ollama. With automatic key rotation and rate-limit cooling.

### 3. Shopify Theme Swarm
7 specialized AI agents that collaboratively generate Shopify themes with real-time WebSocket streaming.

### 4. Self-Evolution Engine (Phase S)
Autonomous code improvement engine that reads the codebase, identifies pending improvements from Evolve_plan.md, generates patches via LLM, applies them, verifies syntax, and rolls back on failure. Runs on a 6-hour cycle.

### 5. Money Agent
PayPal income tracking with Telegram command interface.

## Project Status

| Component | Status |
|-----------|--------|
| FastAPI Backend | ✅ All 128+ endpoints operational |
| Frontend | ✅ React/TypeScript bundle builds |
| Model Router | ✅ Fixed (was a mock class, now real) |
| Shopify Swarm | ✅ Operational (needs API keys for content) |
| Autonomous Evolution | ✅ Loop running (needs API keys for AI calls) |
| Self-Evolution Engine | ✅ Built and verified |
| MongoDB Integration | ✅ Connected |
| Docker Deployment | ✅ docker-compose ready |

**Note:** The project requires at least one LLM API key in `.env` to function fully.

## Key Directories

```
backend/core/model_router.py       # 5-tier LLM routing
backend/core/self_evolution/        # Self-evolution engine (6 components)
backend/core/autonomous_evolution/  # Idea engine, problem scanner, council
backend/routers/                    # Legacy API endpoints
backend/api/                        # Factory API endpoints
backend/agent/                      # Agent run loop
backend/agents/                     # Agent factory framework
backend/shopify/                    # Shopify swarm engine
frontend/src/                       # React frontend
```

## License

MIT License — use freely, build boldly.