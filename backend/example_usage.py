#!/usr/bin/env python3
"""
Example usage script demonstrating the robust g4f AI Provider integration.
Covers sync, async, streaming, and error fallback modes.
"""

import asyncio
import logging
import sys

# Configure basic logging to see the fallback rotation & backoff actions
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

from ai_provider import G4FProvider, ProviderUnavailableError


def run_sync_examples(provider: G4FProvider):
    """Demonstrate synchronous chat and streaming calls."""
    print("\n" + "="*50)
    print("1. RUNNING SYNCHRONOUS EXAMPLES")
    print("="*50)

    messages = [{"role": "user", "content": "Explain gravity in one sentence."}]
    model = "gpt-4o-mini"

    # --- Sync Chat ---
    print("\n--- [Sync Chat] ---")
    try:
        response = provider.chat(messages, model=model)
        print(f"Success! Provider used: {response.provider}")
        print(f"Latency: {response.latency_ms}ms")
        print(f"Content: {response.content}")
    except ProviderUnavailableError as e:
        print(f"Failed: {e}")

    # --- Sync Streaming ---
    print("\n--- [Sync Streaming] ---")
    try:
        print("Response stream: ", end="", flush=True)
        stream_generator = provider.stream(messages, model=model)
        for token in stream_generator:
            print(token, end="", flush=True)
        print("\nStream completed!")
    except ProviderUnavailableError as e:
        print(f"\nStreaming failed: {e}")


async def run_async_examples(provider: G4FProvider):
    """Demonstrate asynchronous chat and streaming calls."""
    print("\n" + "="*50)
    print("2. RUNNING ASYNCHRONOUS EXAMPLES")
    print("="*50)

    messages = [{"role": "user", "content": "What is 15 + 27? Answer in one word."}]
    model = "gpt-4o-mini"

    # --- Async Chat ---
    print("\n--- [Async Chat] ---")
    try:
        response = await provider.chat_async(messages, model=model)
        print(f"Success! Provider used: {response.provider}")
        print(f"Latency: {response.latency_ms}ms")
        print(f"Content: {response.content}")
    except ProviderUnavailableError as e:
        print(f"Failed: {e}")

    # --- Async Streaming ---
    print("\n--- [Async Streaming] ---")
    try:
        print("Async Response stream: ", end="", flush=True)
        async_stream = provider.stream_async(messages, model=model)
        async for token in async_stream:
            print(token, end="", flush=True)
        print("\nAsync stream completed!")
    except ProviderUnavailableError as e:
        print(f"\nAsync streaming failed: {e}")


def show_providers_status(provider: G4FProvider):
    """Show the status report of the sub-providers and circuit breaker."""
    print("\n" + "="*50)
    print("3. SUB-PROVIDERS STATUS REPORT")
    print("="*50)
    report = provider.get_providers_report()
    for row in report:
        status_symbol = "🟢" if row["status"] == "ACTIVE" else "🔴"
        print(
            f"{status_symbol} {row['provider']:<15} "
            f"Status: {row['status']:<10} "
            f"Failures: {row['consecutive_failures']:<3} "
            f"Cool-down left: {row['cool_down_remaining_seconds']}s"
        )


async def main():
    # Initialize G4FProvider. It will load backend/config.yaml or use defaults.
    provider = G4FProvider()

    # 1. Run Synchronous examples
    run_sync_examples(provider)

    # 2. Run Asynchronous examples
    await run_async_examples(provider)

    # 3. View status reports
    show_providers_status(provider)


if __name__ == "__main__":
    asyncio.run(main())
