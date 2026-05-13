"""
Unit tests for backend/core/model_router.py payload upgrades.
Verifies OpenRouter Provider Fallback lists, Prompt Caching formatting, and Response Healing plugin injection.
"""

import pytest
from unittest.mock import AsyncMock, patch
from core.model_router import route_completion, _try_completion

@pytest.mark.asyncio
async def test_openrouter_payload_upgrades():
    """Verify that calling an OpenRouter model automatically adds Provider Fallbacks, Prompt Caching, and Response Healing parameters."""
    
    mock_response = AsyncMock()
    mock_response.choices = [AsyncMock()]
    mock_response.choices[0].message.content = "Test success reply"
    
    with patch("core.model_router.acompletion", return_value=mock_response) as mock_acompletion:
        # Define mock messages
        messages = [
            {"role": "system", "content": "You are a helpful system assistant."},
            {"role": "user", "content": "Hello"}
        ]
        
        # Trigger route_completion (using mock api_keys in DB/config fallback)
        with patch("core.model_router._fetch_keys_for_provider", return_value=["test_api_key"]):
            result = await route_completion(
                messages=messages,
                response_format={"type": "json_object"}
            )
        
        # Inspect the call to acompletion
        assert mock_acompletion.called
        call_kwargs = mock_acompletion.call_args[1]
        
        # 1. Base API URL
        assert call_kwargs["api_base"] == "https://openrouter.ai/api/v1"
        
        # 2. Provider Fallback - models array and route: fallback
        extra_body = call_kwargs["extra_body"]
        assert "models" in extra_body
        assert "route" in extra_body
        assert extra_body["route"] == "fallback"
        # Models should be stripped of openrouter/
        assert extra_body["models"][0] == "auto"
        assert "meta-llama/llama-3.1-8b-instruct:free" in extra_body["models"]
        
        # 3. Response Healing - plugins array
        assert "plugins" in extra_body
        assert extra_body["plugins"] == [{"id": "response-healing"}]
        
        # 4. System Prompt Caching block transformation
        final_messages = call_kwargs["messages"]
        system_msg = final_messages[0]
        assert system_msg["role"] == "system"
        assert isinstance(system_msg["content"], list)
        assert system_msg["content"][0]["type"] == "text"
        assert system_msg["content"][0]["text"] == "You are a helpful system assistant."
        assert system_msg["content"][0]["cache_control"] == {"type": "ephemeral"}
        
        # 5. Optimal headers
        extra_headers = call_kwargs["extra_headers"]
        assert extra_headers["HTTP-Referer"] == "https://github.com/mmhassaninm/OmniAgentFactory"
        assert extra_headers["X-Title"] == "NexusOS Autonomous Agent Factory"
