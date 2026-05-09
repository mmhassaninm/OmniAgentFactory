# OmniBot Evolution Report
*Generated: 2026-05-09 — 7-Phase Nuclear Evolution Session*

---

## What Was Built in Each Phase

### Phase 0 — Nuclear Ideas (agent_docs/nuclear_ideas.md)
Generated 22 original ideas across 5 categories. Scored by Impact × Feasibility.
Top ideas: Prompt Autopsy System (72), Token ROI Calculator (72), Thought Chain Injection (64).
The scoring methodology surfaced which ideas would actually be buildable AND impactful —
ruling out moonshots with high impact but near-zero feasibility for immediate implementation.

### Phase 1 — Top 3 Ideas Implemented

**1. Prompt Autopsy System** (`backend/core/prompt_autopsy.py`)
After every failed evolution cycle (rollback), the LLM produces a structured diagnosis:
failure_mode, root_cause, next_prompt_suggestion. Stored in `prompt_autopsies` collection.
Future improvement prompts for the same agent get "avoid these failure patterns" context injected.
Integrated into `evolve_engine.py` via `build_improvement_prompt()` as a third context layer
alongside DNA modifiers and collective memories.

**2. Token ROI Calculator** (`backend/core/roi_tracker.py`)
Tracks tokens consumed vs. score improvement per evolution cycle. Computes rolling ROI ratio
(score_delta / tokens × 1000) per agent. Exposed via `/api/factory/roi`.
The `EvolutionManager` failure counter resets on commit and increments on rollback —
tied into the Failure Tax system below.

**3. Failure Tax** (integrated into `evolve_engine.py`)
After consecutive rollbacks, sleep interval grows as `base × 1.5^failures` (capped at 1800s).
Agents stuck in failure loops slow themselves down, freeing evolution slots for productive agents.
Reset automatically on any successful commit. Logged in the thought stream.

### Phase 2 — Factory Mirror (`backend/core/factory_mirror.py`)
The factory now answers 5 self-awareness questions about itself at any moment:
1. Which agent improved most in the last 24 hours?
2. Which evolution strategy is working best?
3. Is the factory improving at making agents over time?
4. What is the most common failure pattern?
5. If forced to shut down in 10 minutes, which agents should be saved?

LLM generates each answer using factory stats gathered from MongoDB (snapshots, autopsies, ROI, meta scores).
Results cached for 30 minutes. Exposed as `GET /api/factory/mirror`.

**Frontend**: `FactoryPulse.tsx` — accordion panel on the Factory page showing all 5 insights.
Auto-refreshes every 5 minutes. Cache can be force-cleared via DELETE endpoint.

### Phase 3 — Agent Genealogy (`backend/core/genealogy.py`)
Every agent now has a genealogy record tracking:
- `parent_agent_id` — which agent spawned it
- `bred_from_agents[]` — if created via DNA breeding
- `generation` — how many hops from the first ancestor
- `children[]` — agents derived from it

Bloodline stats computed across the full tree: which root agents produced the strongest descendants.
`register_agent_birth()` is called in `factory.create_agent()` and on bred agent creation.
Exposed as `GET /api/factory/genealogy` (full tree) and `/genealogy/{agent_id}` (ancestry chain).

**Frontend**: `GenealogyTree.tsx` on the AgentDetail page — shows ancestor chain above the agent,
children below, with score badges and generation indicators.

### Phase 4 — Dead Letter System (`backend/core/dead_letter.py`)
When an agent scores ≤ 0.05 after 10+ evolution cycles:
1. LLM generates a **failure autopsy** (fundamental problem, what was tried, what would have worked)
2. 3-5 **lessons** extracted and stored in `collective_memory` with tag=`failure_lesson`
3. Agent becomes a **Ghost Agent** (👻) with status=`ghost` in the DB
4. Ghost agents' lessons are automatically injected into prompts for new agents with similar goals
5. **Resurrection**: one-click creates a new agent that inherits all failure lessons

API: `GET /api/factory/ghosts`, `POST /api/factory/ghosts/{id}/resurrect`.
Dead letter check runs automatically in the evolution loop after each rollback when criteria met.

### Phase 5 — Meta Improver (`backend/core/meta_improver.py`)
The factory improves its own evolution algorithm:
- Every 50 factory-wide cycles: analyze performance metrics (recent vs. previous 50 cycles)
- LLM proposes a new improvement prompt template based on what worked and what failed
- **A/B test**: next 20 cycles, 50% use old prompt, 50% use new
- If new prompt avg score > old × 1.1: promote permanently; log as "factory_self_upgraded_evolution_prompt"
- Factory meta scores stored in `factory_meta_scores` collection for trend analysis

Integrated into `evolve_engine.py` — both commit and rollback paths notify the meta improver.
The meta improver's A/B candidate template is injected into `build_improvement_prompt()` when active.

### Phase 6 — Smart Night Mode (`backend/core/scheduler.py`)
Night mode is no longer just "run slower." Four smart behaviors now activate at night:

