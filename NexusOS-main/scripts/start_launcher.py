import os
import subprocess
import time

def kill_processes_and_ports():
    print("Initiating nuclear cleanup...")
    
    # Kill stranded Node/Electron instances (excluding Aegis Overlord)
    for proc in ["electron.exe", "nexus-os.exe", "main.exe", "NexusOS.exe", "NexusOS-Portable.exe"]:
        try:
            subprocess.run(f"taskkill /F /IM {proc} /T", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
            
    try:
        subprocess.run('wmic process where "name=\'node.exe\' and not commandline like \'%aegis-overlord.js%\'" Call Terminate', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass
            
    # Force release Vite/React development ports just in case
    for port in [5173, 3000]:
        try:
            output = subprocess.check_output(f"netstat -aon | findstr :{port}", shell=True).decode()
            for line in output.strip().split('\n'):
                if 'LISTENING' in line:
                    parts = line.strip().split()
                    pid = parts[-1]
                    if pid and pid != '0':
                        subprocess.run(f"taskkill /F /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except subprocess.CalledProcessError:
            pass # Port wasn't in use

    print("Cleanup complete.")

def start_nexus():
    workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    dist_build = os.path.join(workspace_root, 'dist-build')
    
    exe_path = None
    if os.path.exists(dist_build):
        for file in os.listdir(dist_build):
            # Find the un-installer/setup excluded exe
            if file.endswith('.exe') and 'Setup' not in file:
                exe_path = os.path.join(dist_build, file)
                break
                
    if exe_path:
        print(f"Launching silent background process: {exe_path}")
        # Execute detached and entirely headless - No Console Window natively
        CREATE_NO_WINDOW = 0x08000000
        subprocess.Popen([exe_path], creationflags=CREATE_NO_WINDOW)
    else:
        print("NexusOS executable not found. Please build it first.")

if __name__ == "__main__":
    kill_processes_and_ports()
    time.sleep(1) # Give OS a moment to release handles to avoid EPERM file locking
    start_nexus()
