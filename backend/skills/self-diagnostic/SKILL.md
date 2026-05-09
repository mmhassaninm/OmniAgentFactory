---
name: self-diagnostic
description: Run a full system diagnostic and produce a health report
trigger: when asked to diagnose, check system health, or run diagnostics
---

## Steps
1. Check database connectivity: try a simple query, record latency
2. Check all active agents: run agent-health-check skill on each
3. Check signal_harvester: verify last 10 signals were recorded
4. Check skill_library: verify at least 1 skill is active
5. Check dev loop: verify last cycle completed within 2x the configured interval
6. Produce report: {"timestamp": ..., "status": healthy|degraded|failing, "details": {...}}
7. Store report in DB collection "diagnostic_reports"
8. If status != healthy: trigger a new dev loop cycle immediately
