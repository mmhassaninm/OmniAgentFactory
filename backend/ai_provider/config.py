"""
Configuration loading module for the AIProvider layer.
Loads settings from config.yaml and supports environment variable overrides.
"""

import os
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
import yaml

logger = logging.getLogger(__name__)


class ProviderConfig:
    """
    Loads and manages configuration for the free AI provider integration layer.
    """

    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path
        self.settings: Dict[str, Any] = {}
        self.load_defaults()
        self.load_from_yaml()
        self.apply_env_overrides()

    def load_defaults(self) -> None:
        """Load built-in default settings."""
        self.settings = {
            "providers": [
                "Bing",
                "DeepInfra",
                "You",
                "ChatgptNext",
                "Liaobots",
                "FlowGpt"
            ],
            "models": {
                "gpt-4": "gpt-4",
                "gpt-4o": "gpt-4o",
                "gpt-4o-mini": "gpt-4o-mini",
                "gpt-3.5-turbo": "gpt-3.5-turbo",
                "claude-3-haiku": "claude-3-haiku",
                "claude-3-opus": "claude-3-opus"
            },
            "retry_count": 5,
            "initial_backoff": 1.0,
            "max_backoff": 30.0,
            "throttle_seconds": 0.5,
            "cache": {
                "enabled": True,
                "ttl": 300,
                "max_size": 1000
            },
            "circuit_breaker": {
                "max_failures": 3,
                "cool_down_seconds": 300
            }
        }

    def load_from_yaml(self) -> None:
        """Try loading configuration from a YAML file."""
        paths_to_check = []
        if self.config_path:
            paths_to_check.append(Path(self.config_path))
        else:
            # Check standard places
            paths_to_check.append(Path("config.yaml"))
            paths_to_check.append(Path("backend/config.yaml"))
            paths_to_check.append(Path("/app/config.yaml"))
            paths_to_check.append(Path("/project/backend/config.yaml"))

        for path in paths_to_check:
            if path.exists() and path.is_file():
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        yaml_content = yaml.safe_load(f)
                        if yaml_content:
                            self._merge_dicts(self.settings, yaml_content)
                            logger.info(f"Loaded config from {path}")
                            break
                except Exception as e:
                    logger.warning(f"Failed to load config from {path}: {e}")

    def _merge_dicts(self, base: Dict[str, Any], overlay: Dict[str, Any]) -> None:
        """Recursively merge two dictionaries."""
        for k, v in overlay.items():
            if k in base and isinstance(base[k], dict) and isinstance(v, dict):
                self._merge_dicts(base[k], v)
            else:
                base[k] = v

    def apply_env_overrides(self) -> None:
        """Apply overrides from environment variables (prefixed with FREE_AI_)."""
        # Providers list override (comma-separated string)
        if "FREE_AI_PROVIDERS" in os.environ:
            providers_str = os.environ["FREE_AI_PROVIDERS"]
            self.settings["providers"] = [p.strip() for p in providers_str.split(",") if p.strip()]

        # General overrides
        env_map = {
            "FREE_AI_RETRY_COUNT": ("retry_count", int),
            "FREE_AI_INITIAL_BACKOFF": ("initial_backoff", float),
            "FREE_AI_MAX_BACKOFF": ("max_backoff", float),
            "FREE_AI_THROTTLE_SECONDS": ("throttle_seconds", float),
            "FREE_AI_CACHE_ENABLED": ("cache.enabled", lambda x: x.lower() == "true"),
            "FREE_AI_CACHE_TTL": ("cache.ttl", int),
            "FREE_AI_CACHE_MAX_SIZE": ("cache.max_size", int),
            "FREE_AI_CB_MAX_FAILURES": ("circuit_breaker.max_failures", int),
            "FREE_AI_CB_COOL_DOWN": ("circuit_breaker.cool_down_seconds", int),
        }

        for env_var, (settings_key, caster) in env_map.items():
            if env_var in os.environ:
                try:
                    val = caster(os.environ[env_var])
                    keys = settings_key.split(".")
                    # Traverse keys to assign
                    curr = self.settings
                    for key in keys[:-1]:
                        curr = curr.setdefault(key, {})
                    curr[keys[-1]] = val
                except Exception as e:
                    logger.warning(f"Failed to apply env override {env_var}: {e}")

    @property
    def providers(self) -> List[str]:
        return self.settings.get("providers", [])

    @property
    def models(self) -> Dict[str, str]:
        return self.settings.get("models", {})

    @property
    def retry_count(self) -> int:
        return self.settings.get("retry_count", 5)

    @property
    def initial_backoff(self) -> float:
        return self.settings.get("initial_backoff", 1.0)

    @property
    def max_backoff(self) -> float:
        return self.settings.get("max_backoff", 30.0)

    @property
    def throttle_seconds(self) -> float:
        return self.settings.get("throttle_seconds", 0.5)

    @property
    def cache_enabled(self) -> bool:
        return self.settings.get("cache", {}).get("enabled", True)

    @property
    def cache_ttl(self) -> int:
        return self.settings.get("cache", {}).get("ttl", 300)

    @property
    def cache_max_size(self) -> int:
        return self.settings.get("cache", {}).get("max_size", 1000)

    @property
    def cb_max_failures(self) -> int:
        return self.settings.get("circuit_breaker", {}).get("max_failures", 3)

    @property
    def cb_cool_down(self) -> int:
        return self.settings.get("circuit_breaker", {}).get("cool_down_seconds", 300)
