# OmniBot — Autonomous Agent Factory

An AI-powered agent factory that creates, evolves, and manages autonomous agents. Built with FastAPI, React, MongoDB, and LiteLLM.

## Features

- **Infinite Evolution** — agents improve themselves continuously
- **Multi-Provider Cascader** — Groq, OpenRouter, Gemini, GitHub Models, HuggingFace
- **Revenue Engine** — agents that generate real income
- **Arabic/English UI** — full RTL support
- **Live Preview** — watch agents think in real-time
- **Military-Grade Security** — no secrets leave your machine

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- MongoDB (local or Atlas)

### Setup

1. Clone the repository
2. Copy environment template:
   ```
   cp .env.example .env
   ```
3. Fill in your API keys in `.env` (never commit this file)
4. Start the factory:
   ```
   start_omnibot.bat
   ```

### Environment Variables

See `.env.example` for all required variables. **Never commit your `.env` file.**

## Getting Free API Keys

| Provider | Free Tier | Get Key |
|---|---|---|
| Groq | 14,400 req/day | console.groq.com |
| OpenRouter | 200 req/day | openrouter.ai |
| Google AI Studio | 1B tokens/month | aistudio.google.com |
| GitHub Models | 150 req/day | github.com/settings/tokens |

## Architecture

- **Backend**: FastAPI + Python 3.11
- **Frontend**: React + TypeScript + Tailwind
- **Database**: MongoDB + ChromaDB
- **AI Gateway**: LiteLLM (multi-provider)

## Security Notes

- API keys are stored locally in `.env` only
- No credentials are logged or transmitted
- `.gitignore` blocks all sensitive files
- `ERROR_LOG.md` stays local (not committed)

## License

MIT License — use freely, build boldly.
