import sys
import json
import time

def main():
    # Force UTF-8 on Windows just in case to comply with Phase 23 Localization Rules
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

    print("Python Core Daemon v1.0 [STUB] Initialized.", flush=True)

    while True:
        try:
            # Read line from Node.js (Electron Orchestrator)
            line = sys.stdin.readline()
            if not line:
                break # EOF reached, parent died

            # Try parsing the incoming IPC json blob
            payload = json.loads(line.strip())
            
            command = payload.get('command', 'inference_request')
            
            # Phase 16: Route Vault Commands to the cryptography module
            if command == 'vault':
                from vault.cryptography import handle_vault_command
                result = handle_vault_command(payload)
                print(json.dumps(result, ensure_ascii=False), flush=True)
                continue
                
            # Phase 14 / 23: Default LLM Inference message
            query = payload.get('query', '')
            target_lang = payload.get('target_language', 'english')
            
            # Simulate real LLM latency
            time.sleep(1.5)

            # Construct an Arabic or English response dynamically ensuring Encoding works
            if target_lang == 'arabic':
                response = f"أهلاً بك. أنا نواة بايثون (Python Core). استلمت رسالتك: '{query}'. وجاهز لمعالجتها محلياً."
            else:
                response = f"Hello. I am the Python Core. I received your message: '{query}'. Ready to process locally."

            # Push back via JSON STDOUT over IPC pipe
            print(json.dumps({"type": "chat", "output": response}, ensure_ascii=False), flush=True)

        except json.JSONDecodeError:
            print(json.dumps({"type": "error", "error": "Invalid JSON received."}), file=sys.stderr, flush=True)
            continue
        except Exception as e:
            print(json.dumps({"type": "error", "error": f"Core Error: {str(e)}"}), file=sys.stderr, flush=True)
            time.sleep(1)

if __name__ == "__main__":
    main()
