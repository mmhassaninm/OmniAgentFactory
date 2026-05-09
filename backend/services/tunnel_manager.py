"""
Expose OmniBot to the internet via Cloudflare tunnel.
Your local machine becomes a SaaS product.
"""
import asyncio
import subprocess
import re
import httpx


class TunnelManager:
    def __init__(self):
        self.tunnel_url = None
        self.process = None

    async def start(self) -> str:
        """Start Cloudflare tunnel and return public URL."""
        self.process = await asyncio.create_subprocess_exec(
            "cloudflared", "tunnel", "--url", "http://localhost:3001",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        while True:
            line = await self.process.stderr.readline()
            if not line:
                break
            line = line.decode(errors="ignore")
            match = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', line)
            if match:
                self.tunnel_url = match.group(0)
                return self.tunnel_url

        raise RuntimeError("Could not start Cloudflare tunnel")

    def stop(self):
        if self.process:
            self.process.terminate()


_tunnel = TunnelManager()
