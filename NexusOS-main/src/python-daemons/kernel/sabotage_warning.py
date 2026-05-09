"""
🧪 Nexus-Sentinel V2: Sabotage Warning Test
=============================================
This script imports the sentinel_hook and intentionally triggers
a UserWarning and a DeprecationWarning to test the cross-runtime
healing pipeline.
"""

import warnings
import sentinel_hook  # noqa: F401 - activates the hook on import

def run_sabotage():
    """Trigger deliberate warnings for Sentinel to intercept."""
    print("[Sabotage] ⚡ Triggering deliberate Python warnings...")

    # Warning 1: UserWarning - simulates a bad configuration path
    warnings.warn(
        "Config file '/etc/nexus/phantom.conf' not found. Using defaults.",
        UserWarning,
        stacklevel=1
    )

    # Warning 2: DeprecationWarning - simulates a deprecated API
    warnings.warn(
        "Function 'legacy_encrypt()' is deprecated. Use 'vault_encrypt()' instead.",
        DeprecationWarning,
        stacklevel=1
    )

    print("[Sabotage] ✅ Warnings dispatched. Sentinel should intercept them.")


if __name__ == "__main__":
    run_sabotage()
