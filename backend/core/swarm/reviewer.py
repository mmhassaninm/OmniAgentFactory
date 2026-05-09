from core.model_router import call_model
from core.evolve_engine import SECURITY_DIRECTIVE


class Reviewer:
    async def execute(self, task: str, previous_results: list) -> str:
        context = "\n".join([r["result"] for r in previous_results[-3:]])
        prompt = f"""{SECURITY_DIRECTIVE}
        Review this work and suggest improvements:
        
        Task: {task}
        Previous work: {context}
        
        Rate quality 1-10 and list specific improvements.
        """
        return await call_model(prompt, task_type="general")

