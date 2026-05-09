import os
import requests
import logging

logger = logging.getLogger(__name__)

class DiscordTool:
    def __init__(self):
        self.token = os.environ.get("DISCORD_TOKEN")
        self.base_url = "https://discord.com/api/v10"

    def _get_headers(self):
        if not self.token:
            raise Exception("Zero-Trust Error: DISCORD_TOKEN is not configured.")
        return {
            "Authorization": f"Bot {self.token}",
            "Content-Type": "application/json"
        }

    def execute(self, action: str, channelId: str = None, userId: str = None, message: str = None, limit: int = 10, emoji: str = None, messageId: str = None, threadName: str = None) -> str:
        try:
            headers = self._get_headers()
            if action == 'send':
                target = channelId or userId
                res = requests.post(f"{self.base_url}/channels/{target}/messages", json={"content": message}, headers=headers)
                res.raise_for_status()
                return f"Message sent to {target}."
            elif action == 'read':
                res = requests.get(f"{self.base_url}/channels/{channelId}/messages?limit={limit}", headers=headers)
                res.raise_for_status()
                return str(res.json())
            else:
                return f"Unsupported Discord action: {action}"
        except Exception as e:
            logger.error(f"DiscordTool execution failed: {e}")
            return f"Error: {str(e)}"

_discord_tool = DiscordTool()

def dispatch_discord(kwargs: dict) -> str:
    return _discord_tool.execute(**kwargs)
