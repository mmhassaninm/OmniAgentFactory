"""
Omni Commander — Analysis Executor

Performs intelligent code review, vision image analysis, dataset (CSV) statistical summaries,
and raw text summarization by leveraging the LiteLLM/ModelRouter.
"""

import os
import csv
from typing import Dict, Any
from core.model_router import get_model_router
from core.omni_commander.executors.file_executor import normalize_path


async def execute_analysis_action(params: Dict[str, Any]) -> Dict[str, Any]:
    """Execute code, text, dataset, or image analysis task."""
    action = params.get("action", "")
    path_param = params.get("path", "")
    router = get_model_router()
    
    try:
        # ── 1. VISION MULTIMODAL ANALYSIS ──────────────────────────────────────
        if action == "vision_analysis":
            image_base64 = params.get("image_base64", "")
            
            # If path specified instead, read local image and convert to base64
            if path_param and not image_base64:
                try:
                    abs_path = normalize_path(path_param)
                    if os.path.exists(abs_path):
                        import base64
                        with open(abs_path, "rb") as img_file:
                            image_base64 = base64.b64encode(img_file.read()).decode("utf-8")
                except Exception as ex:
                    return {"success": False, "error": f"Failed to read image at {path_param}: {ex}"}
                    
            if not image_base64:
                return {"success": False, "error": "Image payload is missing for vision analysis."}
                
            prompt_str = params.get("prompt", "Analyze this image and describe what you see, any issues, text found, or key metrics in detail.")
            
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt_str},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
                    ]
                }
            ]
            
            summary = await router.call_model(messages)
            return {
                "success": True,
                "analysis": summary,
                "action": action
            }
            
        # ── 2. DATASET CSV METRIC ANALYSIS ──────────────────────────────────────
        elif action == "analyze_dataset":
            if not path_param:
                return {"success": False, "error": "CSV Dataset file path is missing."}
                
            abs_path = normalize_path(path_param)
            if not os.path.exists(abs_path):
                return {"success": False, "error": f"CSV Dataset file not found: {path_param}"}
                
            # Parse header and row stats
            row_count = 0
            headers = []
            sample_rows = []
            
            with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                reader = csv.reader(f)
                try:
                    headers = next(reader)
                    for row in reader:
                        row_count += 1
                        if len(sample_rows) < 5:
                            sample_rows.append(row)
                except Exception as csv_err:
                    return {"success": False, "error": f"Failed to parse CSV dataset: {csv_err}"}
            
            analysis_prompt = (
                f"Perform a data intelligence analysis on this CSV dataset named '{os.path.basename(path_param)}'.\n"
                f"- Total Rows: {row_count}\n"
                f"- Columns: {', '.join(headers)}\n"
                f"- First 5 rows sample: {sample_rows}\n\n"
                f"Describe the dataset's apparent purpose, highlight key columns, suggest possible analysis techniques, and summarize any anomalies or patterns."
            )
            
            summary = await router.call_model([{"role": "user", "content": analysis_prompt}])
            return {
                "success": True,
                "dataset_name": os.path.basename(path_param),
                "row_count": row_count,
                "columns": headers,
                "sample_rows": sample_rows,
                "analysis": summary
            }
            
        # ── 3. CODE REVIEWS AND BUG ANALYTICS ───────────────────────────────────
        elif action == "analyze_code":
            if not path_param:
                return {"success": False, "error": "Code file path is missing."}
                
            abs_path = normalize_path(path_param)
            if not os.path.exists(abs_path):
                return {"success": False, "error": f"Code file not found: {path_param}"}
                
            with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                code_content = f.read()
                
            # Truncate content to keep it within context if it's very large
            truncated = code_content[:15000]
            if len(code_content) > 15000:
                truncated += "\n... [Code truncated for analysis limits] ..."
                
            analysis_prompt = (
                f"Analyze this source code file: '{os.path.basename(path_param)}' for bugs, "
                f"security flaws, styling, performance optimizations, and design patterns.\n\n"
                f"Code:\n```\n{truncated}\n```"
            )
            
            summary = await router.call_model([{"role": "user", "content": analysis_prompt}])
            return {
                "success": True,
                "file_name": os.path.basename(path_param),
                "size_bytes": len(code_content),
                "analysis": summary
            }
            
        # ── 4. DOCUMENT TEXT SUMMARIZATIONS ─────────────────────────────────────
        elif action == "summarize_text":
            text = params.get("text_content", "")
            if not text and path_param:
                abs_path = normalize_path(path_param)
                if os.path.exists(abs_path):
                    with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                        text = f.read()
                        
            if not text:
                return {"success": False, "error": "Text content is missing for summarization."}
                
            analysis_prompt = (
                f"Please summarize this document concisely, extracting key take-aways, "
                f"important metrics, and structured key bullet points:\n\n{text[:20000]}"
            )
            
            summary = await router.call_model([{"role": "user", "content": analysis_prompt}])
            return {
                "success": True,
                "analysis": summary
            }
            
        else:
            return {"success": False, "error": f"Unknown analysis action: {action}"}
            
    except Exception as e:
        return {"success": False, "error": str(e)}
