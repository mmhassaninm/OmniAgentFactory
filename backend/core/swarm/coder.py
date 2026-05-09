from core.model_router import call_model


class Coder:
    async def execute(self, task: str) -> str:
        prompt = f"""
        Task: {task}
        
        Write clean, working Python/JavaScript code.
        Include error handling.
        Add brief comments.
        Return only the code, no explanation.
        """
        return await call_model(prompt, task_type="code")
