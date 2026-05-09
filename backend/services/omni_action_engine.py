import os
import docker
import tempfile
import time
import subprocess
from typing import Optional

# Initialize Docker client
try:
    client = docker.from_env()
except Exception as e:
    print(f"Docker client initialization failed: {e}")
    client = None

CODE_TIMEOUT = 5  # Reduced from 10 to aggressively prevent zombie locks
_execution_epoch_counter = 0

def is_docker_available() -> bool:
    if client is None:
        return False
    try:
        client.ping()
        return True
    except Exception:
        return False

def execute_code(language: str, code: str, allow_network: bool = False) -> str:
    """
    Execute code in an isolated, ephemeral Docker container.
    language: 'python', 'javascript'/'node', or 'playwright'
    allow_network: Set to True ONLY if web scraping is explicitly required.
    """
    global _execution_epoch_counter
    
    if not language or not code:
        return '[CODE ERROR]: Missing language or code parameter.'

    lang = language.lower().strip()
    if lang not in ['python', 'javascript', 'node', 'playwright']:
        return f'[CODE ERROR]: Unsupported language "{language}". Allowed: python, node/javascript, playwright.'

    if not is_docker_available():
        return '[DOCKER ERROR]: Docker daemon is unreachable. Execute code requires Docker.'

    if lang == 'playwright':
        image = 'mcr.microsoft.com/playwright/python:v1.40.0-jammy'
        runner = 'python'
    elif lang == 'python':
        image = 'python:3.9-slim'
        runner = 'python'
    else:
        image = 'node:18-alpine'
        runner = 'node'
    
    # Write code to a temporary file
    fd, temp_path = tempfile.mkstemp(suffix='.py' if runner == 'python' else '.js')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(code)

    network_setting = 'bridge' if allow_network else 'none'
    print(f"🐳 [CODE] Running in Docker container (network: {network_setting}, RAM: 512m)...", flush=True)

    try:
        # We mount the temp file as read-only and execute it
        # using the Docker SDK
        container = client.containers.run(
            image,
            command=[runner, f"/script{os.path.splitext(temp_path)[1]}"],
            volumes={temp_path: {'bind': f"/script{os.path.splitext(temp_path)[1]}", 'mode': 'ro'}},
            network_mode=network_setting,
            mem_limit='350m',  # Aggressively strictly bound to 350MB (down from 512) to respect 8GB total OS limit
            nano_cpus=int(0.5 * 1e9), # Restricted to 0.5 CPU to prevent host CPU starvation
            detach=True,
            remove=False
        )

        try:
            # Wait for container to finish or timeout
            status = container.wait(timeout=CODE_TIMEOUT)
            logs = container.logs().decode('utf-8')
            output = logs
            if status['StatusCode'] != 0:
                output = f"[EXECUTION ERROR (Exit {status['StatusCode']})]:\n{logs}"
        except docker.errors.ContainerError as e:
            output = f"[CONTAINER ERROR]: {e}"
        except Exception as e: # Catch wait timeout
            output = f"[TIMEOUT]: Execution exceeded {CODE_TIMEOUT} seconds."
            try:
                container.kill()
            except Exception:
                pass
        finally:
            try:
                # v=True ensures associated anonymous volumes are also scrubbed
                container.remove(force=True, v=True)
            except Exception:
                pass
    except Exception as e:
        output = f"[DOCKER EXECUTION ERROR]:\n{str(e)}"
    finally:
        try:
            os.remove(temp_path)
        except Exception:
            pass

    max_chars = 4000
    if output and len(output) > max_chars:
        output = output[:max_chars] + '\n...[OUTPUT TRUNCATED]'
        
    res = f"[CODE OUTPUT ({lang})]:\n{output or '(no output)'}"
    
    # 🧹 Periodic Docker Cleanup Routine (Every 5 Epochs)
    _execution_epoch_counter += 1
    if _execution_epoch_counter % 5 == 0:
        print(f"🧹 [OmniBot] Triggering Docker System Prune (Epoch {_execution_epoch_counter})...", flush=True)
        try:
            subprocess.run(['docker', 'system', 'prune', '-f', '--volumes'], timeout=60, capture_output=True)
            res += "\n\n[SYSTEM_PRUNE_EXECUTED]"
        except Exception as e:
            print(f"⚠️ [OmniBot] Docker Prune Failed: {e}", flush=True)
            
    return res

def run_in_sandbox(code: str, language: str, allow_network: bool = False) -> str:
    """Alias for execute_code ensuring isolated execution."""
    return execute_code(language, code, allow_network)

def execute_on_host(language: str, code: str, answers_received: bool) -> str:
    """
    Execute code natively on the Host OS (No Sandbox). 
    Requires answers_received=True to ensure the Interrogation Protocol was followed.
    """
    if not answers_received:
        return "[HOST EXECUTION BLOCKED]: The Interrogation Protocol was not followed. You MUST ask the user 3 precise clarifying questions and WAIT for their answers before setting 'answers_received' to True."

    if not language or not code:
        return '[CODE ERROR]: Missing language or code parameter.'

    lang = language.lower().strip()
    if lang not in ['python', 'javascript', 'node', 'powershell']:
        return f'[CODE ERROR]: Unsupported language "{language}" for host execution. Allowed: python, javascript, node, powershell.'

    runner = 'python' if lang == 'python' else 'node' if lang in ['javascript', 'node'] else 'powershell'
    suffix = '.py' if lang == 'python' else '.js' if lang in ['javascript', 'node'] else '.ps1'

    fd, temp_path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(code)

    print(f"⚠️ [HOST EXECUTION] Running script natively on Host Machine ({lang})...", flush=True)

    try:
        command = [runner, temp_path]
        if runner == 'powershell':
            command = ["powershell", "-ExecutionPolicy", "Bypass", "-File", temp_path]

        process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=CODE_TIMEOUT
        )
        
        output = process.stdout
        if process.returncode != 0:
            output += f"\n[EXECUTION ERROR (Exit {process.returncode})]:\n{process.stderr}"

    except subprocess.TimeoutExpired:
        output = f"[TIMEOUT]: Native execution exceeded {CODE_TIMEOUT} seconds."
    except Exception as e:
        output = f"[HOST EXECUTION ERROR]:\n{str(e)}"
    finally:
        try:
            os.remove(temp_path)
        except Exception:
            pass

    max_chars = 4000
    if output and len(output) > max_chars:
        output = output[:max_chars] + '\n...[OUTPUT TRUNCATED]'
        
    return f"[HOST OUTPUT ({lang})]:\n{output or '(no output)'}"

