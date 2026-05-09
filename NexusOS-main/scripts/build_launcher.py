import os
import subprocess
import sys
import getpass
import pymongo
import keyring
from cryptography.fernet import Fernet
import base64
import urllib.request
import shutil
import glob
import time

# ANSI Colors for Terminal UI
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def get_or_create_key():
    """Utilizes system keyring to store/retrieve the master encryption key."""
    service_id = "NexusOS_Builder"
    key_id = "MasterEncryptionKey"
    
    stored_key = keyring.get_password(service_id, key_id)
    if not stored_key:
        # Generate a new Fernet key if none exists
        new_key = Fernet.generate_key().decode()
        keyring.set_password(service_id, key_id, new_key)
        return new_key.encode()
    return stored_key.encode()

def encrypt_token(token):
    key = get_or_create_key()
    f = Fernet(key)
    return f.encrypt(token.encode()).decode()

def decrypt_token(encrypted_token):
    key = get_or_create_key()
    f = Fernet(key)
    return f.decrypt(encrypted_token.encode()).decode()

def manage_github_token():
    print_step("Secure Token Management: Phase 24.1")
    
    try:
        # Standard local MongoDB connection
        client = pymongo.MongoClient("mongodb://localhost:27017/", serverSelectionTimeoutMS=2000)
        db = client["NexusOS"]
        collection = db["local_secrets"]
        
        # Check if DB is alive
        client.server_info()
        
        secret_doc = collection.find_one({"key_name": "github_pat"})
        
        if secret_doc:
            encrypted_val = secret_doc.get("value")
            try:
                decrypted_token = decrypt_token(encrypted_val)
                print(f"{Colors.OKBLUE}Found a securely stored GitHub PAT.{Colors.ENDC}")
                use_saved = input(f"{Colors.BOLD}Do you want to use the saved token? (Y/n): {Colors.ENDC}").strip().lower()
                
                if use_saved in ['y', 'yes', '']:
                    print(f"{Colors.OKGREEN}Retrieving token from vault...{Colors.ENDC}")
                    return decrypted_token
            except Exception:
                print(f"{Colors.FAIL}Stored token decryption failed or is corrupted.{Colors.ENDC}")
        
        # If no token or user opted out
        print(f"\n{Colors.WARNING}Please enter a new GitHub Personal Access Token (PAT).{Colors.ENDC}")
        raw_token = getpass.getpass("PAT (Input Hidden): ").strip()
        
        if not raw_token:
            print(f"{Colors.FAIL}Error: Token is required for publishing.{Colors.ENDC}")
            sys.exit(1)
            
        # Securing the new token
        print(f"{Colors.OKCYAN}Applying Fernet encryption & committing to local MongoDB vault...{Colors.ENDC}")
        enc_token = encrypt_token(raw_token)
        collection.update_one(
            {"key_name": "github_pat"},
            {"$set": {"key_name": "github_pat", "value": enc_token, "updated_at": "now"}},
            upsert=True
        )
        print(f"{Colors.OKGREEN}Token persistent and secured.{Colors.ENDC}")
        return raw_token

    except Exception as e:
        print(f"{Colors.WARNING}Local MongoDB not detected or pymongo error: {e}{Colors.ENDC}")
        print(f"{Colors.WARNING}Falling back to memory-only token mode.{Colors.ENDC}")
        return getpass.getpass("PAT (Input Hidden): ").strip()

def ensure_assets():
    """Checks for build assets and downloads them if missing."""
    print_step("Infrastructure Asset Audit...")
    workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    build_dir = os.path.join(workspace_root, 'build')
    icon_path = os.path.join(build_dir, 'icon.ico')
    
    if not os.path.exists(build_dir):
        print(f"{Colors.WARNING}Creating missing 'build' directory...{Colors.ENDC}")
        os.makedirs(build_dir)
        
    if not os.path.exists(icon_path):
        print(f"{Colors.WARNING}icon.ico not found. Fetching official placeholder...{Colors.ENDC}")
        icon_url = "https://github.com/electron-userland/electron-builder/raw/master/packages/app-builder-lib/templates/icons/icon.ico"
        try:
            urllib.request.urlretrieve(icon_url, icon_path)
            print(f"{Colors.OKGREEN}Icon retrieved successfully.{Colors.ENDC}")
        except Exception as e:
            print(f"{Colors.FAIL}Failed to download icon: {e}{Colors.ENDC}")

def print_step(title):
    print(f"\n{Colors.OKCYAN}{Colors.BOLD}>>> {title}{Colors.ENDC}")

def kill_processes_and_ports():
    print_step("Aggressive Port & Process Cleanup...")
    
    # Nuclear Extermination: Force closure of any potential blockers
    os.system("taskkill /f /im electron.exe /t >nul 2>&1")
    os.system("taskkill /f /im NexusOS-Portable.exe /t >nul 2>&1")
    os.system("taskkill /f /im NexusOS.exe /t >nul 2>&1")
    
    # Exclude Aegis Overlord from node.exe cleanup
    os.system("wmic process where \"name='node.exe' and not commandline like '%aegis-overlord.js%'\" Call Terminate >nul 2>&1")
    
    # Phase 31: Global Cache Annihilation (Fixes icu_util.cc errors)
    local_appdata = os.environ.get('LOCALAPPDATA')
    if local_appdata:
        global_caches = [
            os.path.join(local_appdata, "electron", "Cache"),
            os.path.join(local_appdata, "electron-builder", "Cache")
        ]
        for cache in global_caches:
            if os.path.exists(cache):
                print(f"{Colors.WARNING}Wiping global cache: {cache}{Colors.ENDC}")
                shutil.rmtree(cache, ignore_errors=True)
        print(f"{Colors.OKGREEN}[NexusOS] Global Electron & Builder caches wiped.{Colors.ENDC}")
    
    print(f"{Colors.OKGREEN}System clean. Ready for compilation.{Colors.ENDC}")

