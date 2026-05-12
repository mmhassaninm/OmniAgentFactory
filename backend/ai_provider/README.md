# Resilient Free AI Model Access Integration Layer (`g4f`)

A robust, production-ready integration layer that abstracts free LLM model access using the `g4f` (GPT4Free) library. Features automated fallback rotation, circuit breaking, exponential backoff, request throttling, in-memory TTL caching, and live API status monitoring.

---

## Key Features

1. **Cascading Failover & Auto-Rotation**: Sequential tries of configured sub-providers if a request fails, transferring gracefully to the next healthy provider.
2. **Circuit Breaking (Self-Healing)**: Sub-providers failing $N$ consecutive times are marked as `DEGRADED` and skipped. They automatically recover and re-enter the pool after a configurable cool-down timer.
3. **Throttling & Request Pacing**: Ensures minimum intervals between requests to avoid triggering upstream provider rate limits.
4. **TTL-Based Response Caching**: In-memory response caching for identical model and prompts to save resources and improve response speed.
5. **FastAPI Live Monitoring**: Exposes endpoints to check the health and circuit breaker metrics of the sub-providers.
6. **Dual Mode Sync & Async**: Full synchronous and asynchronous implementations for chat and streaming.

---

## Directory Structure

```
backend/ai_provider/
├── __init__.py         # Package exposures (G4FProvider, AIProvider, AIResponse)
├── interface.py        # Core abstract base class (AIProvider) and exceptions
├── dataclasses.py      # Standard normalized response (AIResponse)
├── config.py           # Settings manager (supports config.yaml & env overrides)
├── cache.py            # ResponseCache (TTL + capacity) & RequestThrottler
└── g4f_provider.py     # Resilient G4FProvider implementing the interface
```

---

## Configuration (`config.yaml`)

Configure providers, models, caches, and circuit breakers in `backend/config.yaml`:

```yaml
providers:
  - Bing
  - DeepInfra
  - You
  - ChatgptNext
  - Liaobots

models:
  gpt-4: gpt-4
  gpt-4o: gpt-4o
  gpt-4o-mini: gpt-4o-mini
  gpt-3.5-turbo: gpt-3.5-turbo

retry_count: 5
initial_backoff: 1.0
max_backoff: 30.0
throttle_seconds: 0.5

cache:
  enabled: true
  ttl: 300
  max_size: 1000

circuit_breaker:
  max_failures: 3
  cool_down_seconds: 300
```

### Environment Overrides
Override any setting at runtime using environment variables:
- `FREE_AI_PROVIDERS`: Comma-separated list (e.g. `Bing,You`)
- `FREE_AI_RETRY_COUNT`: Integer
- `FREE_AI_CACHE_TTL`: Integer
- `FREE_AI_CB_MAX_FAILURES`: Integer

---

## Exposing FastAPI Endpoints

The FastAPI endpoints are registered under the `/api/free-ai` prefix:

### 1. Provider Status Report
`GET http://localhost:3001/api/free-ai/providers/status`
Returns live metrics on all configured sub-providers:
```json
{
  "status": "operational",
  "total_providers": 5,
  "active_providers": 4,
  "providers": [
    {
      "provider": "Bing",
      "status": "ACTIVE",
      "consecutive_failures": 0,
      "cool_down_remaining_seconds": 0,
      "resolvable": true,
      "is_working": true
    },
    {
      "provider": "DeepInfra",
      "status": "DEGRADED",
      "consecutive_failures": 3,
      "cool_down_remaining_seconds": 298,
      "resolvable": true,
      "is_working": true
    }
  ]
}
```

### 2. Quick Integration Health Check
`GET http://localhost:3001/api/free-ai/health`
Returns `"healthy"` if at least one sub-provider is ACTIVE.

---

## How to Add New Providers

To add a new sub-provider:
1. Ensure the provider exists in the `g4f` library (e.g. `g4f.Provider.Gemini`).
2. Open `backend/config.yaml` and add the provider name under the `providers` list:
   ```yaml
   providers:
     - Bing
     - DeepInfra
     - Gemini  # New provider added here
   ```
3. The `G4FProvider` dynamically resolves `getattr(g4f.Provider, name)` and integrates it into the rotation, circuit breaker, and retry flow automatically. No code edits required!
