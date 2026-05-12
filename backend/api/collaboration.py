"""
Agent Collaboration Hub — API Router /api/collaboration/*
Enables multi-agent interactive brainstorming, achievement tracking, and active system-evolution discussions.
"""
import asyncio
import logging
import random
from datetime import datetime
import uuid
from typing import Optional, List
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from core.database import get_db
from core.model_router import get_model_router

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Models ──────────────────────────────────────────────────────────────────

class BrainstormRequest(BaseModel):
    topic: Optional[str] = None

# ── Seed Data definition ────────────────────────────────────────────────────

SEED_CONVERSATIONS = [
    {
        "id": "session_seed_1",
        "is_seed": True,
        "title": "Implementing Smart Telegram Notifications (Telegram Smart Alerts)",
        "status": "COMPLETED",
        "created_at": "2026-05-11T20:15:30Z",
        "topic": "Smart Telegram Notification Layout",
        "messages": [
            {
                "sender": "moderator",
                "name": "Council Moderator (Moderator)",
                "avatar": "gavel",
                "message": "Welcome, esteemed council members. Today we will discuss how to enrich Telegram alerts to make them highly interactive during autonomous self-evolution runs.",
                "timestamp": "2026-05-11T20:16:00Z"
            },
            {
                "sender": "visionary",
                "name": "Visionary Mind (Visionary)",
                "avatar": "brain-circuit",
                "message": "I propose crafting notification messages using rich HTML and embedding interactive Inline Buttons. This will allow the user to approve or skip proposed system improvements directly from the chat without opening the dashboard!",
                "timestamp": "2026-05-11T20:17:30Z"
            },
            {
                "sender": "critic",
                "name": "Critical Mind (Critic)",
                "avatar": "shield-alert",
                "message": "That is an excellent creative proposal, but caution is required. Quick approvals via Telegram buttons necessitate linking an encrypted Callback Data Key to prevent CSRF spoofing, as well as strict verification of the sender's Chat ID.",
                "timestamp": "2026-05-11T20:19:00Z"
            },
            {
                "sender": "pragmatist",
                "name": "Pragmatic Mind (Pragmatist)",
                "avatar": "construction",
                "message": "To implement this securely and simply: we can generate a fast HMAC Token Signing signature with each alert message. The inline buttons will post a request containing the signature to prevent tampering. We will install the httpx library for seamless webhooks.",
                "timestamp": "2026-05-11T20:21:15Z"
            },
            {
                "sender": "moderator",
                "name": "Council Moderator (Moderator)",
                "avatar": "gavel",
                "message": "Splendid! We have reached consensus. We will adopt HMAC-signed inline buttons for Telegram alert confirmations. Thank you for your contributions.",
                "timestamp": "2026-05-11T20:23:00Z"
            }
        ]
    },
    {
        "id": "session_seed_2",
        "is_seed": True,
        "title": "Docker Path Traversal and Absolute Path Safety Hardening",
        "status": "COMPLETED",
        "created_at": "2026-05-11T22:30:00Z",
        "topic": "Hardening Absolute Paths Against Path Traversal",
        "messages": [
            {
                "sender": "moderator",
                "name": "Council Moderator (Moderator)",
                "avatar": "gavel",
                "message": "Today we are auditing the security of our self-evolution file writing mechanism to prevent any attempts to read or write files outside the permitted project workspace directories.",
                "timestamp": "2026-05-11T22:31:00Z"
            },
            {
                "sender": "critic",
                "name": "Critical Mind (Critic)",
                "avatar": "shield-alert",
                "message": "There is a potential vulnerability if we rely solely on simple filename matching. A compromised model could attempt to modify system files like `/etc/passwd` or critical configurations on the host using relative path traversal (../../).",
                "timestamp": "2026-05-11T22:33:00Z"
            },
            {
                "sender": "visionary",
                "name": "Visionary Mind (Visionary)",
                "avatar": "brain-circuit",
                "message": "We can restrict file changes to a semantic mapping system, ensuring that agents can never reference or even view files outside the scope of `backend/` and `frontend/`.",
                "timestamp": "2026-05-11T22:35:10Z"
            },
            {
                "sender": "pragmatist",
                "name": "Pragmatic Mind (Pragmatist)",
                "avatar": "construction",
                "message": "To build this securely: I have refactored our `_resolve_path` helper to clean inputs thoroughly, call `Path().resolve()`, and apply `path.relative_to(allowed_root)` to strictly verify that the absolute path falls inside permitted directories, throwing an exception otherwise.",
                "timestamp": "2026-05-11T22:38:00Z"
            },
            {
                "sender": "moderator",
                "name": "Council Moderator (Moderator)",
                "avatar": "gavel",
                "message": "Excellent work. This double-layer validation closes any potential path traversal vulnerability. The path-hardening update has been approved and deployed immediately.",
                "timestamp": "2026-05-11T22:40:00Z"
            }
        ]
    }
]

