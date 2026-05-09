"""
Export agent thought logs to markdown files.
Called after every evolution cycle to maintain a human-readable log.
"""

import os
from datetime import datetime
from pathlib import Path

EXPORT_DIR = Path("logs/exports")
EXPORT_DIR.mkdir(parents=True, exist_ok=True)


async def export_thoughts_to_md(agent_id: str, agent_name: str, db):
    """
    Called after every evolution cycle.
    Appends all new thoughts to a markdown file: logs/exports/{agent_name}.md
    """
    try:
        thoughts = await db.thoughts.find(
            {"agent_id": agent_id},
            sort=[("timestamp", 1)]
        ).to_list(1000)
        
        filename = EXPORT_DIR / f"{agent_name.replace(' ', '_')}.md"
        
        with open(filename, "w", encoding="utf-8") as f:
            f.write(f"# {agent_name} — Thought Log\n")
            f.write(f"*Exported: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC*\n\n")
            f.write("---\n\n")
            
            for t in thoughts:
                ts = str(t.get("timestamp", ""))[:19]
                phase = t.get("phase", "").upper()
                model = t.get("model_used", "")
                message = t.get("message", "")
                
                f.write(f"**[{ts}]** `{phase}`")
                if model:
                    f.write(f" _{model}_")
                f.write(f"\n{message}\n\n")
        
        return str(filename)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return None
