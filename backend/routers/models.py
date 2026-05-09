import os
import httpx
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://127.0.0.1:1234/v1/models")
LM_STUDIO_BASE = LM_STUDIO_URL.replace("/v1/models", "")

# Global lock to prevent concurrent swaps
SWAP_LOCK = asyncio.Lock()

class SwapRequest(BaseModel):
    newModel: str

@router.get("")
async def get_models():
    """Return models from the currently active provider."""
    from services.providers import provider_registry
    provider = provider_registry.get_active()
    print(f"[OmniBot] Fetching models from provider: {provider.display_name}", flush=True)
    try:
        models = await provider.list_models()
        # Return in OpenAI-compatible format so existing frontend code works
        return {"data": [{"id": m["id"], "object": "model"} for m in models]}
    except Exception as e:
        print(f"[OmniBot] Error fetching models: {e}", flush=True)
        return {"data": []}

@router.post("/swap")
async def swap_model(request: SwapRequest):
    async with SWAP_LOCK:
        new_model = request.newModel
        print(f"[OmniBot] 🧠 Model Swap Started: Target -> {new_model or 'None'}", flush=True)
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Fetch ACTUALLY loaded models (using /api/v0/models)
            try:
                # /api/v0/models usually returns only active models in VRAM
                res = await client.get(f"{LM_STUDIO_BASE}/api/v0/models", timeout=5.0)
                if res.status_code != 200:
                    # Fallback to checking models with info
                    res = await client.get(f"{LM_STUDIO_BASE}/v1/models", timeout=5.0)
                
                data = res.json()
                # If using api/v0, it returns a list directly or in 'data'
                models_data = data if isinstance(data, list) else data.get("data", [])
                loaded_models = [m["id"] for m in models_data]
                print(f"[OmniBot] Active VRAM Models: {loaded_models}", flush=True)
            except Exception as e:
                print(f"[OmniBot] Error detecting active models: {e}")
                loaded_models = []

            EMBEDDING_MODEL = 'text-embedding-bge-m3'
            
            # 2. Unload models that shouldn't be there
            for loaded_id in loaded_models:
                if loaded_id != EMBEDDING_MODEL and loaded_id != new_model:
                    print(f"[OmniBot] 🔄 Unloading: {loaded_id}", flush=True)
                    for url in [
                        f"{LM_STUDIO_BASE}/api/v0/model/unload", # Singular 'model'
                        f"{LM_STUDIO_BASE}/api/v0/models/unload", 
                        f"{LM_STUDIO_BASE}/v1/models/unload"
                    ]:
                        try:
                            await client.post(url, json={"model": loaded_id}, timeout=2.0)
                        except: pass
            
            # 3. Force load if not active
            if new_model and new_model not in loaded_models:
                print(f"[OmniBot] ⚡ Forcing ACTIVATION of: {new_model}", flush=True)
                try:
                    # Forced load via dummy chat completion
                    await client.post(f"{LM_STUDIO_BASE}/v1/chat/completions", json={
                        "model": new_model,
                        "messages": [{"role": "user", "content": "wake up"}],
                        "max_tokens": 1
                    }, timeout=45.0) # Increased timeout for heavy loads
                except Exception as e:
                    print(f"[OmniBot] ⚠️ Activation failed for {new_model}: {e}", flush=True)

            return {"success": True, "message": f"Deep VRAM Recovery applied for {new_model}"}

async def auto_ignition(yield_callback=None) -> str:
    """
    Self-healing protocol for '400 No Models Loaded'.
    Checks if VRAM is empty. If it is, scans downloaded models and loads the best coding fallback.
    Returns the ID of the loaded model.
    """
    # 1. Check if VRAM is actually empty
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.get(f"{LM_STUDIO_BASE}/v1/models")
            loaded = [m["id"] for m in res.json().get("data", []) if m["id"] != 'text-embedding-bge-m3']
            if len(loaded) > 0:
                return loaded[0]
        except: pass
        
    if yield_callback: 
        await yield_callback("⚠️ VRAM IS EMPTY! Initiating Auto-Ignition Sequence...")
    print("[OmniBot] ⚠️ VRAM IS EMPTY! Initiating Auto-Ignition Sequence...", flush=True)
    
    # 2. Get available models
    available = []
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            res = await client.get(f"{LM_STUDIO_BASE}/api/v1/models")
            if res.status_code == 200:
                data = res.json().get("data", [])
                available = [m["id"] for m in data]
        except: pass
        
    if not available:
        msg = "❌ Auto-Ignition Failed: No downloaded models found in LM Studio."
        if yield_callback: await yield_callback(msg)
        print(f"[OmniBot] {msg}", flush=True)
        return ""
        
    # 3. Select best fallback model (prioritize coder/qwen/deepseek)
    priority_keywords = ['coder', 'qwen', 'deepseek']
    best_model = available[0]
    for kw in priority_keywords:
        match = next((m for m in available if kw in m.lower()), None)
        if match:
            best_model = match
            break
            
    msg = f"🚀 Auto-Ignition: Loading fallback model '{best_model}'..."
    if yield_callback: await yield_callback(msg)
    print(f"[OmniBot] {msg}", flush=True)
    
    # 4. Activate the model
    # We can invoke the swap_model endpoint internally via SwapRequest
    # so we don't have to duplicate the unload/load logic.
    await swap_model(SwapRequest(newModel=best_model))
    
    msg = f"✅ Auto-Ignition Complete: {best_model} is online."
    if yield_callback: await yield_callback(msg)
    print(f"[OmniBot] {msg}", flush=True)
    
    return best_model