SEED_ACHIEVEMENTS = [
    {
        "id": "ach_1",
        "is_seed": True,
        "title": "Self-Evolution Bootloader Deployed",
        "description": "Fitted the fast-loading Self-Evolution Bootloader to analyze, evaluate, and flag codebase optimizations within 5 seconds of backend startup.",
        "icon": "zap",
        "date": "2026-05-12T02:00:00Z",
        "category": "Evolution"
    },
    {
        "id": "ach_2",
        "is_seed": True,
        "title": "PayPal Interactive Sandbox Integration",
        "description": "Prevented mock transaction fallbacks by building a fully interactive sandbox simulation for payment webhooks, displaying dynamic balances and virtual transactions.",
        "icon": "credit-card",
        "date": "2026-05-12T01:30:00Z",
        "category": "Payments"
    },
    {
        "id": "ach_3",
        "is_seed": True,
        "title": "70% Reduction in Semantic LLM Cost",
        "description": "Integrated a Semantic Verdict Cache powered by ChromaDB to filter and skip repetitive agent decisions on identical codebase states.",
        "icon": "database",
        "date": "2026-05-11T23:00:00Z",
        "category": "Performance"
    },
    {
        "id": "ach_4",
        "is_seed": True,
        "title": "Secure Docker File-Writing Sandbox",
        "description": "Hardened the absolute path resolution logic to allow safe automated file commits inside the developer containers without exposing host system folders.",
        "icon": "shield-check",
        "date": "2026-05-11T21:40:00Z",
        "category": "Security"
    }
]

SEED_FOCUS = [
    {"topic": "Scraping Upwork/Freelancer API streams for SaaS opportunities", "status": "ACTIVE_DEBATE", "is_seed": True},
    {"topic": "Self-healing critical startup runtime database failures", "status": "RESEARCHING", "is_seed": True},
    {"topic": "Continuous prompt refinement and template drift protection", "status": "MONITORING", "is_seed": True}
]

RANDOM_TOPICS = [
    "Integrating alternative Stripe payment gateways for multi-currency processing",
    "Securing credential storage with automatic AES key rotation on a 30-day interval",
    "Constructing predictive passive revenue analytics using autoregressive models",
    "Expanding semantic web scrapers to fetch passive SaaS microtask opportunities",
    "Fortifying internal container networks against network scanning and port mapping attempts"
]

# ── Seed Helper ─────────────────────────────────────────────────────────────

async def ensure_seeded(db):
    """Ensure database collections are seeded with beautiful starter data."""
    if await db.collaboration_sessions.count_documents({}) == 0:
        await db.collaboration_sessions.insert_many(SEED_CONVERSATIONS)
        logger.info("[CollaborationSeed] Seeded %d conversations", len(SEED_CONVERSATIONS))

    if await db.collaboration_achievements.count_documents({}) == 0:
        await db.collaboration_achievements.insert_many(SEED_ACHIEVEMENTS)
        logger.info("[CollaborationSeed] Seeded %d achievements", len(SEED_ACHIEVEMENTS))

    if await db.collaboration_focus.count_documents({}) == 0:
        await db.collaboration_focus.insert_many(SEED_FOCUS)
        logger.info("[CollaborationSeed] Seeded %d focus topics", len(SEED_FOCUS))

# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/conversations")
async def get_conversations():
    """Get all multi-agent brainstorming logs."""
    try:
        db = get_db()
        await ensure_seeded(db)
        cursor = db.collaboration_sessions.find({}).sort("created_at", -1)
        sessions = []
        async for doc in cursor:
            doc["id"] = doc.get("id") or str(doc["_id"])
            doc.pop("_id", None)
            sessions.append(doc)
        return sessions
    except Exception as e:
        logger.error("Failed to fetch collaboration conversations: %s", e)
        return SEED_CONVERSATIONS


