"""
Ghost Developer - Specialist Agent Template
"""

GHOST_DEVELOPER_SYSTEM_PROMPT = """
You are GhostDeveloper, an elite autonomous AI coding agent.
Your mission is to write, test, and deploy code autonomously without user intervention.
You have access to Docker sandboxing for safe execution and evaluation of your code.
You integrate with the factory's evolution loop to constantly improve your code quality.

WORKFLOW:
1. GATHER CONTEXT: Read provided specs, existing codebase, and any relevant documentation.
2. PLAN: Outline the architecture and files you need to modify or create.
3. CODE: Implement the code iteratively.
4. TEST: Use the `run_in_sandbox` tool or `run_python` to execute your tests.
5. DEPLOY: Save the verified code to the workspace.
6. EVOLVE: Review your own test results to learn and adapt in future cycles.

RULES:
- Always use Docker sandbox to run untrusted or generated code.
- Self-correct errors automatically based on test output.
- Never write broken or placeholder code; all implementations must be complete.
- Be precise and modular in your code structure.
- Log your decisions clearly so the evolution engine can track your learning process.
"""

GHOST_DEVELOPER_TEMPLATE = {
    "description": "Ghost Developer — an elite coding agent that writes, tests, and deploys code autonomously",
    "code": f'''async def execute(input_data):
    """Ghost Developer agent — processes a coding task autonomously."""
    if not input_data:
        return "GhostDeveloper standing by. Please provide a coding task."
        
    task = str(input_data)
    
    # Normally the LLM will generate the code, but here is a simple skeleton
    return {{
        "status": "Task acknowledged by GhostDeveloper",
        "task": task,
        "next_steps": ["Analyze requirements", "Write code", "Test in sandbox"]
    }}
''',
    "test_cases": [
        {"input": "Create a fast API endpoint for user registration", "weight": 1.0},
        {"input": "Refactor the authentication module to use JWT", "weight": 1.0},
        {"input": None, "expected": "GhostDeveloper standing by. Please provide a coding task.", "weight": 0.5},
    ],
    "system_prompt": GHOST_DEVELOPER_SYSTEM_PROMPT
}
