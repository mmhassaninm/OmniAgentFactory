import os
import json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from dotenv import load_dotenv

load_dotenv()

ENCRYPTION_KEY = os.getenv("OMNIBOT_ENCRYPTION_KEY")
if not ENCRYPTION_KEY:
    print("[SECURITY FATAL] OMNIBOT_ENCRYPTION_KEY is missing from .env. The Supreme Constitution mandates AES-256 encryption. Halting execution securely.", flush=True)
    exit(1)

key_bytes = ENCRYPTION_KEY.ljust(32, '0')[:32].encode('utf-8')
aesgcm = AESGCM(key_bytes)

def encrypt(text) -> str:
    if not text:
        return text
    try:
        iv = os.urandom(16)
        data = text.encode('utf-8') if isinstance(text, str) else json.dumps(text).encode('utf-8')
        encrypted_with_tag = aesgcm.encrypt(iv, data, None)
        encrypted_text = encrypted_with_tag[:-16]
        auth_tag = encrypted_with_tag[-16:]
        return f"{iv.hex()}:{auth_tag.hex()}:{encrypted_text.hex()}"
    except Exception as e:
        print(f"[ENCRYPTION ERROR] {e}", flush=True)
        return text

def decrypt(hash_str) -> str:
    if not hash_str or not isinstance(hash_str, str) or ':' not in hash_str:
        return hash_str
    try:
        parts = hash_str.split(':')
        if len(parts) != 3:
            return hash_str
        iv = bytes.fromhex(parts[0])
        auth_tag = bytes.fromhex(parts[1])
        encrypted_text = bytes.fromhex(parts[2])
        data = encrypted_text + auth_tag
        decrypted_bytes = aesgcm.decrypt(iv, data, None)
        decrypted_str = decrypted_bytes.decode('utf-8')
        try:
            return json.loads(decrypted_str)
        except json.JSONDecodeError:
            return decrypted_str
    except Exception as e:
        print(f"[DECRYPTION ERROR] {e}", flush=True)
        return hash_str