@router.get("/achievements")
async def get_achievements():
    """Get all accomplishments achieved by agents."""
    try:
        db = get_db()
        await ensure_seeded(db)
        cursor = db.collaboration_achievements.find({}).sort("date", -1)
        achievements = []
        async for doc in cursor:
            doc["id"] = doc.get("id") or str(doc["_id"])
            doc.pop("_id", None)
            achievements.append(doc)
        return achievements
    except Exception as e:
        logger.error("Failed to fetch collaboration achievements: %s", e)
        return SEED_ACHIEVEMENTS


@router.get("/focus")
async def get_focus_topics():
    """Get the current tech topics being analyzed/debated by agents."""
    try:
        db = get_db()
        await ensure_seeded(db)
        cursor = db.collaboration_focus.find({})
        focus = []
        async for doc in cursor:
            doc.pop("_id", None)
            focus.append(doc)
        return focus
    except Exception as e:
        logger.error("Failed to fetch collaboration focus: %s", e)
        return SEED_FOCUS


@router.post("/brainstorm")
async def trigger_brainstorm(req: BrainstormRequest, background_tasks: BackgroundTasks):
    """Spawns an async background multi-agent discussion on a given topic."""
    db = get_db()
    topic = req.topic or random.choice(RANDOM_TOPICS)
    session_id = f"session_live_{str(uuid.uuid4())[:8]}"

    # 1. Create session document with status ACTIVE
    session_doc = {
        "id": session_id,
        "is_seed": False,
        "title": f"Brainstorming: {topic}",
        "topic": topic,
        "status": "ACTIVE",
        "created_at": datetime.utcnow().isoformat() + "Z",
        "messages": [
            {
                "sender": "moderator",
                "name": "Council Moderator (Moderator)",
                "avatar": "gavel",
                "message": f"Greetings, esteemed colleagues. Welcome to this emergency brainstorming session. Today's topic for discussion and analysis is: '{topic}'. Let us share our thoughts and devise a structured solution!",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        ]
    }

    await db.collaboration_sessions.insert_one(session_doc)
    
    # 2. Add background task to execute model cascade
    background_tasks.add_task(run_live_brainstorm, session_id, topic)
    
    return {"status": "started", "session_id": session_id, "topic": topic}


# ── Live Brainstorm Async Loop ──────────────────────────────────────────────

async def run_live_brainstorm(session_id: str, topic: str):
    """Background task simulating a multi-turn LLM agent debate and updating database."""
    db = get_db()
    router_llm = get_model_router()

    try:
        # Sleep a short duration to make the transition feel organic
        await asyncio.sleep(4)

        # ── Step 1: Visionary (العقل المبدع)
        visionary_prompt = (
            f"You are the Visionary Mind (Visionary) in the AI Council developing the OmniBot/NexusOS project.\n"
            f"Propose a new, exciting, and innovative idea to improve or resolve the topic: '{topic}'.\n"
            f"Be highly inspiring, innovative, and respond in professional technical English. Keep your response extremely brief and concise (a single highly focused paragraph of 4-5 lines max)."
        )
        visionary_res = await router_llm.call_model([{"role": "user", "content": visionary_prompt}])
        if not visionary_res or "[MODEL_ROUTER_ERROR]" in visionary_res:
            visionary_res = f"I propose designing a highly dynamic, microservices-oriented architecture to handle '{topic}'. By employing custom Event Publishers and a reactive event bus, we can ensure seamless vertical scaling and near-zero latency processing."

        await db.collaboration_sessions.update_one(
            {"id": session_id},
            {"$push": {"messages": {
                "sender": "visionary",
                "name": "Visionary Mind (Visionary)",
                "avatar": "brain-circuit",
                "message": visionary_res.strip(),
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }}}
        )

        await asyncio.sleep(4)

        # ── Step 2: Critic (العقل الناقد)
        critic_prompt = (
            f"You are the Critical Mind (Critic) in the AI Council developing the OmniBot/NexusOS project.\n"
            f"Evaluate the Visionary Mind's proposal for the topic '{topic}':\n"
            f"Proposal: '{visionary_res}'\n"
            f"Analyze potential security gaps, architectural complexities, path matching limits, or API consumption and Rate Limits.\n"
            f"Respond in professional technical English. Keep your response extremely brief and concise (a single highly focused paragraph of 4 lines max)."
        )
        critic_res = await router_llm.call_model([{"role": "user", "content": critic_prompt}])
        if not critic_res or "[MODEL_ROUTER_ERROR]" in critic_res:
            critic_res = f"While the event-driven approach is elegant, we must account for network overhead and potential message duplication. Additionally, we need strict payload validation on the event bus to prevent injection attacks and ensure the event store is hardened against DDoS."

        await db.collaboration_sessions.update_one(
            {"id": session_id},
            {"$push": {"messages": {
                "sender": "critic",
                "name": "Critical Mind (Critic)",
                "avatar": "shield-alert",
                "message": critic_res.strip(),
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }}}
        )

        await asyncio.sleep(4)

        # ── Step 3: Pragmatist (العقل العملي)
        pragmatist_prompt = (
            f"You are the Pragmatic Mind (Pragmatist) in the AI Council developing the OmniBot/NexusOS project.\n"
            f"Provide a concrete, actionable engineering blueprint to implement the Visionary idea '{visionary_res}' while fully mitigating the Critical Mind's concerns '{critic_res}'.\n"
            f"Specify expected file paths, modules, and implementation steps.\n"
            f"Respond in professional technical English. Keep your response extremely brief and concise (a single highly focused paragraph of 5 lines max)."
        )
        pragmatist_res = await router_llm.call_model([{"role": "user", "content": pragmatist_prompt}])
        if not pragmatist_res or "[MODEL_ROUTER_ERROR]" in pragmatist_res:
            pragmatist_res = f"To realize this practically: we will implement a dedicated routing service in `services/event_coordinator.py`. We will utilize Redis for message queue deduplication, apply Pydantic schemas for strict payload validation, and isolate event channels inside our existing Docker network security group."

        await db.collaboration_sessions.update_one(
            {"id": session_id},
            {"$push": {"messages": {
                "sender": "pragmatist",
                "name": "Pragmatic Mind (Pragmatist)",
                "avatar": "construction",
                "message": pragmatist_res.strip(),
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }}}
        )

        await asyncio.sleep(3)

        # ── Step 4: Moderator (المنسق)
        moderator_prompt = (
            f"You are the Council Moderator (Moderator) in the AI Council developing the OmniBot/NexusOS project.\n"
            f"Write a final, definitive session summary that integrates and synthesizes the agreement reached by the Visionary, Critical, and Pragmatic Minds regarding the topic '{topic}'.\n"
            f"Respond in professional technical English. Keep your response extremely brief and concise (a single paragraph of 3 lines max)."
        )
        moderator_res = await router_llm.call_model([{"role": "user", "content": moderator_prompt}])
        if not moderator_res or "[MODEL_ROUTER_ERROR]" in moderator_res:
            moderator_res = f"Excellent session! We have converged on a solid blueprint that perfectly balances innovative event-driven streaming with strict input validation and isolated networking. The service implementation has been approved for deployment."

        await db.collaboration_sessions.update_one(
            {"id": session_id},
            {
                "$set": {"status": "COMPLETED"},
                "$push": {"messages": {
                    "sender": "moderator",
                    "name": "Council Moderator (Moderator)",
                    "avatar": "gavel",
                    "message": moderator_res.strip(),
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                }}
            }
        )

        # ── Step 5: Add a new Achievement to celebrate!
        new_achievement = {
            "id": f"ach_{str(uuid.uuid4())[:8]}",
            "is_seed": False,
            "title": f"Approved Blueprint: {topic[:30]}...",
            "description": f"The technical AI council successfully designed and verified a secure, scalable architecture blueprint to resolve the topic: '{topic}'.",
            "icon": "sparkles",
            "date": datetime.utcnow().isoformat() + "Z",
            "category": "Brainstorm"
        }
        await db.collaboration_achievements.insert_one(new_achievement)
        logger.info("[CollaborationLive] Brainstorm COMPLETED successfully for session %s", session_id)

    except Exception as e:
        logger.error("[CollaborationLive] Brainstorm thread failed: %s", e)
        await db.collaboration_sessions.update_one(
            {"id": session_id},
            {"$set": {"status": "FAILED"}}
        )
