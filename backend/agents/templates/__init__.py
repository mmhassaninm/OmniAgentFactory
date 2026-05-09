"""
OmniBot — Agent Templates

Default agent templates for the factory.
Each template provides starter code, test cases, and configuration.
"""

GENERAL_TEMPLATE = {
    "description": "General-purpose agent that processes any input",
    "code": '''async def execute(input_data):
    """General-purpose agent — processes input and returns a result."""
    if input_data is None:
        return "Ready to work. Please provide input."
    
    # Process the input
    result = str(input_data)
    
    # Basic analysis
    word_count = len(result.split())
    char_count = len(result)
    
    return {
        "processed": result,
        "word_count": word_count,
        "char_count": char_count,
        "summary": f"Processed input with {word_count} words"
    }
''',
    "test_cases": [
        {"input": "hello world", "weight": 1.0},
        {"input": None, "expected": "Ready to work. Please provide input.", "weight": 0.5},
        {"input": "test data for analysis", "weight": 1.0},
    ],
}

CODE_TEMPLATE = {
    "description": "Code generation and analysis agent",
    "code": '''async def execute(input_data):
    """Code agent — generates or analyzes code based on input."""
    if not input_data:
        return "Please provide a code task description."
    
    task = str(input_data).lower()
    
    if "python" in task or "function" in task:
        return {
            "language": "python",
            "code": f"# Generated for: {input_data}\\ndef solution():\\n    pass  # TODO: implement",
            "explanation": "Generated a Python function skeleton"
        }
    elif "javascript" in task or "js" in task:
        return {
            "language": "javascript",
            "code": f"// Generated for: {input_data}\\nfunction solution() {{\\n  // TODO: implement\\n}}",
            "explanation": "Generated a JavaScript function skeleton"
        }
    
    return {
        "analysis": f"Code analysis for: {input_data}",
        "suggestions": ["Add error handling", "Include type hints", "Write tests"]
    }
''',
    "test_cases": [
        {"input": "write a python function to sort a list", "weight": 1.0},
        {"input": "analyze this javascript code", "weight": 1.0},
        {"input": None, "expected": "Please provide a code task description.", "weight": 0.5},
    ],
}

RESEARCH_TEMPLATE = {
    "description": "Web research and information gathering agent",
    "code": '''async def execute(input_data):
    """Research agent — gathers and synthesizes information."""
    if not input_data:
        return "Please provide a research topic."
    
    topic = str(input_data)
    
    return {
        "topic": topic,
        "findings": [
            f"Initial analysis of '{topic}' complete",
            "Key trends identified in the domain",
            "Further research recommended for detailed insights"
        ],
        "confidence": 0.7,
        "sources_needed": True,
        "summary": f"Preliminary research on {topic} reveals several key areas of interest."
    }
''',
    "test_cases": [
        {"input": "AI trends 2026", "weight": 1.0},
        {"input": "machine learning best practices", "weight": 1.0},
        {"input": None, "expected": "Please provide a research topic.", "weight": 0.5},
    ],
}

# Registry of all templates
TEMPLATES = {
    "general": GENERAL_TEMPLATE,
    "code": CODE_TEMPLATE,
    "research": RESEARCH_TEMPLATE,
}

from ..ghost_developer import GHOST_DEVELOPER_TEMPLATE
TEMPLATES["ghost_developer"] = GHOST_DEVELOPER_TEMPLATE

from .microsaas_agent import MICROSAAS_TEMPLATE
from .content_agent import CONTENT_TEMPLATE
from .freelance_agent import FREELANCE_TEMPLATE

TEMPLATES["microsaas"] = MICROSAAS_TEMPLATE
TEMPLATES["content"] = CONTENT_TEMPLATE
TEMPLATES["freelance"] = FREELANCE_TEMPLATE
