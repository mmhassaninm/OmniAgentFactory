import logging
import os
import json
import traceback
from datetime import datetime


class JSONFormatter(logging.Formatter):
    """Formats log records as a single JSON line with rich metadata context."""
    def format(self, record: logging.LogRecord) -> str:
        timestamp = self.formatTime(record, "%Y-%m-%d %H:%M:%S")
        log_data = {
            "timestamp": timestamp,
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_data["exception"] = "".join(traceback.format_exception(*record.exc_info))
            
        # Support rich context logging fields from error_log.py or custom logging calls
        extra_fields = ["agent_id", "error_type", "traceback", "extra_info"]
        for field in extra_fields:
            if hasattr(record, field):
                val = getattr(record, field)
                if val is not None:
                    log_data[field] = val
                    
        return json.dumps(log_data, ensure_ascii=False)


def setup_session_logging() -> str:
    """
    Configure root logger with a per-session file handler.
    Creates logs/<YYYY-MM-DD_HH-MM-SS>.log and logs/<YYYY-MM-DD_HH-MM-SS>.json.log automatically.
    Returns the path of the plain text log file created.
    """
    logs_dir = os.path.join(os.path.dirname(__file__), "logs")
    os.makedirs(logs_dir, exist_ok=True)

    session_ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    log_path = os.path.join(logs_dir, f"{session_ts}.log")
    json_log_path = os.path.join(logs_dir, f"{session_ts}.json.log")

    formatter = logging.Formatter(
        fmt="[%(asctime)s] %(levelname)-8s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.DEBUG)

    json_handler = logging.FileHandler(json_log_path, encoding="utf-8")
    json_handler.setFormatter(JSONFormatter())
    json_handler.setLevel(logging.DEBUG)

    root = logging.getLogger()
    # Raise root level so DEBUG messages from our own code reach the file
    if root.level == logging.WARNING or root.level == 0:
        root.setLevel(logging.DEBUG)
    root.addHandler(file_handler)
    root.addHandler(json_handler)

    # Write the mandatory first line
    root.info("=== Session started: %s ===", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    root.info("Log file: %s", log_path)
    root.info("Structured JSON log file: %s", json_log_path)

    return log_path

