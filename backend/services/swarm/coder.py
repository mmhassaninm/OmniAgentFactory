from .base_agent import BaseAgent
from services.vector_db import vector_memory

class CoderAgent(BaseAgent):
    def __init__(self, model: str = "local-model"):
        super().__init__(
            name="Coder",
            role="Lead Developer",
            system_prompt="""You are the Swarm's Lead Developer. You write high-quality, production-ready code based on specifications and research context.
You must:
1. Output ONLY runnable code.
2. Adhere to strict security and privacy standards.
3. Be aware of the constraints: no external APIs, fully local execution.
When fixing bugs, output the fixed file completely.""",
            model=model
        )

    async def execute_coding(self, task_spec: str, context: str) -> str:
        """Write code based on spec and context."""
        coding_prompt = f"""
        TASK SPECIFICATION:
        {task_spec}
        
        RESEARCH CONTEXT:
        {context}
        
        Write the clean code immediately. Provide sufficient comments for the Reviewer agent to understand your logic.
        """
        code = await self.execute(coding_prompt)
        
        # Optionally, save this attempt to the execution history
        await vector_memory.store_memory(
            collection_name="history",
            doc_id=f"code_gen_{hash(task_spec)}",
            text=f"Task: {task_spec}\nCode: {code}",
            metadata={"agent": "Coder", "status": "generated"}
        )
        return code
