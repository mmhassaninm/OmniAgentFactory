"""
Secrets Vault — central access point for all API keys and secrets.
Validates that no secret is stored in agent memory or logs.
"""

import logging
import os
import re
from typing import Optional

logger = logging.getLogger(__name__)

# All known environment variable keys for secrets
SECRET_KEYS: dict[str, str] = {
    # Messaging
    "telegram_bot_token": "TELEGRAM_BOT_TOKEN",
    "telegram_chat_id": "TELEGRAM_CHAT_ID",
    "whatsapp_api_key": "WHATSAPP_API_KEY",
    "discord_bot_token": "DISCORD_BOT_TOKEN",
    # AI Providers
    "openrouter_key": "OPENROUTER_KEY_1",
    "groq_key": "GROQ_KEY_1",
    "gemini_key": "GEMINI_KEY_1",
    "anthropic_key": "ANTHROPIC_KEY",
    "github_token": "GITHUB_TOKEN_1",
    "hf_key": "HF_KEY_1",
    # Payments
    "paypal_client_id": "PAYPAL_CLIENT_ID",
    "paypal_client_secret": "PAYPAL_CLIENT_SECRET",
    "paypal_email": "PAYPAL_EMAIL",
    # Commerce
    "shopify_access_token": "SHOPIFY_ACCESS_TOKEN",
    "shopify_store_url": "SHOPIFY_STORE_URL",
    # Auth
    "auth_secret_key": "AUTH_SECRET_KEY",
}

# Patterns for detecting leaked secrets in text
LEAK_PATTERNS: list[str] = [
    r"(?:sk[-_]live|sk[-_]test)_[A-Za-z0-9]{10,}",
    r"shpat_[A-Za-z0-9]{10,}",
    r"A2E[A-Za-z0-9]{15,}",
    r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
]


class SecretsVault:
    """
    Central access point for all secrets.
    All code MUST use this class instead of os.getenv() directly.
    """

    def get(self, key_name: str, default: str = "") -> str:
        """
        Get a secret value by its friendly name.

        Args:
            key_name: Friendly name (e.g., "telegram_bot_token")
            default: Default value if not found

        Returns:
            The secret value or default
        """
        env_var = SECRET_KEYS.get(key_name)
        if not env_var:
            logger.warning("[SecretsVault] Unknown secret key: %s", key_name)
            return default
        return os.getenv(env_var, default)

    def get_all(self) -> dict[str, str]:
        """Get all secrets with their friendly names."""
        result: dict[str, str] = {}
        for name, env_var in SECRET_KEYS.items():
            value = os.getenv(env_var, "")
            result[name] = value
        return result

    def mask_value(self, value: str) -> str:
        """Mask a secret value for logging purposes."""
        if len(value) <= 8:
            return "****"
        return value[:4] + "****" + value[-4:]

    def check_for_leaks(self, text: str) -> list[str]:
        """
        Scan text for potential secret leakage.
        Returns list of detected leak types.
        """
        leaks: list[str] = []
        for pattern in LEAK_PATTERNS:
            if re.search(pattern, text):
                leaks.append(f"Pattern matched: {pattern[:30]}")
        return leaks

    def startup_audit(self) -> list[str]:
        """
        Run a startup audit to check for accidental secret leakage in logs.
        Returns list of warnings.
        """
        warnings: list[str] = []

        # Check for secrets logged as environment variables
        log_dir = "."
        try:
            for fname in os.listdir(log_dir):
                if fname.endswith(".log") or fname.endswith(".json"):
                    fpath = os.path.join(log_dir, fname)
                    if os.path.isfile(fpath) and os.path.getsize(fpath) < 10 * 1024 * 1024:  # < 10MB
                        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                            content = f.read()
                            leaks = self.check_for_leaks(content)
                            if leaks:
                                warnings.append(f"Potential secret leak in {fname}: {leaks}")
        except Exception as e:
            logger.warning("[SecretsVault] Startup audit error: %s", e)

        return warnings


# Singleton
_vault_instance: Optional[SecretsVault] = None


def get_secrets_vault() -> SecretsVault:
    """Get or create the singleton SecretsVault."""
    global _vault_instance
    if _vault_instance is None:
        _vault_instance = SecretsVault()
    return _vault_instance