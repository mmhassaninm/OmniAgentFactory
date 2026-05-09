import os
import requests
import asyncio
import time
from core.database import get_db

LLAMA_API_BASE = "https://api.cloud.llamaindex.ai/api/v1"

async def _get_api_key():
    try:
        db = get_db()
        from routers.settings import decrypt_key
        doc = await db.api_keys.find_one({"provider": "llamacloud", "status": "online"})
        if not doc:
            return None
        return decrypt_key(doc.get("key_value", ""))
    except Exception as e:
        return None

def get_llamacloud_key():
    return asyncio.run(_get_api_key())

def parse_document(file_path_or_url: str) -> str:
    key = get_llamacloud_key()
    if not key:
        return "[Error: No active LlamaCloud API key found. Please configure it in the Key Vault.]"
    
    headers = {"Authorization": f"Bearer {key}"}
    
    try:
        if file_path_or_url.startswith("http://") or file_path_or_url.startswith("https://"):
            return parse_url(file_path_or_url)
        
        if not os.path.exists(file_path_or_url):
            return f"[Error: File not found at {file_path_or_url}]"
            
        with open(file_path_or_url, "rb") as f:
            files = {"file": (os.path.basename(file_path_or_url), f)}
            res = requests.post(f"{LLAMA_API_BASE}/parsing/upload", headers=headers, files=files)
        
        if res.status_code != 200:
            return f"[Error: LlamaCloud upload failed: {res.text}]"
            
        job_id = res.json().get("id")
        
        # Poll for completion (up to 2 minutes)
        for _ in range(60):
            time.sleep(2)
            status_res = requests.get(f"{LLAMA_API_BASE}/parsing/job/{job_id}", headers=headers)
            if status_res.status_code == 200:
                status = status_res.json().get("status")
                if status == "SUCCESS":
                    break
                elif status == "ERROR":
                    return "[Error: LlamaCloud parsing failed on server]"
                    
        # Get markdown
        res_md = requests.get(f"{LLAMA_API_BASE}/parsing/job/{job_id}/result/markdown", headers=headers)
        if res_md.status_code == 200:
            md_text = res_md.json().get("markdown", "")
            # Save to mongo for later search
            asyncio.run(_save_parsed_doc(file_path_or_url, md_text))
            return md_text
        return f"[Error: Failed to retrieve markdown: {res_md.text}]"
        
    except Exception as e:
        return f"[Error: {str(e)}]"

def parse_url(url: str) -> str:
    import tempfile
    try:
        r = requests.get(url, stream=True)
        r.raise_for_status()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            for chunk in r.iter_content(chunk_size=8192):
                tmp.write(chunk)
            tmp_path = tmp.name
            
        res = parse_document(tmp_path)
        os.remove(tmp_path)
        return res
    except Exception as e:
        return f"[Error downloading URL: {str(e)}]"

async def _save_parsed_doc(source: str, content: str):
    try:
        db = get_db()
        await db.parsed_documents.insert_one({"source": source, "content": content})
    except Exception:
        pass

async def _search_docs(query: str):
    db = get_db()
    docs = await db.parsed_documents.find({"content": {"$regex": query, "$options": "i"}}).limit(3).to_list(3)
    results = []
    for d in docs:
        c = d["content"]
        idx = c.lower().find(query.lower())
        start = max(0, idx - 200)
        end = min(len(c), idx + 200)
        results.append(f"Source: {d.get('source')}\nSnippet: ...{c[start:end]}...")
    return "\n\n".join(results) if results else "No matches found in parsed documents."

def search_parsed_docs(query: str) -> str:
    return asyncio.run(_search_docs(query))

def dispatch_llamacloud(action: str, target: str, query: str = "") -> str:
    if action == "parse_document":
        return parse_document(target)
    elif action == "parse_url":
        return parse_url(target)
    elif action == "search_parsed_docs":
        return search_parsed_docs(query)
    return "[Error: Unknown action]"
