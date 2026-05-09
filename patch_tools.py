import ast
import re

# Patching registry.py
with open("backend/tools/registry.py", "r", encoding="utf-8") as f:
    registry_code = f.read()

new_tools = """
    {
        "type": "function",
        "function": {
            "name": "github_tool",
            "description": "Manage GitHub operations via the REST API.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["listPRs", "viewPR", "listIssues", "viewIssue", "createIssue", "runAPIQuery"]},
                    "repo": {"type": "string"},
                    "prNumber": {"type": "integer"},
                    "issueNumber": {"type": "integer"},
                    "title": {"type": "string"},
                    "body": {"type": "string"},
                    "query": {"type": "string"}
                },
                "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_tool",
            "description": "Perform advanced web search and return detailed content from duckduckgo.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calendar_tool",
            "description": "Manage tasks and events.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["addTask", "listTasks", "addEvent", "listEvents"]},
                    "title": {"type": "string"},
                    "notes": {"type": "string"},
                    "when": {"type": "string"},
                    "deadline": {"type": "string"},
                    "list_name": {"type": "string"},
                    "limit": {"type": "integer"}
                },
                "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "email_tool",
            "description": "Send and read emails.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["send", "read"]},
                    "to": {"type": "string"},
                    "subject": {"type": "string"},
                    "body": {"type": "string"}
                },
                "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "discord_tool",
            "description": "Interact with Discord.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["send", "read"]},
                    "channelId": {"type": "string"},
                    "userId": {"type": "string"},
                    "message": {"type": "string"},
                    "limit": {"type": "integer"}
                },
                "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "notion_tool",
            "description": "Manage Notion pages.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["search", "getPage", "getBlocks"]},
                    "query": {"type": "string"},
                    "pageId": {"type": "string"}
                },
                "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "obsidian_tool",
            "description": "Manage local Obsidian markdown vault.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["listNotes", "readNote", "createNote", "appendNote", "searchNotes"]},
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                    "query": {"type": "string"}
                },
                "required": ["action"]
            }
        }
    }
]
"""

registry_code = registry_code.replace("]\n\n_BY_NAME:", new_tools + "\n_BY_NAME:")

new_tool_names_str = 'NEW_TOOL_NAMES = {"web_search", "calculator", "get_datetime", "fetch_url", "run_python", "llamacloud_parser", "github_tool", "search_tool", "calendar_tool", "email_tool", "discord_tool", "notion_tool", "obsidian_tool"}'
registry_code = re.sub(r'NEW_TOOL_NAMES = {.*?}', new_tool_names_str, registry_code)

icons_append = """    "github_tool": "🐙",
    "search_tool": "🔍",
    "calendar_tool": "📅",
    "email_tool": "📧",
    "discord_tool": "🎮",
    "notion_tool": "📝",
    "obsidian_tool": "💎",
}"""
registry_code = registry_code.replace('    "llamacloud_parser": "📄",\n}', '    "llamacloud_parser": "📄",\n' + icons_append)

with open("backend/tools/registry.py", "w", encoding="utf-8") as f:
    f.write(registry_code)

# Patching router.py
with open("backend/tools/router.py", "r", encoding="utf-8") as f:
    router_code = f.read()

router_signals_append = """    "llamacloud_parser": [
        (1.0, ["parse document", "parse pdf", "read pdf", "extract pdf", "llamaparse", "llamacloud"]),
        (0.8, ["document", "pdf", "file", "analyze document", "analyze pdf"]),
        (0.6, ["read", "parse", "extract text"]),
    ],
    "github_tool": [
        (1.0, ["github", "repo", "pull request", "issue", "commit", "pr "]),
    ],
    "search_tool": [
        (0.9, ["deep search", "agentic search", "duckduckgo"]),
    ],
    "calendar_tool": [
        (1.0, ["calendar", "schedule", "event", "task", "reminder", "deadline"]),
    ],
    "email_tool": [
        (1.0, ["email", "send email", "read email", "inbox"]),
    ],
    "discord_tool": [
        (1.0, ["discord", "discord message", "discord channel"]),
    ],
    "notion_tool": [
        (1.0, ["notion", "notion page", "notion database"]),
    ],
    "obsidian_tool": [
        (1.0, ["obsidian", "obsidian note", "obsidian vault"]),
    ],
}"""

router_code = router_code.replace("""    "llamacloud_parser": [
        (1.0, ["parse document", "parse pdf", "read pdf", "extract pdf", "llamaparse", "llamacloud"]),
        (0.8, ["document", "pdf", "file", "analyze document", "analyze pdf"]),
        (0.6, ["read", "parse", "extract text"]),
    ],
}""", router_signals_append)

with open("backend/tools/router.py", "w", encoding="utf-8") as f:
    f.write(router_code)

# Patching executor.py
with open("backend/tools/executor.py", "r", encoding="utf-8") as f:
    executor_code = f.read()

executor_append = """    if tool_name == "llamacloud_parser":
        from tools.llamacloud_tool import dispatch_llamacloud
        return dispatch_llamacloud(arguments.get("action", ""), arguments.get("target", ""), arguments.get("query", ""))
    if tool_name == "github_tool":
        from tools.github_tool import dispatch_github
        return dispatch_github(arguments)
    if tool_name == "search_tool":
        from tools.search_tool import dispatch_search
        return dispatch_search(arguments)
    if tool_name == "calendar_tool":
        from tools.calendar_tool import dispatch_calendar
        return dispatch_calendar(arguments)
    if tool_name == "email_tool":
        from tools.email_tool import dispatch_email
        return dispatch_email(arguments)
    if tool_name == "discord_tool":
        from tools.discord_tool import dispatch_discord
        return dispatch_discord(arguments)
    if tool_name == "notion_tool":
        from tools.notion_tool import dispatch_notion
        return dispatch_notion(arguments)
    if tool_name == "obsidian_tool":
        from tools.obsidian_tool import dispatch_obsidian
        return dispatch_obsidian(arguments)"""

executor_code = executor_code.replace("""    if tool_name == "llamacloud_parser":
        from tools.llamacloud_tool import dispatch_llamacloud
        return dispatch_llamacloud(arguments.get("action", ""), arguments.get("target", ""), arguments.get("query", ""))""", executor_append)

with open("backend/tools/executor.py", "w", encoding="utf-8") as f:
    f.write(executor_code)

print("Patching complete!")
