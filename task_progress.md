# Task Progress — 3 Fixes

## Fix 1: Seed Data Transparency in Collaboration ✅
- [x] Add `is_seed: true` to SEED_CONVERSATIONS, SEED_ACHIEVEMENTS, SEED_FOCUS in backend/api/collaboration.py
- [x] Add `is_seed: false` to real brainstorm sessions and achievements
- [x] Update AgentCollaboration.tsx to show "EXAMPLE" badge on seed sessions (amber badge next to status)
- [x] Add `is_seed?: boolean` to Conversation and FocusTopic interfaces

## Fix 2: Money Agent Real AI Integration ✅
- [x] Added `_ai_evaluate_strategy()` — calls `call_model()` with weekly performance stats and strategy options; returns JSON decision to continue or switch
- [x] Added `_ai_select_opportunities()` — calls `call_model()` with opportunity list; returns JSON ranked selections (top 1-3)
- [x] Both have proper error handling: catches JSONDecodeError, general Exception, logs warning, returns sensible fallback
- [x] AI responses directly drive agent behavior (strategy switching, opportunity selection)
- [x] import json added

## Fix 3: Remove Fake Metrics from Hub Test Endpoint ✅
- [x] Replaced `asyncio.sleep(0.1)` + hardcoded metrics with real `call_model()` call (Approach A)
- [x] Prompt: "Reply with the single word: OK" — minimal connectivity test
- [x] Returns real latency_ms, estimated token counts, estimated cost
- [x] Includes `is_simulated: False` field
- [x] Proper error handling — returns error details if AI call fails