def launch_and_suicide(exe_path):
    print(f"\n{Colors.OKGREEN}{Colors.BOLD}Build successful! Auto-Launching {os.path.basename(exe_path)}...{Colors.ENDC}")
    
    # Detach the process from the current console to prevent tethering
    CREATE_NEW_PROCESS_GROUP = 0x00000200
    DETACHED_PROCESS = 0x00000008
    subprocess.Popen([exe_path], creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
    
    print(f"{Colors.WARNING}Executing Terminal Self-Destruct...{Colors.ENDC}")
    sys.exit(0)

def main():
    # Enable ANSI escape sequences on Windows CMD
    os.system('color') 
    
    print(f"{Colors.HEADER}{Colors.BOLD}========================================={Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}      NEXUS OS SECURE BUILD PIPELINE     {Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}========================================={Colors.ENDC}\n")
    
    print(f"{Colors.OKCYAN}Select Build Mode:{Colors.ENDC}")
    print(f"  [{Colors.BOLD}1{Colors.ENDC}] Build Local Only (No GitHub Upload)")
    print(f"  [{Colors.BOLD}2{Colors.ENDC}] Build and Publish to GitHub")
    
    print("\nWaiting for user input...")
    choice = input(f"{Colors.BOLD}Mode (1/2): {Colors.ENDC}").strip()
    
    while choice not in ['1', '2']:
        choice = input(f"{Colors.FAIL}Invalid choice. Mode (1/2): {Colors.ENDC}").strip()
        
    gh_token = None
    if choice == '2':
        gh_token = manage_github_token()
            
    # Execute Asset Check
    ensure_assets()
            
    # Execute Pre-Flight Cleanup
    kill_processes_and_ports()
    
    workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    
    print_step("Aggressive Folder & Cache Annihilation...")
    workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    
    cleanup_dirs = [
        os.path.join(workspace_root, 'dist-build'),
        os.path.join(workspace_root, 'src', 'renderer', 'dist'),
        os.path.join(workspace_root, 'src', 'python-daemons', 'build'),
        os.path.join(workspace_root, 'src', 'python-daemons', 'dist')
    ]
    
    for d in cleanup_dirs:
        if os.path.exists(d):
            print(f"{Colors.WARNING}Wiping directory: {d}{Colors.ENDC}")
            shutil.rmtree(d, ignore_errors=True)
            
    # Cleanup Spec files
    for root, dirs, files in os.walk(workspace_root):
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        if '.git' in dirs:
            dirs.remove('.git')
            
        for file in files:
            if file.endswith('.spec'):
                spec_path = os.path.join(root, file)
                print(f"{Colors.WARNING}Removing legacy build spec: {spec_path}{Colors.ENDC}")
                try:
                    os.remove(spec_path)
                except:
                    pass
        
    print_step("Compiling NexusOS Executable Payload...")
    
    # Prepare secure environment variables
    env = os.environ.copy()
    if gh_token:
        env['GH_TOKEN'] = gh_token
        
    cmd = "npm run publish-release" if choice == '2' else "npm run build"
    try:
        subprocess.run(cmd, shell=True, check=True, cwd=workspace_root, env=env)
    except subprocess.CalledProcessError:
        print(f"\n{Colors.FAIL}{Colors.BOLD}CRITICAL ERROR: Build process abandoned.{Colors.ENDC}")
        input("Press Enter to exit...")
        sys.exit(1)
        
    dist_build = os.path.join(workspace_root, 'dist-build')
    print_step("Scanning for Compiled Binaries...")
    exe_path = None
    if os.path.exists(dist_build):
        # 1. Auto-Launch MSI if found
        msi_files = glob.glob(os.path.join(dist_build, "*.msi"))
        if msi_files:
            print(f"{Colors.OKGREEN}[NexusOS] Found MSI Installer: {os.path.basename(msi_files[0])}{Colors.ENDC}")
            print(f"{Colors.OKCYAN}[NexusOS] Launching MSI Installer automatically...{Colors.ENDC}")
            os.startfile(msi_files[0])
            
        # 2. Find Executable for Auto-Launch
        for file in os.listdir(dist_build):
            if file.endswith('.exe') and 'Setup' not in file:
                exe_path = os.path.join(dist_build, file)
                break
                
    if exe_path:
        print(f"\n{Colors.OKGREEN}{Colors.BOLD}Build process completed successfully!{Colors.ENDC}")
        print(f"{Colors.OKBLUE}The console will automatically close in 5 minutes (300 seconds)...{Colors.ENDC}")
        
        # Launch the app detached before starting the countdown
        print(f"{Colors.OKCYAN}Launching {os.path.basename(exe_path)} in background...{Colors.ENDC}")
        CREATE_NEW_PROCESS_GROUP = 0x00000200
        DETACHED_PROCESS = 0x00000008
        subprocess.Popen([exe_path], creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
        
        time.sleep(300)
        sys.exit(0)
    else:
        print(f"{Colors.FAIL}Verification Failed: No executable found in dist-build.{Colors.ENDC}")
        input("Press Enter to exit...")
        sys.exit(1)

if __name__ == "__main__":
    main()
