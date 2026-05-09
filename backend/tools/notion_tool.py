import os
import requests
import logging

logger = logging.getLogger(__name__)

class NotionTool:
    def __init__(self):
        self.version = '2022-06-28' # Modern Notion API version
        self.base_url = 'https://api.notion.com/v1'

    def _get_headers(self):
        api_key = os.environ.get("NOTION_API_KEY")
        if not api_key:
            raise Exception("NOTION_API_KEY is not set.")
        return {
            'Authorization': f'Bearer {api_key}',
            'Notion-Version': self.version,
            'Content-Type': 'application/json'
        }

    def execute(self, action: str, query: str = None, pageId: str = None, databaseId: str = None, title: str = None, content: str = None) -> str:
        try:
            headers = self._get_headers()
            if action == 'search':
                res = requests.post(f"{self.base_url}/search", json={"query": query} if query else {}, headers=headers)
            elif action == 'getPage':
                res = requests.get(f"{self.base_url}/pages/{pageId}", headers=headers)
            elif action == 'getBlocks':
                res = requests.get(f"{self.base_url}/blocks/{pageId}/children", headers=headers)
            else:
                return f"Unsupported Notion action: {action}"
            
            res.raise_for_status()
            return str(res.json())
        except Exception as e:
            logger.error(f"NotionTool execution failed: {e}")
            return f"Error: {str(e)}"

_notion_tool = NotionTool()

def dispatch_notion(kwargs: dict) -> str:
    return _notion_tool.execute(**kwargs)
