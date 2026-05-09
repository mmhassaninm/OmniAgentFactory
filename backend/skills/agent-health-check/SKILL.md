---
name: agent-health-check
description: Check if an agent is functioning correctly end-to-end
trigger: when asked to verify, health-check, or diagnose an agent
---

## Steps
1. Send a simple test task to the agent: "echo hello world"
2. Check the response arrives within 10 seconds
3. Check run_logger has a new entry for this session
4. Check no errors appear in error_log for this agent_id
5. Check signal_harvester returns score > 0 for the session
6. Report: HEALTHY if all 5 checks pass, DEGRADED if 3-4 pass, FAILING if < 3
