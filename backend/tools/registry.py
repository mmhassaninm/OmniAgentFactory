from typing import List, Optional

# All tool definitions in OpenAI JSON Schema format
TOOL_DEFINITIONS: List[dict] = [
    # ── NEW PRODUCTION TOOLS ────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web using DuckDuckGo. Returns relevant results with titles, URLs, and snippets. Use for current events, recent facts, or anything that needs up-to-date sources.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query"},
                    "max_results": {"type": "integer", "description": "Maximum number of results (1-10). Default 5.", "default": 5}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "Evaluate mathematical expressions safely. Supports: +,-,*,/,**,%, trig (sin,cos,tan), log, sqrt, pi, e, abs, round.",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {"type": "string", "description": "Mathematical expression, e.g. '2 + sqrt(9) * pi'"}
                },
                "required": ["expression"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_datetime",
            "description": "Get the current date and time, optionally in a specific timezone.",
            "parameters": {
                "type": "object",
                "properties": {
                    "timezone": {"type": "string", "description": "IANA timezone (e.g. 'America/New_York', 'Europe/London', 'Asia/Cairo'). Defaults to UTC."}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_url",
            "description": "Fetch and extract readable text from a web URL. Strips HTML, scripts, and navigation. Best for reading articles, documentation, or web pages.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "Full URL starting with http:// or https://"}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_python",
            "description": "Execute a Python code snippet and return stdout output. 8-second timeout. Safe operations only (no os.system, subprocess, eval).",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code to execute"}
                },
                "required": ["code"]
            }
        }
    },
    # ── EXISTING SYSTEM TOOLS (preserved) ──────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "code_interpreter",
            "description": "Execute Python or JavaScript code via the local interpreter.",
            "parameters": {
                "type": "object",
                "properties": {
                    "language": {"type": "string", "enum": ["python", "javascript"]},
                    "code": {"type": "string"}
                },
                "required": ["language", "code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_in_sandbox",
            "description": "Execute code in an isolated Docker container (--network none). Use for untrusted code.",
            "parameters": {
                "type": "object",
                "properties": {
                    "language": {"type": "string", "enum": ["python", "node"]},
                    "code": {"type": "string"}
                },
                "required": ["language", "code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "execute_on_host",
            "description": "Execute code on the Host OS. REQUIRES asking user 3 clarifying questions first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "language": {"type": "string", "enum": ["python", "javascript", "powershell"]},
                    "code": {"type": "string"},
                    "answers_received": {"type": "boolean", "description": "Must be true — confirm 3 clarifying questions were answered."}
                },
                "required": ["language", "code", "answers_received"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List files and directories in a given path.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a specific file.",
            "parameters": {
                "type": "object",
                "properties": {"file_path": {"type": "string"}},
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": "Run a terminal/shell command inside the sandbox.",
            "parameters": {
                "type": "object",
                "properties": {"command": {"type": "string"}},
                "required": ["command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_draft",
            "description": "Write content to a file draft.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string"},
                    "content": {"type": "string"}
                },
                "required": ["file_path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_scraper",
            "description": "Fetch raw URL content (legacy scraper).",
            "parameters": {
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"]
            }
        }
    },
]

_BY_NAME: dict = {t["function"]["name"]: t for t in TOOL_DEFINITIONS}

NEW_TOOL_NAMES = {"web_search", "calculator", "get_datetime", "fetch_url", "run_python"}

TOOL_ICONS = {
    "web_search": "🔍",
    "calculator": "🧮",
    "get_datetime": "⏰",
    "fetch_url": "🌐",
    "run_python": "💻",
    "code_interpreter": "💻",
    "run_in_sandbox": "📦",
    "execute_on_host": "🖥️",
    "list_files": "📂",
    "read_file": "📄",
    "run_command": "⚡",
    "write_draft": "✏️",
    "web_scraper": "🕸️",
}


def get_tool_definitions(tool_names: Optional[List[str]] = None) -> List[dict]:
    if tool_names is None:
        return TOOL_DEFINITIONS
    return [_BY_NAME[n] for n in tool_names if n in _BY_NAME]


def get_tool_metadata() -> List[dict]:
    return [
        {
            "name": t["function"]["name"],
            "description": t["function"]["description"],
            "icon": TOOL_ICONS.get(t["function"]["name"], "🔧"),
            "is_new": t["function"]["name"] in NEW_TOOL_NAMES,
            "parameters": list(t["function"]["parameters"].get("properties", {}).keys()),
        }
        for t in TOOL_DEFINITIONS
    ]


def get_tools_for_provider(provider_name: str, tool_names: Optional[List[str]] = None) -> List[dict]:
    tools = get_tool_definitions(tool_names)
    if provider_name == "anthropic":
        return [
            {"name": t["function"]["name"], "description": t["function"]["description"], "input_schema": t["function"]["parameters"]}
            for t in tools
        ]
    if provider_name == "google":
        return [{"function_declarations": [
            {"name": t["function"]["name"], "description": t["function"]["description"], "parameters": t["function"]["parameters"]}
            for t in tools
        ]}]
    # OpenAI-compatible (OpenAI, Groq, LM Studio, OpenRouter, custom)
    return tools
