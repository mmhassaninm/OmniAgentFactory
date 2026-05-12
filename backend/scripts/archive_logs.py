import os
import sys
import argparse

# Add backend and project root to path so imports work correctly
sys.path.append(os.getcwd())
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def main():
    print("=== [OmniBot] Log Sessions Manual Archiving Utility ===")
    
    parser = argparse.ArgumentParser(description="Archive old logging sessions manually.")
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Archive sessions older than this number of days (default: 30)."
    )
    args = parser.parse_args()
    
    try:
        from services.log_manager import log_manager
    except ImportError as e:
        print(f"❌ Error: Failed to import LogManager. Make sure to run this script from the backend directory. Detail: {e}")
        sys.exit(1)
        
    print(f"[*] Scanning for completed/failed/interrupted sessions older than {args.days} days...")
    try:
        count = log_manager.archive_old_sessions(days=args.days)
        print(f"✅ Success: Archived {count} logging session(s).")
    except Exception as e:
        print(f"❌ Error: Archiving failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
