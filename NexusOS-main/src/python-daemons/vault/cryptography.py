# src/python-daemons/vault/cryptography.py
import os
import sys
import json
from base64 import b64encode, b64decode
# Note: For production, we will use cryptography package. For this Phase stub, we use native libs
# The user will need to `pip install cryptography` for the real AES-GCM later
# For now, we simulate the lock/unlock logic to structure the IPC protocol
import hashlib

VAULT_DIR = os.environ.get('USERPROFILE', '') + "\\Documents\\Nexus_Vault"
CONFIG_FILE = os.path.join(VAULT_DIR, ".vault_config.json")

def ensure_vault_exists():
    if not os.path.exists(VAULT_DIR):
        os.makedirs(VAULT_DIR)
        hide_vault(VAULT_DIR)  # Make it hidden via Windows API

def hide_vault(path):
    import ctypes
    # FILE_ATTRIBUTE_HIDDEN = 0x02, FILE_ATTRIBUTE_SYSTEM = 0x04
    ctypes.windll.kernel32.SetFileAttributesW(path, 0x02 | 0x04)

def derive_key(passkey: str) -> str:
    # Phase 16: Simple SHA-256 for basic validation before AES implementation
    return hashlib.sha256(passkey.encode('utf-8')).hexdigest()

def is_vault_locked() -> bool:
    if not os.path.exists(CONFIG_FILE): return False
    with open(CONFIG_FILE, 'r') as f:
        data = json.load(f)
        return data.get('locked', False)

def handle_vault_command(command_data: dict) -> dict:
    action = command_data.get('action')
    passkey = command_data.get('passkey', '')
    
    ensure_vault_exists()

    if action == 'status':
        return {"status": "success", "locked": is_vault_locked()}

    if action == 'lock':
        # In full implementation: Walk directory, compress to .nxv (NexusVault format), encrypt, delete originals
        with open(CONFIG_FILE, 'w') as f:
            json.dump({"locked": True, "key_hash": derive_key(passkey)}, f)
        
        # Memory wiped via Python GC implicitly here, native wipe needed later
        return {"status": "success", "message": "Vault successfully locked and hidden."}
        
    elif action == 'unlock':
        if not os.path.exists(CONFIG_FILE):
            return {"status": "error", "message": "Vault configuration not found."}
            
        with open(CONFIG_FILE, 'r') as f:
            data = json.load(f)
            if data.get('key_hash') != derive_key(passkey):
                return {"status": "error", "message": "Invalid Passkey."}
            
        # In full implementation: Decrypt .nxv, extract files, wipe memory buffer
        with open(CONFIG_FILE, 'w') as f:
            json.dump({"locked": False, "key_hash": derive_key(passkey)}, f)
            
        return {"status": "success", "message": "Vault unlocked successfully."}
    
    return {"status": "error", "message": "Unknown vault command."}