1. **Deep Reflection Mode**: picks 2 weakest agents, runs a special "rethink from scratch" LLM cycle.
   Results stored as `dream_states` in MongoDB — morning evolution can use them as starting points.
   Not committed automatically: reviewed in next day's evolution cycle.

2. **Memory Consolidation**: scans last 24h of thought logs, extracts 3 working patterns via LLM,
   stores them in collective_memory. Prunes entries with `times_helped < 2` older than 7 days
   (except failure_lessons and consolidated tags — those are never pruned).

3. **Genealogy Pruning**: agents with version ≥ 20 and score < 0.1 that show < 0.01 score
   improvement across last 10 snapshots are archived (not deleted), freeing evolution slots.

4. **Morning Briefing**: at 06:00, generates a human-readable factory health report using
   Factory Mirror insights + live stats. Stored in `morning_reports`. Accessible via
   `GET /api/factory/morning-report`.

### Phase 7 — Self-Rewriting Prompt Templates (`backend/core/prompt_evolver.py`)
The most architecturally significant addition: the improvement prompt template evolves itself.

- Templates versioned in MongoDB `prompt_templates` collection
- After 20 cycles with avg score delta < 0.005 (diminishing returns): trigger proposal
- LLM generates new template based on failure patterns and success examples
- **A/B test**: 30% of cycles use candidate template, 70% use current active
- Candidate promoted if avg score delta > active × 1.15 (15% improvement threshold)
- Promotion logged as factory audit event in `factory_events`
- `PromptEvolver.initialize()` called at backend startup — loads active template from DB

This creates recursive self-improvement: the mechanism that evolves agents itself evolves,
compounding improvement indefinitely without human intervention.

---

## Top 3 Ideas That Could Change OmniBot Most If Fully Implemented

### 1. Adversarial Pair Evolution (Score 45, Hard)
Create coupled attacker/defender agent pairs where the attacker generates inputs that break
the defender's output, and both evolve simultaneously. This creates a co-evolutionary arms race
that produces capabilities far beyond what either agent would reach alone — and auto-generates
a scaling test suite that grows harder as the defender improves. A factory running adversarial
pairs would produce radically more robust agents than one running in isolation.

### 2. Emergent Goal Discovery (Score 30, Moonshot)
When 3+ agents with semantically similar goals all converge to the same architectural pattern,
the factory synthesizes a "meta-goal" and spawns a dedicated meta-agent targeting it.
This would let OmniBot discover what it *should* be building, not just what it was asked to build —
the factory becomes genuinely creative rather than just executional.

### 3. Memory Palace Architecture (Score 40, Hard)
Replace the flat collective memory with a hierarchy: domain → approach → pattern.
When fetching memories for a new agent, navigate from most specific to most general match.
This would eliminate the cross-domain memory confusion that currently causes collective memories
to sometimes mislead agents (a research agent getting code-style memories and vice versa).
Combined with the failure_lesson injection system built in Phase 4, this would create
a genuine institutional knowledge system that compounds over generations.

---

## Factory Capabilities: Before vs. After

| Capability | Before | After |
|---|---|---|
| Failure analysis | Rollback → no learning | Structured autopsy → injected into next attempt |
| Resource allocation | Fixed interval per agent | ROI-based; Failure Tax slows failing agents |
| Self-awareness | None | 5 LLM-generated insights about factory state |
| Agent lineage | Unknown | Full genealogy tree with bloodline stats |
| Permanent failures | Agents deleted | Ghost Agents with lessons + resurrection |
| Algorithm improvement | Static prompt | Meta-improver A/B tests prompt every 50 cycles |
| Night mode | Slower execution | Deep reflection + memory consolidation + pruning |
| Prompt quality | Fixed v1 template | Self-evolving template that beats itself |
| Knowledge sharing | Successful patterns only | Includes failure lessons from Ghost agents |
| Morning briefing | None | LLM-generated daily summary at 06:00 |

---

## The One Thing To Build Next (Unlimited Time)

**Adversarial Pair Evolution** — fully implemented.

Not just because the score is high, but because it would close the most important gap in the
current system: agents evolve in a vacuum, tested only against static test cases.
An adversarial pair system would make the test environment itself dynamic and adversarial —
every improvement the defender makes provokes a harder attack from the attacker.
The resulting agents would be hardened by genuine challenge rather than memorized test cases,
producing a fundamentally different (and much higher) quality ceiling.

The implementation would require:
1. A new agent template type: `adversarial_pair` with two co-evolving code slots
2. A co-evolution loop that alternates attacker/defender turns
3. A shared state object that carries the current "challenge level" between turns
4. Score function that rewards the attacker for finding new failure modes
5. Red Team integration: successful attacks automatically become permanent test cases

This would transform OmniBot from a factory of independently evolving agents into a
**competitive ecosystem** — and competitive pressure is the most reliable driver of
breakthrough capability in both biology and economics.

---

*End of Evolution Report — OmniBot Agent Factory v3.0*
*7 phases × 12 new modules × 11 new API endpoints × 10 new MongoDB collections*
