"""
Discord Gateway for OmniBot — connects via discord.py.
Provides: connect(), send_message(to, text), on_message handler.

Supports slash commands: /run /status /evolve /money /shopify

If DISCORD_BOT_TOKEN is not set or discord.py is not installed,
all methods log a warning and return gracefully.
"""

import asyncio
import logging
from typing import Optional, Callable, Awaitable

logger = logging.getLogger(__name__)

# Try to import discord.py — if not available, degrade gracefully
try:
    import discord
    from discord.ext import commands as discord_commands

    DISCORD_AVAILABLE = True
except ImportError:
    DISCORD_AVAILABLE = False
    discord = None  # type: ignore
    discord_commands = None  # type: ignore


class DiscordChannel:
    """Discord bot that listens to messages and routes them to the agent loop."""

    def __init__(self, bot_token: str = "") -> None:
        self.bot_token: str = bot_token
        self._enabled: bool = bool(bot_token) and DISCORD_AVAILABLE
        self._bot: Optional[commands.Bot] = None
        self._message_handler: Optional[Callable[[str, str, str], Awaitable[None]]] = None
        self._running: bool = False

    async def connect(self) -> bool:
        """Start the Discord bot. Returns True if ready."""
        if not self._enabled:
            if not self.bot_token:
                logger.warning("[Discord] Channel disabled — no DISCORD_BOT_TOKEN configured")
            elif not DISCORD_AVAILABLE:
                logger.warning("[Discord] Channel disabled — discord.py not installed")
            return False

        try:
            intents = discord.Intents.default()
            intents.message_content = True
            self._bot = commands.Bot(command_prefix="!", intents=intents)

            @self._bot.event
            async def on_ready() -> None:
                self._running = True
                logger.info("[Discord] Bot logged in as %s", self._bot.user)

            @self._bot.event
            async def on_message(message: discord.Message) -> None:
                if message.author.bot:
                    return
                if self._message_handler:
                    await self._message_handler(
                        channel="discord",
                        user_id=str(message.author.id),
                        message=message.content,
                    )

            # Register slash commands
            await self._register_slash_commands()

            asyncio.create_task(self._bot.start(self.bot_token))
            logger.info("[Discord] Bot connecting...")
            return True
        except Exception as e:
            logger.warning("[Discord] Connection failed: %s", e)
            self._enabled = False
            return False

    async def _register_slash_commands(self) -> None:
        """Register Discord slash commands."""
        if not self._bot:
            return

        tree = self._bot.tree

        @tree.command(name="run", description="Run a task in OmniBot")
        async def slash_run(interaction: discord.Interaction, task: str) -> None:
            await interaction.response.send_message(f"🤖 Running task: {task}", ephemeral=True)
            if self._message_handler:
                await self._message_handler("discord", str(interaction.user.id), f"/run {task}")

        @tree.command(name="status", description="Check OmniBot system status")
        async def slash_status(interaction: discord.Interaction) -> None:
            await interaction.response.send_message("📊 Checking status...", ephemeral=True)
            if self._message_handler:
                await self._message_handler("discord", str(interaction.user.id), "/status")

        @tree.command(name="evolve", description="Trigger evolution cycle")
        async def slash_evolve(interaction: discord.Interaction) -> None:
            await interaction.response.send_message("🧬 Triggering evolution...", ephemeral=True)
            if self._message_handler:
                await self._message_handler("discord", str(interaction.user.id), "/evolve")

        @tree.command(name="money", description="Check money agent status")
        async def slash_money(interaction: discord.Interaction) -> None:
            await interaction.response.send_message("💰 Checking finances...", ephemeral=True)
            if self._message_handler:
                await self._message_handler("discord", str(interaction.user.id), "/money")

        @tree.command(name="shopify", description="Shopify swarm status and control")
        async def slash_shopify(interaction: discord.Interaction, action: str = "status") -> None:
            await interaction.response.send_message(f"🛒 Shopify {action}...", ephemeral=True)
            if self._message_handler:
                await self._message_handler("discord", str(interaction.user.id), f"/shopify {action}")

    async def send_message(self, to: str, text: str) -> bool:
        """Send a message to a Discord channel by channel_id."""
        if not self._enabled or not self._bot:
            return False
        try:
            channel_id = int(to)
            channel = self._bot.get_channel(channel_id)
            if channel:
                await channel.send(text)
                return True
            # Try fetching if not cached
            channel = await self._bot.fetch_channel(channel_id)
            if channel:
                await channel.send(text)
                return True
            logger.warning("[Discord] Channel %s not found", to)
            return False
        except Exception as e:
            logger.warning("[Discord] send_message error: %s", e)
            return False

    async def listen_webhook(
        self,
        handler: Callable[[str, str, str], Awaitable[None]],
    ) -> None:
        """Register the callback for incoming messages."""
        self._message_handler = handler
        logger.info("[Discord] Message handler registered")

    async def disconnect(self) -> None:
        """Clean shutdown of the Discord bot."""
        self._running = False
        if self._bot:
            try:
                await self._bot.close()
            except Exception as e:
                logger.warning("[Discord] Disconnect error: %s", e)
        logger.info("[Discord] Channel disconnected")


# Alias for compatibility
commands = discord_commands