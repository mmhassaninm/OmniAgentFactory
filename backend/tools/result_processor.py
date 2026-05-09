"""
Tool Result Intelligence — Direction 4 of Phase 5.

Per-tool post-processing:
  - web_search  → extract key facts, deduplicate, rank by snippet length
  - calculator  → format large numbers with commas, detect edge cases (Inf, NaN)
  - get_datetime → already well-formatted, pass through
  - fetch_url   → readability extraction: strip boilerplate, keep first N chars
  - run_python  → format tables (crude ASCII), detect silent failures
  - all tools   → silent failure detection (empty output, common error phrases)
"""
import re
import logging

logger = logging.getLogger(__name__)

_SILENT_FAILURE_PATTERNS = [
    re.compile(r'^\s*$'),                          # empty output
    re.compile(r'no results', re.I),
    re.compile(r'error\s*:\s*none', re.I),
    re.compile(r'none\s*found', re.I),
    re.compile(r'0 results', re.I),
    re.compile(r'traceback \(most recent call last\)', re.I),
    re.compile(r'^\s*\[\]\s*$'),                   # empty JSON array
    re.compile(r'^\s*\{\}\s*$'),                   # empty JSON object
]


def _detect_silent_failure(output: str) -> str | None:
    """Return a human-readable warning string if the output looks like a silent failure."""
    for pat in _SILENT_FAILURE_PATTERNS:
        if pat.search(output):
            return f"⚠️ Tool returned suspicious output (possible silent failure): {output[:80]!r}"
    return None


def _process_web_search(output: str) -> str:
    """
    Deduplicate snippets, rank by length (longer = more informative),
    and prepend a one-line "Key findings:" summary line.
    """
    lines = output.splitlines()
    seen: set[str] = set()
    unique: list[str] = []
    for line in lines:
        key = line.strip().lower()[:80]
        if key not in seen and line.strip():
            seen.add(key)
            unique.append(line)

    # Sort blocks of 3 lines (title / url / snippet) by snippet length
    blocks: list[list[str]] = []
    block: list[str] = []
    for line in unique:
        block.append(line)
        if len(block) >= 3:
            blocks.append(block)
            block = []
    if block:
        blocks.append(block)

    blocks.sort(key=lambda b: len(" ".join(b)), reverse=True)
    result = "\n".join("\n".join(b) for b in blocks[:5])  # top 5 results
    if result:
        first_line = unique[0][:60] if unique else "—"
        return f"**Key finding:** {first_line}\n\n{result}"
    return output


def _process_calculator(output: str) -> str:
    """Format large numbers and detect Inf/NaN."""
    output = output.strip()
    if "inf" in output.lower():
        return f"⚠️ Result is Infinity — check for division by zero or overflow.\nRaw: {output}"
    if "nan" in output.lower():
        return f"⚠️ Result is NaN (Not a Number) — invalid mathematical operation.\nRaw: {output}"
    # Try formatting a numeric result with commas
    try:
        num = float(output)
        if num == int(num) and abs(num) < 1e15:
            formatted = f"{int(num):,}"
        else:
            formatted = f"{num:,.6g}"
        if formatted != output:
            return f"{formatted}"
    except ValueError:
        pass
    return output


def _process_fetch_url(output: str) -> str:
    """
    Readability pass: strip repeated whitespace, remove nav-like boilerplate,
    return first 2000 chars of cleaned content.
    """
    # Collapse whitespace runs
    cleaned = re.sub(r'\n{3,}', '\n\n', output)
    cleaned = re.sub(r'[ \t]{2,}', ' ', cleaned)
    # Strip common boilerplate phrases
    boilerplate = [
        r'cookie policy.*', r'privacy policy.*', r'terms of service.*',
        r'subscribe to.*newsletter.*', r'©\s*\d{4}.*',
    ]
    for pat in boilerplate:
        cleaned = re.sub(pat, '', cleaned, flags=re.I | re.DOTALL)
    return cleaned[:2500].strip()


def _process_run_python(output: str) -> str:
    """
    Detect traceback silently-successful-looking patterns.
    Format simple CSV-like output as a crude ASCII table if columns are detected.
    """
    if not output.strip():
        return "⚠️ Script produced no output (stdout was empty)."
    if "traceback" in output.lower():
        return f"❌ Python error:\n```\n{output[:1000]}\n```"

    # Crude CSV → table detection
    lines = [l for l in output.splitlines() if l.strip()]
    if len(lines) >= 2:
        first = lines[0]
        cols = first.count(',') + first.count('\t')
        if cols >= 1 and all((l.count(',') + l.count('\t')) == cols for l in lines[:5]):
            sep = '\t' if '\t' in first else ','
            rows = [l.split(sep) for l in lines[:20]]
            widths = [max(len(str(r[i])) for r in rows if i < len(r)) for i in range(len(rows[0]))]
            border = '+' + '+'.join('-' * (w + 2) for w in widths) + '+'
            def fmt_row(r):
                cells = [f' {str(r[i]) if i < len(r) else ""}:{" " * (widths[i] - len(str(r[i] if i < len(r) else "")))} ' for i in range(len(widths))]
                return '|' + '|'.join(cells) + '|'
            table = [border, fmt_row(rows[0]), border]
            for row in rows[1:]:
                table.append(fmt_row(row))
            table.append(border)
            return '\n'.join(table)
    return output


# ── Public API ────────────────────────────────────────────────────────────────

def post_process(tool_name: str, output: str) -> str:
    """
    Apply per-tool intelligence to raw output.
    Always runs silent failure detection first.
    Returns the (potentially enriched) output string.
    """
    if not output:
        return "⚠️ Tool returned empty output."

    failure = _detect_silent_failure(output)
    if failure:
        logger.warning("[result_processor] Silent failure in %s: %s", tool_name, output[:60])
        return failure

    try:
        if tool_name == "web_search":
            return _process_web_search(output)
        if tool_name == "calculator":
            return _process_calculator(output)
        if tool_name == "fetch_url":
            return _process_fetch_url(output)
        if tool_name == "run_python":
            return _process_run_python(output)
    except Exception as exc:
        logger.warning("[result_processor] post_process error for %s: %s", tool_name, exc)

    return output
