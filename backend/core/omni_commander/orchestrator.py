"""
Omni Commander — Central Orchestrator

Integrates the Intent Router, Safety Guard, and Suite of Executors.
Manages persistent chat sessions in MongoDB and coordinates stream execution events
and WebSocket connections to power real-time dashboard progress tracking.
"""

import asyncio
from datetime import datetime
import logging
from typing import Dict, Any, List, Optional, AsyncGenerator
import uuid

from core.database import get_db
from core.task_queue_engine import get_queue_engine
from models.task_queue import TaskItem, TaskCategory, TaskPriority

from core.omni_commander.intent_router import IntentRouter, ActionPlan, ActionStep
from core.omni_commander.safety_guard import SafetyGuard, SafetyResult

# Lazy-loaded executors to optimize startup
from core.omni_commander.executors.file_executor import execute_file_action
from core.omni_commander.executors.browser_executor import execute_browser_action
from core.omni_commander.executors.email_executor import execute_email_action
from core.omni_commander.executors.analysis_executor import execute_analysis_action
from core.omni_commander.executors.shopify_executor import execute_shopify_action
from core.omni_commander.executors.code_executor import execute_code_action

logger = logging.getLogger(__name__)


class WebSocketConnectionManager:
    """Manages real-time execution step streaming WebSocket sockets."""

    def __init__(self):
        self.active_connections: Dict[str, List[Any]] = {}

    async def connect(self, session_id: str, websocket: Any):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)
        logger.info("WebSocket connected for session %s", session_id)

    def disconnect(self, session_id: str, websocket: Any):
        if session_id in self.active_connections:
            if websocket in self.active_connections[session_id]:
                self.active_connections[session_id].remove(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
        logger.info("WebSocket disconnected for session %s", session_id)

    async def broadcast_to_session(self, session_id: str, event_type: str, data: Dict[str, Any]):
        """Transmit progress telemetry to all subscribers of a session."""
        if session_id in self.active_connections:
            payload = {
                "type": event_type,
                "timestamp": datetime.utcnow().isoformat(),
                "data": data
            }
            # Clean up disconnected sockets on the fly
            for ws in list(self.active_connections[session_id]):
                try:
                    await ws.send_json(payload)
                except Exception:
                    try:
                        self.active_connections[session_id].remove(ws)
                    except ValueError:
                        pass


ws_manager = WebSocketConnectionManager()


class OmniOrchestrator:
    """Core process pipeline coordinating intent, security checks, and step executors."""

    def __init__(self):
        self.intent_router = IntentRouter()
        self.safety_guard = SafetyGuard()
        self.task_queue = get_queue_engine()

    async def get_session_history(self, session_id: str) -> List[Dict[str, str]]:
        """Retrieve message list from MongoDB."""
        db = get_db()
        if db is None:
            return []
        doc = await db.commander_sessions.find_one({"_id": session_id})
        if doc:
            return doc.get("messages", [])
        return []

    async def save_session_message(self, session_id: str, role: str, content: str, results_metadata: Optional[Dict] = None):
        """Append a message to the persistent session log in MongoDB."""
        db = get_db()
        if db is None:
            return
            
        now = datetime.utcnow()
        msg_doc = {
            "id": str(uuid.uuid4()),
            "role": role,
            "content": content,
            "timestamp": now.isoformat(),
        }
        if results_metadata:
             msg_doc["results_metadata"] = results_metadata

        await db.commander_sessions.update_one(
            {"_id": session_id},
            {
                "$push": {"messages": msg_doc},
                "$set": {"updated_at": now},
                "$setOnInsert": {"created_at": now, "status": "active"}
            },
            upsert=True
        )

    async def execute_prompt_stream(self, prompt: str, session_id: str, uploaded_files: Optional[List[dict]] = None) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Primary orchestrator logic.
        Parses user prompt, creates ActionPlan, processes whitelisted/approved steps,
        pauses on confirmation gates, and streams results over SSE / WS.
        """
        logger.info("Executing Omni Commander stream on session %s: %s", session_id, prompt)
        
        # 1. Store user prompt in history
        await self.save_session_message(session_id, "user", prompt)
        
        # Emit plan progress loading state
        yield {"type": "progress", "pct": 10, "message": "Parsing natural language intent..."}
        await ws_manager.broadcast_to_session(session_id, "progress", {"pct": 10, "message": "Parsing natural language intent..."})
        
        # 2. Structure plan
        history = await self.get_session_history(session_id)
        plan = await self.intent_router.route(prompt, history)
        
        yield {"type": "plan_created", "plan": plan.model_dump()}
        await ws_manager.broadcast_to_session(session_id, "plan_created", {"plan": plan.model_dump()})
        
        # 3. Register Commander Task in Global Queue
        task = TaskItem(
            name=plan.intent,
            description=prompt,
            category=TaskCategory.MANUAL,
            priority=TaskPriority.NORMAL,
            created_by="user",
            metadata={"session_id": session_id}
        )
        await self.task_queue.enqueue(task)
        
        # Save active plan to session document
        db = get_db()
        if db is not None:
             await db.commander_sessions.update_one(
                 {"_id": session_id},
                 {"$set": {
                     "active_plan": plan.model_dump(),
                     "status": "active",
                     "current_step_index": 0,
                     "task_id": task.id
                 }}
             )
             
        # Begin step sequence execution
        results = []
        aborted = False
        
        total_steps = len(plan.steps)
        for idx, step in enumerate(plan.steps):
            if aborted:
                break
                
            step_pct = int(20 + (idx / total_steps) * 70)
            
            yield {"type": "step_started", "index": idx, "step": step.model_dump()}
            await ws_manager.broadcast_to_session(session_id, "step_started", {"index": idx, "step": step.model_dump()})
            
            # A. Evaluate Safety Guard check
            safety_res = self.safety_guard.check(step.type, step.params)
            
            if safety_res.status == "blocked":
                err_msg = f"Security block triggered on step {idx + 1}: {safety_res.reason}"
                logger.warning(err_msg)
                
                yield {"type": "step_blocked", "index": idx, "reason": safety_res.reason}
                await ws_manager.broadcast_to_session(session_id, "step_blocked", {"index": idx, "reason": safety_res.reason})
                
                results.append({"step_index": idx, "success": False, "error": safety_res.reason, "status": "blocked"})
                aborted = True
                break
                
            elif safety_res.status == "confirmation_required":
                # Pause pipeline execution, wait for user response
                logger.info("Step %d requires manual confirmation: %s", idx, safety_res.reason)
                
                # Update DB state to paused
                if db is not None:
                    await db.commander_sessions.update_one(
                        {"_id": session_id},
                        {"$set": {
                            "status": "paused",
                            "current_step_index": idx
                        }}
                    )
                
                yield {
                    "type": "confirmation_required",
                    "index": idx,
                    "reason": safety_res.reason,
                    "step": step.model_dump()
                }
                await ws_manager.broadcast_to_session(session_id, "confirmation_required", {
                    "index": idx,
                    "reason": safety_res.reason,
                    "step": step.model_dump()
                })
                
                # End execution loop stream (the route controller will resume once API confirm is called)
                aborted = True
                break
                
            # B. Execute Step
            yield {"type": "progress", "pct": step_pct, "message": f"Executing: {step.description}"}
            await ws_manager.broadcast_to_session(session_id, "progress", {"pct": step_pct, "message": f"Executing: {step.description}"})
            
            # Inject uploaded file payloads into parameters if doing analysis
            if step.type == "analysis" and uploaded_files:
                 step.params["uploaded_files"] = uploaded_files
                 
            step_result = await self._run_step_executor(step)
            
            if step_result.get("success", False):
                results.append({"step_index": idx, "success": True, "result": step_result})
                yield {"type": "step_completed", "index": idx, "result": step_result}
                await ws_manager.broadcast_to_session(session_id, "step_completed", {"index": idx, "result": step_result})
            else:
                err = step_result.get("error", "Unknown execution error")
                results.append({"step_index": idx, "success": False, "error": err})
                yield {"type": "step_failed", "index": idx, "error": err}
                await ws_manager.broadcast_to_session(session_id, "step_failed", {"index": idx, "error": err})
                aborted = True # halt sequence on any step failure
                break
                
        # 4. Finalize sequence
        if not aborted:
            yield {"type": "progress", "pct": 95, "message": "Drafting final resolution..."}
            await ws_manager.broadcast_to_session(session_id, "progress", {"pct": 95, "message": "Drafting final resolution..."})
            
            # Call model router to summarize results
            summary_prompt = (
                f"You are OMNI COMMANDER. You successfully executed a series of automated action steps "
                f"for the user's prompt: \"{prompt}\".\n\n"
                f"Execution Results Data:\n{json.dumps(results, default=str)}\n\n"
                f"Please compose a concise, elegant summary of what was accomplished, highlight any outputs, "
                f"and explain next steps if appropriate."
            )
            final_summary = await self.intent_router.router.call_model([{"role": "user", "content": summary_prompt}])
            
            yield {"type": "progress", "pct": 100, "message": "Finished"}
            await ws_manager.broadcast_to_session(session_id, "progress", {"pct": 100, "message": "Finished"})
            
            yield {"type": "finished", "summary": final_summary, "results": results}
            await ws_manager.broadcast_to_session(session_id, "finished", {"summary": final_summary, "results": results})
            
            # Update history and db session
            await self.save_session_message(session_id, "assistant", final_summary, {"results": results})
            
            if db is not None:
                await db.commander_sessions.update_one(
                    {"_id": session_id},
                    {"$set": {"status": "finished", "current_step_index": len(plan.steps)}}
                )
            # Update Global Task Queue
            await self.task_queue.complete(task_id=task.id, result_summary="Successfully executed full action plan", result_data={"results": results})
            
        elif aborted and not results:
             # Blocked/Cancelled immediately before running anything
             if db is not None:
                 await db.commander_sessions.update_one(
                     {"_id": session_id},
                     {"$set": {"status": "failed"}}
                 )
             await self.task_queue.fail(task_id=task.id, error="Orchestration execution sequence aborted")
             
        elif aborted and results:
             # Paused for confirmation or failed halfway
             last_res = results[-1]
             if last_res.get("status") == "blocked" or not last_res.get("success", False):
                 # Fail state
                 err = last_res.get("error", "Pipeline error")
                 yield {"type": "finished", "summary": f"Execution halted due to error: {err}", "results": results}
                 await self.save_session_message(session_id, "assistant", f"Execution halted due to error: {err}", {"results": results})
                 if db is not None:
                     await db.commander_sessions.update_one(
                         {"_id": session_id},
                         {"$set": {"status": "failed"}}
                     )
                 await self.task_queue.fail(task_id=task.id, error=err)
             else:
                 # Paused state - handled above, no closing message yet
                 pass

    async def resume_step_execution(self, session_id: str, approve: bool) -> AsyncGenerator[Dict[str, Any], None]:
        """Resumes a paused commander session pipeline after user feedback."""
        db = get_db()
        if db is None:
             yield {"type": "error", "message": "Database not connected"}
             return
             
        sess = await db.commander_sessions.find_one({"_id": session_id})
        if not sess or sess.get("status") != "paused":
            yield {"type": "error", "message": "No paused execution plan found for this session."}
            return
            
        plan_data = sess.get("active_plan")
        current_idx = sess.get("current_step_index", 0)
        task_id = sess.get("task_id")
        
        if not plan_data:
            yield {"type": "error", "message": "Active action plan has expired or is corrupt."}
            return
            
        plan = ActionPlan(**plan_data)
        
        if current_idx >= len(plan.steps):
            yield {"type": "error", "message": "Execution index out of plan bounds."}
            return
            
        step = plan.steps[current_idx]
        
        if not approve:
            # User cancelled the step
            logger.info("User cancelled step %d: %s", current_idx, step.description)
            yield {"type": "step_failed", "index": current_idx, "error": "Step cancelled by user."}
            await ws_manager.broadcast_to_session(session_id, "step_failed", {"index": current_idx, "error": "Step cancelled by user."})
            
            yield {"type": "finished", "summary": "Pipeline execution aborted by user selection.", "results": []}
            await self.save_session_message(session_id, "assistant", "Pipeline execution aborted by user selection.")
            
            await db.commander_sessions.update_one(
                {"_id": session_id},
                {"$set": {"status": "failed"}}
            )
            if task_id:
                await self.task_queue.cancel(task_id=task_id, reason="Aborted by user selection during confirmation")
            return
            
        # User approved! Execute step
        logger.info("User approved step %d: %s", current_idx, step.description)
        
        # Reset DB status to running
        await db.commander_sessions.update_one(
            {"_id": session_id},
            {"$set": {"status": "active"}}
        )
        
        # Stream resume start
        yield {"type": "progress", "pct": int(20 + (current_idx / len(plan.steps)) * 70), "message": f"Resuming: {step.description}"}
        await ws_manager.broadcast_to_session(session_id, "progress", {"pct": int(20 + (current_idx / len(plan.steps)) * 70), "message": f"Resuming: {step.description}"})
        
        step_result = await self._run_step_executor(step)
        
        results = [{"step_index": current_idx, "success": step_result.get("success", False), "result": step_result}]
        
        if step_result.get("success", False):
            yield {"type": "step_completed", "index": current_idx, "result": step_result}
            await ws_manager.broadcast_to_session(session_id, "step_completed", {"index": current_idx, "result": step_result})
            
            # Now, execute the REST of the remaining steps recursively!
            aborted = False
            total_steps = len(plan.steps)
            for idx in range(current_idx + 1, total_steps):
                step = plan.steps[idx]
                step_pct = int(20 + (idx / total_steps) * 70)
                
                yield {"type": "step_started", "index": idx, "step": step.model_dump()}
                await ws_manager.broadcast_to_session(session_id, "step_started", {"index": idx, "step": step.model_dump()})
                
                safety_res = self.safety_guard.check(step.type, step.params)
                
                if safety_res.status == "blocked":
                    yield {"type": "step_blocked", "index": idx, "reason": safety_res.reason}
                    await ws_manager.broadcast_to_session(session_id, "step_blocked", {"index": idx, "reason": safety_res.reason})
                    results.append({"step_index": idx, "success": False, "error": safety_res.reason, "status": "blocked"})
                    aborted = True
                    break
                    
                elif safety_res.status == "confirmation_required":
                    await db.commander_sessions.update_one(
                        {"_id": session_id},
                        {"$set": {
                            "status": "paused",
                            "current_step_index": idx
                        }}
                    )
                    yield {
                        "type": "confirmation_required",
                        "index": idx,
                        "reason": safety_res.reason,
                        "step": step.model_dump()
                    }
                    await ws_manager.broadcast_to_session(session_id, "confirmation_required", {
                        "index": idx,
                        "reason": safety_res.reason,
                        "step": step.model_dump()
                    })
                    aborted = True
                    break
                    
                yield {"type": "progress", "pct": step_pct, "message": f"Executing: {step.description}"}
                await ws_manager.broadcast_to_session(session_id, "progress", {"pct": step_pct, "message": f"Executing: {step.description}"})
                
                step_result = await self._run_step_executor(step)
                
                if step_result.get("success", False):
                    results.append({"step_index": idx, "success": True, "result": step_result})
                    yield {"type": "step_completed", "index": idx, "result": step_result}
                    await ws_manager.broadcast_to_session(session_id, "step_completed", {"index": idx, "result": step_result})
                else:
                    err = step_result.get("error", "Unknown execution error")
                    results.append({"step_index": idx, "success": False, "error": err})
                    yield {"type": "step_failed", "index": idx, "error": err}
                    await ws_manager.broadcast_to_session(session_id, "step_failed", {"index": idx, "error": err})
                    aborted = True
                    break
                    
            if not aborted:
                yield {"type": "progress", "pct": 95, "message": "Drafting final resolution..."}
                await ws_manager.broadcast_to_session(session_id, "progress", {"pct": 95, "message": "Drafting final resolution..."})
                
                # Fetch user's original message to construct beautiful summary
                history = await self.get_session_history(session_id)
                user_prompt = "User Prompt"
                for item in reversed(history):
                     if item.get("role") == "user":
                         user_prompt = item.get("content", "")
                         break
                         
                summary_prompt = (
                    f"You are OMNI COMMANDER. You successfully executed a series of automated action steps "
                    f"for the user's prompt: \"{user_prompt}\".\n\n"
                    f"Execution Results Data:\n{json.dumps(results, default=str)}\n\n"
                    f"Please compose a concise, elegant summary of what was accomplished, highlight any outputs, "
                    f"and explain next steps if appropriate."
                )
                final_summary = await self.intent_router.router.call_model([{"role": "user", "content": summary_prompt}])
                
                yield {"type": "progress", "pct": 100, "message": "Finished"}
                await ws_manager.broadcast_to_session(session_id, "progress", {"pct": 100, "message": "Finished"})
                
                yield {"type": "finished", "summary": final_summary, "results": results}
                await ws_manager.broadcast_to_session(session_id, "finished", {"summary": final_summary, "results": results})
                
                await self.save_session_message(session_id, "assistant", final_summary, {"results": results})
                
                await db.commander_sessions.update_one(
                    {"_id": session_id},
                    {"$set": {"status": "finished", "current_step_index": len(plan.steps)}}
                )
                if task_id:
                    await self.task_queue.complete(task_id=task_id, result_summary="Resumed and completed action plan", result_data={"results": results})
                    
            elif aborted and any(r.get("status") == "blocked" or not r.get("success", False) for r in results):
                 # Halted on fail / block
                 last_res = results[-1]
                 err = last_res.get("error", "Error")
                 yield {"type": "finished", "summary": f"Halted on error: {err}", "results": results}
                 await self.save_session_message(session_id, "assistant", f"Halted on error: {err}", {"results": results})
                 await db.commander_sessions.update_one(
                     {"_id": session_id},
                     {"$set": {"status": "failed"}}
                 )
                 if task_id:
                     await self.task_queue.fail(task_id=task_id, error=err)
        else:
             # Paused step failed
             err = step_result.get("error", "Execution failed")
             yield {"type": "step_failed", "index": current_idx, "error": err}
             await ws_manager.broadcast_to_session(session_id, "step_failed", {"index": current_idx, "error": err})
             
             yield {"type": "finished", "summary": f"Step execution failed: {err}", "results": results}
             await self.save_session_message(session_id, "assistant", f"Step execution failed: {err}")
             
             await db.commander_sessions.update_one(
                 {"_id": session_id},
                 {"$set": {"status": "failed"}}
             )
             if task_id:
                 await self.task_queue.fail(task_id=task_id, error=err)

    async def _run_step_executor(self, step: ActionStep) -> Dict[str, Any]:
        """Execute step matching correct type payload."""
        try:
            if step.type == "file":
                return await execute_file_action(step.params)
                
            elif step.type == "browser":
                return await execute_browser_action(step.params)
                
            elif step.type == "email":
                return await execute_email_action(step.params)
                
            elif step.type == "analysis":
                return await execute_analysis_action(step.params)
                
            elif step.type == "shopify":
                return await execute_shopify_action(step.params)
                
            elif step.type == "code":
                return await execute_code_action(step.params)
                
            elif step.type == "chat":
                # Instant response for simple assistant conversation
                return {"success": True, "message": step.params.get("message", "Ready.")}
                
            else:
                return {"success": False, "error": f"Unsupported step type: {step.type}"}
                
        except Exception as e:
            return {"success": False, "error": f"Executor Exception: {str(e)}"}


_orchestrator_instance = OmniOrchestrator()


def get_commander_orchestrator() -> OmniOrchestrator:
    return _orchestrator_instance
