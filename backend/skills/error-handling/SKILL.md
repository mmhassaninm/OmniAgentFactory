---
name: error-handling
description: Add try/except error handling to Python functions
trigger: when asked to handle errors, add robustness, or fix crashes
---

## Steps
1. Read the target function
2. Identify all I/O operations, external calls, and parsing operations
3. Wrap each in try/except with specific exception types (not bare except)
4. Log errors using the existing thought_logger: thought_logger.log_error(e)
5. Return appropriate error responses (don't swallow exceptions silently)
6. Verify by running the function with intentionally bad input
