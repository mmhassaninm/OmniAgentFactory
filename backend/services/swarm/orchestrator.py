import logging
from .researcher import ResearcherAgent
from .coder import CoderAgent
from .reviewer import ReviewerAgent
from services.vector_db import vector_memory

logger = logging.getLogger(__name__)

class SwarmOrchestrator:
    def __init__(self, default_model: str = "local-model"):
        self.default_model = default_model
        # Initialize the agents
        self.researcher = ResearcherAgent(model=default_model)
        self.coder = CoderAgent(model=default_model)
        self.reviewer = ReviewerAgent(model=default_model)

    async def execute_task(self, task_description: str, max_iterations: int = 3) -> dict:
        """
        Main entry point for the Swarm to execute a complex task autonomously.
        It uses an iterative loop between the Coder and Reviewer.
        """
        logger.info(f"[Swarm Orchestrator] Starting task: {task_description[:50]}...")
        
        # Step 1: Research
        logger.info("[Swarm Orchestrator] Phase 1: Research")
        research_context = await self.researcher.execute_research(task_description)
        logger.info("[Swarm Orchestrator] Research complete.")
        
        # Step 2: Coding & Review Loop
        logger.info(f"[Swarm Orchestrator] Phase 2: Code Generation (Max Iterations: {max_iterations})")
        iteration = 1
        current_code = ""
        review_feedback = ""
        
        while iteration <= max_iterations:
            logger.info(f"Iteration {iteration}/{max_iterations}")
            
            # Coder generates or refines code
            if iteration == 1:
                current_code = await self.coder.execute_coding(task_description, research_context)
            else:
                refinement_task = f"{task_description}\n\nPREVIOUS REVIEW FEEDBACK:\n{review_feedback}\n\nFix the code based on the feedback."
                current_code = await self.coder.execute_coding(refinement_task, research_context)
                
            # Reviewer checks the code
            review_feedback = await self.reviewer.execute_review(current_code, task_description)
            
            if "APPROVED" in review_feedback.upper() or "APPROVED" in review_feedback:
                logger.info("[Swarm Orchestrator] Code APPROVED by Reviewer.")
                break
                
            logger.warning(f"[Swarm Orchestrator] Code REJECTED. Reviewer critique: {review_feedback[:100]}...")
            iteration += 1

        # Step 3: Log success to Vector DB
        status = "success" if iteration <= max_iterations else "max_iterations_reached"
        await vector_memory.store_memory(
            collection_name="history",
            doc_id=f"swarm_final_{hash(task_description)}",
            text=f"Task: {task_description}\nFinal Code:\n{current_code}\n\nReview Status: {status}",
            metadata={"agent": "Orchestrator", "status": status}
        )

        return {
            "task": task_description,
            "status": status,
            "iterations_used": min(iteration, max_iterations),
            "final_code": current_code,
            "research_context": research_context,
            "reviewer_feedback": review_feedback
        }

swarm_orchestrator = SwarmOrchestrator()
