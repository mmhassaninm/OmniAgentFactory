import os
import requests
import logging

logger = logging.getLogger(__name__)

class GithubTool:
    def __init__(self):
        self.base_url = 'https://api.github.com'

    def _get_headers(self):
        token = os.environ.get('GITHUB_TOKEN')
        if not token:
            raise Exception("GITHUB_TOKEN environment variable is missing.")
        return {
            'Authorization': f'Bearer {token}',
            'Accept': 'application/vnd.github.v3+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }

    def execute(self, action: str, repo: str = None, prNumber: int = None, issueNumber: int = None, title: str = None, body: str = None, query: str = None) -> str:
        try:
            headers = self._get_headers()
            
            if action == 'listPRs':
                if not repo: raise Exception("repo is required")
                res = requests.get(f"{self.base_url}/repos/{repo}/pulls?state=all", headers=headers)
            elif action == 'viewPR':
                if not repo or not prNumber: raise Exception("repo and prNumber required")
                res = requests.get(f"{self.base_url}/repos/{repo}/pulls/{prNumber}", headers=headers)
            elif action == 'listIssues':
                if not repo: raise Exception("repo is required")
                res = requests.get(f"{self.base_url}/repos/{repo}/issues?state=open", headers=headers)
            elif action == 'viewIssue':
                if not repo or not issueNumber: raise Exception("repo and issueNumber required")
                res = requests.get(f"{self.base_url}/repos/{repo}/issues/{issueNumber}", headers=headers)
            elif action == 'createIssue':
                if not repo or not title: raise Exception("repo and title required")
                res = requests.post(f"{self.base_url}/repos/{repo}/issues", json={"title": title, "body": body or ""}, headers=headers)
            elif action == 'runAPIQuery':
                if not query: raise Exception("query required")
                clean_query = query if query.startswith('/') else f"/{query}"
                res = requests.get(f"{self.base_url}{clean_query}", headers=headers)
            else:
                return f"Unsupported GitHub action: {action}"
            
            res.raise_for_status()
            
            if isinstance(res.json(), list) and action in ['listPRs', 'listIssues']:
                data = res.json()
                summary = []
                for item in data[:10]:
                    summary.append({
                        "number": item.get("number"),
                        "title": item.get("title"),
                        "state": item.get("state"),
                        "user": item.get("user", {}).get("login"),
                        "url": item.get("html_url")
                    })
                return str(summary)
            
            return str(res.json())
        except Exception as e:
            logger.error(f"GithubTool execution failed: {e}")
            return f"Error: {str(e)}"

_github_tool = GithubTool()

def dispatch_github(kwargs: dict) -> str:
    return _github_tool.execute(**kwargs)
