import os
import glob
from pydantic import BaseModel

def list_files(path: str) -> str:
    path = path or '.'
    if not os.path.exists(path):
        return f"[FS ERROR]: Path {path} does not exist"
    try:
        items = os.listdir(path)
        output = []
        for i in items:
            p = os.path.join(path, i)
            output.append(f"📁 {i}" if os.path.isdir(p) else f"📄 {i}")
        return f"[DIRECTORY: {path}] ({len(items)} items):\n" + "\n".join(output)
    except Exception as e:
        return f"[FS ERROR] {e}"

def read_file(file_path: str) -> str:
    if not os.path.exists(file_path):
        return f"[FS ERROR]: File {file_path} not found"
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            if len(content) > 50000:
                return f"[FILE: {file_path}] (TRUNCATED):\n" + content[:50000]
            return f"[FILE: {file_path}]:\n" + content
    except Exception as e:
        return f"[FS ERROR] {e}"

def run_command(command: str) -> str:
    import subprocess
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=10)
        output = result.stdout or result.stderr
        return f"[CMD OUTPUT]:\n{output[:4000]}"
    except Exception as e:
        return f"[CMD ERROR] {e}"

def write_draft(file_path: str, content: str) -> str:
    from pathlib import Path
    try:
        drafts_dir = os.path.join('..', '.vibelab_drafts')
        os.makedirs(drafts_dir, exist_ok=True)
        flat = file_path.replace('/', '_').replace('\\', '_')
        draft_path = os.path.join(drafts_dir, f"{flat}.tmp")
        with open(draft_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return f"[DRAFT SAVED]: Draft saved to {draft_path}"
    except Exception as e:
        return f"[FS ERROR] {e}"

def web_scraper(url: str) -> str:
    import httpx
    from bs4 import BeautifulSoup
    try:
        if not url.startswith('http'):
            url = 'https://' + url
        with httpx.Client() as c:
            r = c.get(url, timeout=10)
            soup = BeautifulSoup(r.text, 'html.parser')
            for script in soup(["script", "style"]):
                script.decompose()
            text = soup.get_text(separator=' ', strip=True)
            return text[:4000]
    except Exception as e:
        return f"[SCRAPER ERROR] {e}"
