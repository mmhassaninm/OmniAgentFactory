from fastapi import APIRouter, Request
from pydantic import BaseModel
from core.swarm.orchestrator import swarm_orchestrator
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class SwarmTaskRequest(BaseModel):
    text: str
    context: str = ""
    model: str = "local-model"

@router.post("/orchestrateTask")
@router.post("/orchestrateTask/")
async def orchestrate_task(req: SwarmTaskRequest):
    """
    Trigger the Swarm orchestrator from the frontend UI.
    Maps to the frontend's 'hive:orchestrateTask'.
    """
    logger.info(f"Received Swarm task from UI: {req.text}")
    
    # Run the swarm
    result = await swarm_orchestrator.execute_task(req.text, max_iterations=2)
    
    # Format the response to match what CortexAI.jsx expects: { success: true, response: "..." }
    final_output = f"**[Swarm Output - {result['status']}]**\n\n**Research Context:**\n{result.get('research_context', 'None')}\n\n**Generated Solution:**\n{result.get('final_code', '')}"
    
    return {
        "success": True,
        "response": final_output
    }
