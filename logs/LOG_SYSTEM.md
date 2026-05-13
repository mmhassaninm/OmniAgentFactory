⚠️ ══════════════════════════════════════════════════════════════════════
                  CRITICAL PROTECTED FILE — DO NOT DELETE
══════════════════════════════════════════════════════════════════════ ⚠️

# OmniBot — Centralized Logging System (LOG_SYSTEM.md)

This document describes the design, schema, and operation of OmniBot's structured logging system.

---

## 📁 1. Directory Structure

```
logs/
├── sessions/          ← One JSON file per individual execution session
├── archive/           ← Session logs older than 30 days (automatically/manually moved)
├── INDEX.json         ← Master index mapping all sessions (active/completed/archived)
└── LOG_SYSTEM.md      ← This documentation file (protected)
```

> [!IMPORTANT]
> The `logs/` directory and all its contents are protected. No file inside it may be deleted or manually modified by any agent or script, except through the methods provided by the `LogManager`.

---

## 🧩 2. Session File Format

Each session file is written atomically to `logs/sessions/session_YYYYMMDD_HHMMSS_<uuid_short>.json` and follows this schema:

```json
{
  "session_id": "uuid4",
  "started_at": "ISO8601 UTC timestamp",
  "ended_at": "ISO8601 UTC timestamp or null",
  "status": "active | completed | failed | interrupted",
  "agent": "Name of the agent",
  "summary": "Auto-generated executive summary",
  "tags": ["evolution", "ratchet", "red-team"],
  "events": [
    {
      "timestamp": "ISO8601 UTC timestamp",
      "level": "INFO | WARNING | ERROR",
      "type": "STATE_CHANGE | ACTION | RESULT | DECISION | ERROR",
      "message": "Description of the event",
      "details": {}
    }
  ],
  "errors": [],
  "metrics": {
    "total_events": 0,
    "total_errors": 0,
    "duration_seconds": 0
  }
}
```

---

## 🧭 3. Index File Schema (INDEX.json)

`logs/INDEX.json` maintains an optimized, flat mapping of all sessions to prevent expensive file listing or globbing:

```json
{
  "total_sessions": 15,
  "last_updated": "2026-05-12T22:15:00.000Z",
  "sessions": [
    {
      "session_id": "uuid4",
      "file": "sessions/session_YYYYMMDD_HHMMSS_<uuid_short>.json",
      "agent": "Name of the agent",
      "started_at": "ISO8601 UTC timestamp",
      "ended_at": "ISO8601 UTC timestamp",
      "status": "completed",
      "summary": "Agent evolved...",
      "tags": ["evolution"]
    }
  ]
}
```

---

## ⚙️ 4. LogManager API (backend/services/log_manager.py)

The system is managed thread-safely by a singleton instance of `LogManager`.

### Thread-Safety & Atomicity
- All read/write operations use a shared mutex (`threading.Lock`) to prevent concurrent file conflicts.
- Modifying a file is done **atomically**: the data is written to a temporary `.tmp` file, and then atomically swapped into place via `os.replace` to prevent partial write corruptions in case of system crashes.

### Key API Methods
- `start_session(agent_name: str, tags: list) -> str`: Initializes a session.
- `log(session_id: str, level: str, type_str: str, message: str, details: dict)`: Appends an event thread-safely.
- `end_session(session_id: str, status: str)`: Finalizes session metadata and saves duration metrics.
- `archive_old_sessions(days: int = 30) -> int`: Scans and archives historical logs older than `days` threshold.

---

## 🧹 5. Automated Log Archiving (Daily Scheduler)

The `NightModeScheduler` runs an automated log cleanup cron job every day at **01:00 AM** calling `archive_old_sessions(30)`:
- Moves session JSON files older than 30 days from `sessions/` to `archive/`.
- Updates the respective paths in `INDEX.json` from `sessions/session_...` to `archive/session_...`.
- Operates on a background thread (`asyncio.to_thread`) to ensure non-blocking file handling.

---

## 🛠️ 6. Manual Archiving Utility (archive_logs.py)

Operators can trigger logs archiving manually using the developer utility:

```powershell
python backend/scripts/archive_logs.py --days 30
```

This script scans historical sessions, safely relocates them, and outputs audit statistics.
