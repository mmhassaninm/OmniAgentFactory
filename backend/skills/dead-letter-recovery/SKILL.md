---
name: dead-letter-recovery
description: Process and retry tasks stuck in the dead letter queue
trigger: when asked to clear stuck tasks, retry failed jobs, or process dead letters
---

## Steps
1. Query dead_letter collection for tasks with status="stuck" and retry_count < 3
2. For each stuck task: read the original error from the record
3. If error is transient (timeout, connection): retry immediately
4. If error is permanent (invalid input, missing file): mark as failed with reason
5. Increment retry_count on each attempt
6. After 3 failed retries: move to "permanently_failed" and notify via telegram_commander
