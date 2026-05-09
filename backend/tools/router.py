"""
Semantic Tool Router — Direction 1 of Phase 5.

Scores each tool by relevance to the user's message using keyword/pattern matching
and a lightweight relevance model. Only the top-K tools above min_score are passed
to the LLM, preventing context-window bloat and tool hallucination on small models.
"""
import re
import logging
from typing import List, Tuple

logger = logging.getLogger(__name__)

# Per-tool keyword signals (positive indicators → higher score)
_TOOL_SIGNALS: dict[str, list[tuple[float, list[str]]]] = {
    "web_search": [
        (0.9, ["search", "find", "look up", "what is", "who is", "when did", "where is",
               "latest", "recent", "news", "current", "today", "2024", "2025", "2026",
               "بحث", "ابحث", "اوجد", "اخبار", "حالي", "اليوم"]),
        (0.7, ["tell me about", "information about", "facts about", "article", "wikipedia",
               "research", "ابحث عن", "معلومات عن"]),
        (0.5, ["?", "how many", "price of", "cost of", "definition"]),
    ],
    "calculator": [
        (1.0, ["+", "-", "*", "/", "^", "sqrt", "sin", "cos", "tan", "log", "pi", "∑",
               "calculate", "compute", "math", "احسب", "حساب", "ضرب", "قسمة", "جمع"]),
        (0.8, ["how much is", "what is", "equals", "result of", "evaluate",
               "كم يساوي", "ما هو ناتج"]),
        (0.6, ["%", "percent", "fraction", "square root", "power", "factorial"]),
    ],
    "get_datetime": [
        (1.0, ["time", "date", "today", "now", "current time", "what time",
               "الوقت", "التاريخ", "اليوم", "الان", "الآن", "كم الساعة"]),
        (0.7, ["timezone", "utc", "gmt", "clock", "hour", "minute",
               "توقيت", "ساعة", "دقيقة"]),
        (0.5, ["when", "schedule", "deadline", "متى"]),
    ],
    "fetch_url": [
        (1.0, ["http://", "https://", "www.", ".com", ".org", ".net", ".io",
               "url", "link", "website", "webpage", "visit", "open",
               "رابط", "موقع", "صفحة"]),
        (0.8, ["read this", "check this link", "fetch", "scrape", "download",
               "اقرأ هذا", "افتح الرابط"]),
        (0.6, ["article", "blog post", "documentation", "docs"]),
    ],
    "run_python": [
        (1.0, ["python", "script", "code", "program", "execute", "run", "function",
               "كود", "سكريبت", "بايثون", "شغل الكود", "نفذ"]),
        (0.8, ["plot", "chart", "graph", "data analysis", "pandas", "numpy", "matplotlib",
               "رسم", "تحليل", "بيانات"]),
        (0.7, ["automate", "loop", "iterate", "algorithm", "sort", "filter",
               "خوارزمية", "أتمتة"]),
        (0.5, ["generate", "create", "build", "make a", "convert"]),
    ],
    "code_interpreter": [
        (0.9, ["javascript", "js", "node", "typescript", "ts", "execute code",
               "جافاسكريبت"]),
        (0.7, ["run code", "interpret", "eval", "script"]),
        (0.5, ["function", "class", "method", "api"]),
    ],
    "run_in_sandbox": [
        (1.0, ["sandbox", "isolated", "untrusted", "safe execution", "docker",
               "sandbox بيئة", "معزول"]),
        (0.7, ["dangerous", "risky", "unknown code", "third-party", "security"]),
        (0.5, ["test", "try", "experiment"]),
    ],
    "execute_on_host": [
        (1.0, ["host", "os", "operating system", "windows", "powershell", "cmd",
               "نظام التشغيل", "ويندوز"]),
        (0.8, ["install", "uninstall", "system command", "registry", "process",
               "تثبيت", "أمر النظام"]),
        (0.6, ["file system", "directory", "folder", "path"]),
    ],
    "list_files": [
        (1.0, ["list files", "show files", "ls", "dir", "what files", "directory contents",
               "اعرض الملفات", "ملفات المجلد"]),
        (0.7, ["folder", "directory", "path", "exists", "مجلد", "مسار"]),
        (0.5, ["find file", "where is file", "file structure"]),
    ],
    "read_file": [
        (1.0, ["read file", "open file", "content of", "show me", "cat ", "اقرأ الملف",
               "محتوى الملف"]),
        (0.8, ["file content", "file text", "inside file", "what's in"]),
        (0.5, ["log", "config", "settings file"]),
    ],
    "run_command": [
        (1.0, ["run command", "terminal", "shell", "bash", "powershell command",
               "شغل أمر", "أمر طرفية"]),
        (0.7, ["git", "npm", "pip", "apt", "brew", "cargo", "execute command"]),
        (0.5, ["check", "status", "ping", "curl", "wget"]),
    ],
    "write_draft": [
        (1.0, ["write to file", "save to file", "create file", "write draft",
               "اكتب ملف", "احفظ الملف"]),
        (0.7, ["output to", "dump to", "store in file", "generate file"]),
        (0.5, ["draft", "document", "report", "write"]),
    ],
    "web_scraper": [
        (0.8, ["scrape", "scraping", "extract from", "parse html", "web data",
               "استخرج", "كشط الويب"]),
        (0.6, ["table", "data from website", "html", "dom"]),
        (0.4, ["website", "page", "content"]),
    ],
}

