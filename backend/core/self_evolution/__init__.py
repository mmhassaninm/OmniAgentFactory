"""
Self-Evolution Engine

Infrastructure for autonomous code improvement:
- state_manager: Persistent state tracking
- codebase_reader: Intelligent code reading with token budgeting
- ai_reasoner: LLM-powered patch generation
- patch_applier: Safe file modification
- verifier: Validation and rollback
- evolution_loop: Main orchestration
- scheduler: Periodic execution
"""

from .state_manager import get_state_manager, StateManager
from .codebase_reader import get_codebase_reader, CodebaseReader
from .ai_reasoner import get_ai_reasoner, AIReasoner
from .patch_applier import get_patch_applier, PatchApplier
from .verifier import get_verifier, Verifier
from .evolution_loop import get_evolution_loop, EvolutionLoop, run_self_evolution_cycle
from .scheduler import get_evolution_scheduler, EvolutionScheduler, start_evolution_scheduler, stop_evolution_scheduler
from .idea_engine import get_idea_engine, IdeaEngine, start_idea_engine, stop_idea_engine

__all__ = [
    "StateManager",
    "CodebaseReader",
    "AIReasoner",
    "PatchApplier",
    "Verifier",
    "EvolutionLoop",
    "EvolutionScheduler",
    "IdeaEngine",
    "get_state_manager",
    "get_codebase_reader",
    "get_ai_reasoner",
    "get_patch_applier",
    "get_verifier",
    "get_evolution_loop",
    "run_self_evolution_cycle",
    "get_evolution_scheduler",
    "start_evolution_scheduler",
    "stop_evolution_scheduler",
    "get_idea_engine",
    "start_idea_engine",
    "stop_idea_engine",
]
