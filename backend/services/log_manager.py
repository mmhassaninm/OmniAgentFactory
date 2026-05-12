import os
import json
import uuid
import logging
import threading
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

class LogManager:
    """
    Centralized, thread-safe manager for structured logging sessions.
    Enforces atomic file updates and indexes active/completed sessions.
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(LogManager, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
        
        # Determine root and logs folder
        self.root_dir = "/project" if os.path.exists("/project") else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        self.logs_dir = os.path.join(self.root_dir, "logs")
        self.sessions_dir = os.path.join(self.logs_dir, "sessions")
        self.archive_dir = os.path.join(self.logs_dir, "archive")
        self.index_path = os.path.join(self.logs_dir, "INDEX.json")
        
        # Ensure directories exist
        os.makedirs(self.sessions_dir, exist_ok=True)
        os.makedirs(self.archive_dir, exist_ok=True)
        
        # Active sessions cache: session_id -> absolute file path
        self._active_sessions: Dict[str, str] = {}
        
        self._initialize_index()
        self._initialized = True

    def _initialize_index(self):
        """Initializes INDEX.json with baseline schema if it does not exist."""
        with self._lock:
            if not os.path.exists(self.index_path):
                index_data = {
                    "total_sessions": 0,
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                    "sessions": []
                }
                self._write_file_atomic(self.index_path, index_data)

    def _read_index(self) -> dict:
        """Reads INDEX.json helper."""
        try:
            if os.path.exists(self.index_path):
                with open(self.index_path, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            logger.error("Failed to read INDEX.json: %s", e)
        return {"total_sessions": 0, "last_updated": "", "sessions": []}

    def _write_file_atomic(self, file_path: str, data: Any):
        """Writes dictionary to file atomically using temp file and rename."""
        temp_path = file_path + ".tmp"
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            os.replace(temp_path, file_path)
        except Exception as e:
            logger.error("Atomic write failed for %s: %s", file_path, e)
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
            raise

    def _get_session_path(self, session_id: str) -> str:
        """Resolves absolute path for a session id, checking memory and INDEX."""
        if session_id in self._active_sessions:
            return self._active_sessions[session_id]
        
        index_data = self._read_index()
        for s in index_data.get("sessions", []):
            if s.get("session_id") == session_id:
                # Check normal sessions directory
                normal_path = os.path.join(self.logs_dir, s["file"])
                if os.path.exists(normal_path):
                    return normal_path
                # Check archive directory
                archive_filename = os.path.basename(s["file"])
                archive_path = os.path.join(self.archive_dir, archive_filename)
                if os.path.exists(archive_path):
                    return archive_path
                    
        raise FileNotFoundError(f"Logging session file not found for session ID: {session_id}")

    def start_session(self, agent_name: str, tags: list) -> str:
        """Creates session file, adds to INDEX.json, returns session_id."""
        session_id = str(uuid.uuid4())
        short_id = session_id[:8]
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"session_{timestamp_str}_{short_id}.json"
        
        file_path = os.path.join(self.sessions_dir, filename)
        relative_path = os.path.join("sessions", filename).replace("\\", "/")
        
        started_at = datetime.now(timezone.utc).isoformat()
        
        session_data = {
            "session_id": session_id,
            "started_at": started_at,
            "ended_at": None,
            "status": "active",
            "agent": agent_name,
            "summary": "",
            "tags": tags,
            "events": [],
            "errors": [],
            "metrics": {
                "total_events": 0,
                "total_errors": 0,
                "duration_seconds": 0
            }
        }
        
        with self._lock:
            # Save session file
            self._write_file_atomic(file_path, session_data)
            self._active_sessions[session_id] = file_path
            
            # Update INDEX.json
            index_data = self._read_index()
            index_entry = {
                "session_id": session_id,
                "file": relative_path,
                "agent": agent_name,
                "started_at": started_at,
                "ended_at": None,
                "status": "active",
                "summary": "",
                "tags": tags
            }
            index_data["sessions"].append(index_entry)
            index_data["total_sessions"] = len(index_data["sessions"])
            index_data["last_updated"] = started_at
            
            self._write_file_atomic(self.index_path, index_data)
            
        logger.info("Started logging session %s for agent: %s", session_id, agent_name)
        return session_id

    def log(self, session_id: str, level: str, type_str: str, message: str, details: Optional[dict] = None):
        """Appends event to the session file."""
        try:
            file_path = self._get_session_path(session_id)
        except Exception as e:
            logger.error("Failed to log because session path was not found: %s", e)
            return

        with self._lock:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    session_data = json.load(f)
            except Exception as e:
                logger.error("Failed to load session file %s for logging: %s", file_path, e)
                return
            
            event = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": level.upper(),
                "type": type_str.upper(),
                "message": message,
                "details": details or {}
            }
            
            session_data["events"].append(event)
            session_data["metrics"]["total_events"] += 1
            
            if level.upper() in ("ERROR", "CRITICAL"):
                session_data["errors"].append(message)
                session_data["metrics"]["total_errors"] += 1
                
            self._write_file_atomic(file_path, session_data)

    def end_session(self, session_id: str, status: str = "completed"):
        """Sets ended_at, calculates duration, writes summary, updates INDEX."""
        try:
            file_path = self._get_session_path(session_id)
        except Exception as e:
            logger.error("Failed to end session path: %s", e)
            return

        ended_at_dt = datetime.now(timezone.utc)
        ended_at = ended_at_dt.isoformat()
        
        with self._lock:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    session_data = json.load(f)
            except Exception as e:
                logger.error("Failed to load session file %s to end it: %s", file_path, e)
                return
            
            # Duration calculation
            started_at_dt = datetime.fromisoformat(session_data["started_at"])
            duration = (ended_at_dt - started_at_dt).total_seconds()
            
            # Auto-generated summary
            num_events = session_data["metrics"]["total_events"]
            num_errors = session_data["metrics"]["total_errors"]
            summary = f"Agent {session_data['agent']} finished in state '{status}' after {num_events} events with {num_errors} errors."
            
            session_data["ended_at"] = ended_at
            session_data["status"] = status
            session_data["summary"] = summary
            session_data["metrics"]["duration_seconds"] = int(duration)
            
            self._write_file_atomic(file_path, session_data)
            
            # Update INDEX.json
            index_data = self._read_index()
            for s in index_data.get("sessions", []):
                if s.get("session_id") == session_id:
                    s["ended_at"] = ended_at
                    s["status"] = status
                    s["summary"] = summary
                    
            index_data["last_updated"] = ended_at
            self._write_file_atomic(self.index_path, index_data)
            
            # Evict from active cache
            self._active_sessions.pop(session_id, None)
            
        logger.info("Ended logging session %s with status: %s", session_id, status)

    def get_session(self, session_id: str) -> dict:
        """Returns the full session dictionary."""
        file_path = self._get_session_path(session_id)
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def list_sessions(self, limit: int = 50, agent: Optional[str] = None, status: Optional[str] = None) -> List[dict]:
        """Lists sessions from INDEX.json matching optional filters (newest first)."""
        index_data = self._read_index()
        sessions = index_data.get("sessions", [])
        
        filtered = []
        for s in sessions:
            if agent and s.get("agent") != agent:
                continue
            if status and s.get("status") != status:
                continue
            filtered.append(s)
            
        # Newest sessions first
        filtered.reverse()
        return filtered[:limit]

    def search_sessions(self, keyword: str) -> List[dict]:
        """Search sessions by keyword in agent name, status, tags, or summary."""
        index_data = self._read_index()
        sessions = index_data.get("sessions", [])
        
        keyword_lower = keyword.lower()
        results = []
        for s in sessions:
            agent_match = keyword_lower in s.get("agent", "").lower()
            status_match = keyword_lower in s.get("status", "").lower()
            summary_match = keyword_lower in s.get("summary", "").lower()
            tags_match = any(keyword_lower in t.lower() for t in s.get("tags", []))
            
            if agent_match or status_match or summary_match or tags_match:
                results.append(s)
                
        results.reverse()
        return results

    def archive_old_sessions(self, days: int = 30) -> int:
        """
        Scan all completed/failed/interrupted session files in sessions/
        and move files older than 30 days to archive/. Update INDEX.json.
        """
        logger.info("Starting log sessions archiving task (days threshold: %d)", days)
        index_data = self._read_index()
        sessions = index_data.get("sessions", [])
        
        now = datetime.now(timezone.utc)
        archived_count = 0
        
        # Read the list of files in sessions/
        try:
            sessions_files = os.listdir(self.sessions_dir)
        except Exception as e:
            logger.error("Failed to list sessions directory: %s", e)
            return 0
            
        updated_sessions = []
        with self._lock:
            for s in sessions:
                session_id = s.get("session_id")
                relative_file_path = s.get("file", "")
                
                # Check if it is already in the archive folder
                if relative_file_path.startswith("archive/"):
                    updated_sessions.append(s)
                    continue
                
                # Only archive sessions that are NOT active
                if s.get("status") == "active":
                    updated_sessions.append(s)
                    continue
                    
                # Parse start date or file modified date
                started_at_str = s.get("started_at")
                try:
                    # Clean up trailing Z or timezone formatting
                    if started_at_str.endswith("Z"):
                        started_dt = datetime.fromisoformat(started_at_str[:-1]).replace(tzinfo=timezone.utc)
                    else:
                        started_dt = datetime.fromisoformat(started_at_str)
                except Exception:
                    started_dt = now
                    
                age_days = (now - started_dt).days
                if age_days >= days:
                    filename = os.path.basename(relative_file_path)
                    source_path = os.path.join(self.sessions_dir, filename)
                    dest_path = os.path.join(self.archive_dir, filename)
                    
                    if os.path.exists(source_path):
                        try:
                            # Move the file atomically
                            os.replace(source_path, dest_path)
                            s["file"] = f"archive/{filename}"
                            archived_count += 1
                            logger.info("Archived session file: %s", filename)
                        except Exception as e:
                            logger.error("Failed to move session file %s to archive: %s", filename, e)
                    else:
                        # File already moved or missing, update path anyway if it's supposed to be archived
                        s["file"] = f"archive/{filename}"
                        
                updated_sessions.append(s)
                
            if archived_count > 0:
                index_data["sessions"] = updated_sessions
                index_data["last_updated"] = datetime.now(timezone.utc).isoformat()
                try:
                    self._write_file_atomic(self.index_path, index_data)
                except Exception as e:
                    logger.error("Failed to update index after archiving: %s", e)
                    
        logger.info("Archived %d session logs successfully.", archived_count)
        return archived_count

# Singleton instance
log_manager = LogManager()