# Negative signals — reduce score when present (prevents false positives)
_NEGATIVE_SIGNALS: dict[str, list[str]] = {
    "get_datetime": ["history", "was", "were", "happened", "past", "ancient"],
    "calculator":  ["search", "find", "look up", "who", "what is the name"],
    "fetch_url":   ["calculate", "compute", "math"],
    "run_python":  ["search the web", "news", "current events"],
}


def score_tool_relevance(message: str, tool_name: str) -> float:
    """
    Returns a relevance score between 0.0 and 1.0 for a tool given a message.
    Uses keyword/pattern matching with weighted signal tiers.
    """
    msg_lower = message.lower()
    score = 0.0

    signals = _TOOL_SIGNALS.get(tool_name, [])
    for weight, keywords in signals:
        for kw in keywords:
            if kw in msg_lower:
                score = max(score, weight)
                break  # One hit per tier is enough

    # Apply negative signal penalties
    negatives = _NEGATIVE_SIGNALS.get(tool_name, [])
    for neg in negatives:
        if neg in msg_lower:
            score *= 0.4

    # URL patterns get a strong boost for fetch_url
    if tool_name == "fetch_url" and re.search(r'https?://\S+', msg_lower):
        score = max(score, 0.95)

    # Math expression patterns boost calculator
    if tool_name == "calculator" and re.search(r'\d[\d\s]*[+\-*/^%]\s*\d', msg_lower):
        score = max(score, 0.92)

    return round(min(score, 1.0), 3)


def route_tools(
    message: str,
    available_tools: list[str],
    max_tools: int = 5,
    min_score: float = 0.1,
) -> list[dict]:
    """
    Score all available tools against the message and return the top-K
    above min_score, sorted by descending relevance.

    Returns a list of dicts: [{"name": str, "score": float, "reason": str}]
    """
    scored: list[tuple[float, str]] = []

    for tool_name in available_tools:
        s = score_tool_relevance(message, tool_name)
        if s >= min_score:
            scored.append((s, tool_name))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:max_tools]

    result = []
    for score, name in top:
        tier = "high" if score >= 0.7 else "medium" if score >= 0.4 else "low"
        result.append({
            "name": name,
            "score": score,
            "reason": f"{tier} relevance ({score:.2f})",
        })

    logger.debug("[router] message=%r → selected=%s", message[:60], [r["name"] for r in result])
    return result


def get_routed_tool_names(
    message: str,
    available_tools: list[str],
    max_tools: int = 5,
    min_score: float = 0.1,
) -> tuple[list[str], list[dict]]:
    """
    Convenience wrapper. Returns (selected_names, routing_metadata).
    If no tools score above min_score, returns all available_tools unchanged
    (fail-open: never starve the LLM of tools entirely).
    """
    routing = route_tools(message, available_tools, max_tools, min_score)
    if not routing:
        return available_tools, []
    selected = [r["name"] for r in routing]
    return selected, routing
