---
name: add-logging
description: Add structured logging to any module using thought_logger
trigger: when asked to add logs, improve observability, or debug a module
---

## Steps
1. Import: from utils.thought_logger import thought_logger
2. Add entry log at function start: thought_logger.log_thought(phase, "Starting {function_name}")
3. Add exit log at function end with result summary
4. Add error logs in all except blocks: thought_logger.log_error(e, context={...})
5. For long operations, add progress logs every N iterations
6. Never log sensitive data (API keys, passwords, user PII)
