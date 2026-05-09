from core.model_router import call_model
from tools.browser_tool import get_browser_tool


class Researcher:
    async def execute(self, task: str) -> str:
        # Uses browser_tool to search web
        # Returns structured findings
        browser = await get_browser_tool()
        results = await browser.search_web(task)
        summary_prompt = f"Task: {task}\n\nRaw findings:\n{results}\n\nSummarize key actionable insights:"
        return await call_model(summary_prompt, task_type="research")
