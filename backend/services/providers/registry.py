import logging
from typing import Dict, List, Optional

from .base import BaseProvider
from .lm_studio import LMStudioProvider
from .openai_compat import OpenAIProvider, GroqProvider, GoogleProvider, OpenRouterProvider, OpenAICompatibleProvider
from .anthropic_provider import AnthropicProvider
from .ollama_provider import OllamaProvider

logger = logging.getLogger(__name__)

# Providers that require an API key to be useful
_CLOUD_PROVIDERS = {"openai", "groq", "google", "openrouter", "anthropic"}

# Auto-detect priority order (fastest / most-available first)
AUTO_DETECT_PRIORITY = ["lm_studio", "ollama", "groq", "openai", "anthropic", "google", "openrouter"]


class ProviderRegistry:
    """
    Singleton registry for all LLM providers.
    Initialized once at application startup from MongoDB settings.
    Supports dynamically registered custom OpenAI-compatible providers.
    """

    def __init__(self):
        self._providers: Dict[str, BaseProvider] = {}
        self._active_name: str = "lm_studio"
        self._custom_names: set = set()  # tracks which names are user-added

    # ── Registration ──────────────────────────────────────────────────────────

    def register(self, provider: BaseProvider) -> None:
        self._providers[provider.name] = provider
        logger.info(f"[Registry] Registered provider: {provider.display_name}")

    def register_custom(self, slug: str, display_name: str, base_url: str, api_key: Optional[str] = None) -> BaseProvider:
        """Dynamically create and register an OpenAI-compatible custom provider."""
        class _CustomProvider(OpenAICompatibleProvider):
            _default_base_url = base_url
            _default_api_key_env = ""
            _provider_name = slug
            _provider_display = display_name

        p = _CustomProvider()
        p._base_url = base_url
        if api_key:
            p._api_key = api_key
        self._providers[slug] = p
        self._custom_names.add(slug)
        logger.info(f"[Registry] Registered custom provider: {display_name} ({slug})")
        return p

    def remove_custom(self, slug: str) -> bool:
        if slug not in self._custom_names:
            return False
        self._providers.pop(slug, None)
        self._custom_names.discard(slug)
        if self._active_name == slug:
            self._active_name = "lm_studio"
        logger.info(f"[Registry] Removed custom provider: {slug}")
        return True

    # ── Access ────────────────────────────────────────────────────────────────

    def get_active(self) -> BaseProvider:
        provider = self._providers.get(self._active_name)
        if provider is None:
            logger.warning(f"[Registry] Active provider '{self._active_name}' not found, falling back to lm_studio")
            return self._providers["lm_studio"]
        return provider

    def set_active(self, name: str) -> None:
        if name not in self._providers:
            raise ValueError(f"Unknown provider: '{name}'. Available: {list(self._providers)}")
        self._active_name = name
        logger.info(f"[Registry] Active provider set to: {name}")

    def get(self, name: str) -> Optional[BaseProvider]:
        return self._providers.get(name)

    def list_all(self) -> List[dict]:
        return [
            {
                "name": p.name,
                "display_name": p.display_name,
                "is_active": p.name == self._active_name,
                "needs_api_key": p.name in _CLOUD_PROVIDERS or p.name in self._custom_names,
                "is_custom": p.name in self._custom_names,
            }
            for p in self._providers.values()
        ]

    # ── Auto-detect ───────────────────────────────────────────────────────────

    async def auto_select_model(self) -> tuple:
        """
        Select the best available model across all providers.
        Returns (model_id, provider_name).
        Priority: LM Studio → Groq → OpenAI → Anthropic → Google → OpenRouter → custom
        """
        ordered = list(AUTO_DETECT_PRIORITY)
        # Append custom providers at the end
        for name in self._custom_names:
            if name not in ordered:
                ordered.append(name)

        for provider_name in ordered:
            provider = self._providers.get(provider_name)
            if not provider:
                continue
            try:
                if not await provider.is_available():
                    continue
                models = await provider.list_models()
                if models:
                    selected = models[0]["id"]
                    logger.info(f"[Registry] Auto-detect selected: {selected} from {provider_name}")
                    return selected, provider_name
            except Exception as exc:
                logger.debug(f"[Registry] Auto-detect skipped {provider_name}: {exc}")

        # Hard fallback
        return "auto", self._active_name

    # ── Live reconfigure ──────────────────────────────────────────────────────

    def reconfigure_provider(self, name: str, config: dict) -> bool:
        provider = self._providers.get(name)
        if not provider:
            return False
        provider.configure(config)
        logger.info(f"[Registry] Reconfigured provider: {name}")
        return True

    # ── Startup init ──────────────────────────────────────────────────────────

    async def initialize(self) -> None:
        """
        Called once at startup:
        1. Register all built-in provider instances.
        2. Load settings from MongoDB.
        3. Configure providers that have stored API keys.
        4. Register any user-added custom providers.
        5. Set the active provider.
        """
        self.register(LMStudioProvider())
        self.register(OllamaProvider())
        self.register(OpenAIProvider())
        self.register(AnthropicProvider())
        self.register(GoogleProvider())
        self.register(GroqProvider())
        self.register(OpenRouterProvider())

        try:
            from models.settings import get_settings
            settings = await get_settings()

            # Apply stored API keys / base URLs to built-in providers
            for pname, pconfig in (settings.provider_configs or {}).items():
                provider = self._providers.get(pname)
                if provider and pconfig:
                    config_dict = pconfig.model_dump() if hasattr(pconfig, "model_dump") else dict(pconfig)
                    provider.configure(config_dict)
                    logger.info(f"[Registry] Configured built-in provider from DB: {pname}")

            # Register user-added custom providers
            for slug, cpconfig in (settings.custom_providers or {}).items():
                if cpconfig.enabled:
                    self.register_custom(
                        slug=slug,
                        display_name=cpconfig.display_name,
                        base_url=cpconfig.base_url,
                        api_key=cpconfig.api_key,
                    )

            # Set active provider
            active = getattr(settings, "active_provider", "lm_studio")
            if active in self._providers:
                self._active_name = active

        except Exception as exc:
            logger.warning(f"[Registry] Could not load provider settings from DB: {exc}")

        logger.info(f"[Registry] Initialization complete. Active: {self._active_name}")


# Module-level singleton — import this everywhere
provider_registry = ProviderRegistry()
