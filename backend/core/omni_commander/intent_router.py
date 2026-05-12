"""
Omni Commander — Intelligent Intent Router

Analyzes natural language prompts, detects user intent, determines parameters/entities,
and structures a safe, sequential Action Plan matching required executors.
"""

import json
import logging
import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from core.model_router import get_model_router

logger = logging.getLogger(__name__)


class ActionStep(BaseModel):
    type: str = Field(..., description="Type of executor step: file, browser, email, analysis, shopify, code, chat")
    params: Dict[str, Any] = Field(default_factory=dict, description="Parameters for the executor")
    description: str = Field(..., description="Human-readable description of what this step does")


class ActionPlan(BaseModel):
    intent: str = Field(..., description="Detected intent of the user prompt")
    steps: List[ActionStep] = Field(default_factory=list, description="Ordered list of action steps")
    requires_confirmation: bool = Field(default=False, description="Whether any step requires explicit user permission")
    estimated_duration: str = Field("5s", description="Estimated execution time (e.g., '10s', '1m')")
    tools_needed: List[str] = Field(default_factory=list, description="List of tools needed (e.g., 'file_system', 'browser', 'smtp')")


SYSTEM_PROMPT = """
You are the OMNI COMMANDER Routing Brain, an advanced intent parsing AI.
Your task is to analyze a natural language command from a user, determine their intent, and return a structured, sequential JSON Action Plan matching the available executor steps.

## Executor Steps available:

1. **file**: Reads, writes, searches, or moves project files.
   - Params:
     - `action`: "read_file", "write_file", "search_files", "list_dir", "delete_file"
     - `path`: target file or directory path (must be relative, inside workspace)
     - `content`: content to write (if writing)
     - `query`: search text/regex (if searching)

2. **browser**: Headless web automation, web search, scraping, or web screenshots.
   - Params:
     - `action`: "search_google", "scrape_page", "extract_text", "take_screenshot"
     - `url`: target website URL
     - `query`: search engine query (if searching)

3. **email**: Sends an email via SMTP.
   - Params:
     - `to`: recipient email address
     - `subject`: email subject line
     - `body`: email message body content

4. **analysis**: Processes local files, datasets, code, websites, or images.
   - Params:
     - `action`: "analyze_dataset", "analyze_code", "summarize_text", "vision_analysis"
     - `path`: file path of the dataset/code/image
     - `image_base64`: base64-encoded image string (if vision analysis)
     - `text_content`: raw text to summarize

5. **shopify**: Shopify Theme section/Liquid writing or Product management.
   - Params:
     - `action`: "get_products", "update_product", "create_section"
     - `product_id`: shopify product ID
     - `changes`: dict of changes to apply (e.g. price)
     - `section_name`: name of liquid section
     - `spec`: prompt specifications for the theme section

6. **code**: Runs safe Python code in restricted processes, runs safe whitelisted bash commands, or operates Git.
   - Params:
     - `action`: "run_python", "run_command", "git_status", "git_commit", "git_push"
     - `code`: raw python script to execute
     - `command`: whitelisted shell command to run (e.g., 'git status', 'pytest')
     - `commit_message`: git commit comment

7. **chat**: Safe, conversational fallback when no tools are strictly needed.
   - Params:
     - `message`: response text from assistant

---

## IMPORTANT RULES:
- Output MUST be valid JSON and ONLY valid JSON. Do not write markdown wrapping, descriptions, or explanations outside the JSON block.
- For commands that are destructive (such as deleting files, modifying production code, or pushing to git), set `requires_confirmation: true`.
- Maintain sequential logical order (e.g. read file first, then write, then run tests).

---

## Example 1:
User: "Search for all items containing 'TODO' in backend and summarize them."
Output:
{
  "intent": "Search and analyze TODO items in backend code",
  "steps": [
    {
      "type": "file",
      "params": {
        "action": "search_files",
        "query": "TODO",
        "path": "backend"
      },
      "description": "Search for files containing 'TODO' under backend directory."
    },
    {
      "type": "analysis",
      "params": {
        "action": "analyze_code"
      },
      "description": "Analyze the found TODO instances and generate a summary."
    }
  ],
  "requires_confirmation": false,
  "estimated_duration": "10s",
  "tools_needed": ["file_system", "analysis_engine"]
}

## Example 2:
User: "Create a beautiful liquid custom slider section for shopify called 'custom-slider' based on high contrast styling."
Output:
{
  "intent": "Create customized Shopify liquid slider section",
  "steps": [
    {
      "type": "shopify",
      "params": {
        "action": "create_section",
        "section_name": "custom-slider",
        "spec": "high contrast styling, modern slider with custom images, buttons and descriptions"
      },
      "description": "Generate a beautiful custom liquid slider template section using theme factory specifications."
    }
  ],
  "requires_confirmation": false,
  "estimated_duration": "15s",
  "tools_needed": ["shopify_engine"]
}

Format your output EXACTLY as above, ensuring correct JSON brackets and escaping.
"""


class IntentRouter:
    """Uses LLM cascade router to analyze prompts and parse them into ActionPlans."""

    def __init__(self):
        self.router = get_model_router()

    async def route(self, prompt: str, history: Optional[List[Dict[str, str]]] = None) -> ActionPlan:
        """Route a natural language prompt to a structured ActionPlan."""
        logger.info("Routing prompt: '%s'", prompt)

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]

        # Inject chat history if present to give context
        if history:
            for item in history[-5:]:  # include last 5 messages for brevity
                messages.append({
                    "role": item.get("role", "user"),
                    "content": item.get("content", "")
                })

        messages.append({"role": "user", "content": f"User Prompt: \"{prompt}\""})

        try:
            raw_response = await self.router.call_model(messages)
            logger.debug("Raw intent response: %s", raw_response)

            # Strip any markdown blocks if the LLM wrapped it in ```json ... ```
            cleaned_json = raw_response.strip()
            if cleaned_json.startswith("```"):
                # strip code block prefix/suffix
                match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned_json)
                if match:
                    cleaned_json = match.group(1).strip()

            data = json.loads(cleaned_json)

            # Parse to Pydantic
            plan = ActionPlan(**data)
            return plan

        except Exception as e:
            logger.warning("Failed to parse intent. Falling back to simple chat action. Error: %s", e)
            # Default conversational fallback plan
            return ActionPlan(
                intent="General Conversational Chat",
                steps=[
                    ActionStep(
                        type="chat",
                        params={"message": f"I was unable to structure an automated action plan for this command ({str(e)}). How can I assist you otherwise?"},
                        description="Conversational fallback chat step."
                    )
                ],
                requires_confirmation=False,
                estimated_duration="2s",
                tools_needed=[]
            )
