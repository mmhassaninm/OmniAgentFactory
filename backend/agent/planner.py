from typing import List


PLANNER_SYSTEM = """You are a task planner. Given a complex task, break it into clear, ordered steps.
Each step should be one atomic action. Output ONLY a numbered list, one step per line.
Example:
1. Search the web for current Bitcoin price
2. Calculate 10% of the found price
3. Return the result
"""


async def plan_task(task: str, provider, model: str) -> List[str]:
    """Ask the LLM to break the task into steps. Returns list of step strings."""
    messages = [
        {"role": "system", "content": PLANNER_SYSTEM},
        {"role": "user", "content": f"Break this task into steps:\n{task}"},
    ]
    full_text = ""
    async for event_type, data in provider.stream_chat(
        messages=messages, model=model, temperature=0.3, max_tokens=512, tools=None
    ):
        if event_type == "content":
            full_text += data
        elif event_type == "done":
            break

    steps = []
    for line in full_text.strip().splitlines():
        line = line.strip()
        if line and (line[0].isdigit() or line.startswith("-")):
            # Strip leading "1. " or "- "
            clean = line.lstrip("0123456789.-) ").strip()
            if clean:
                steps.append(clean)
    return steps if steps else [task]
