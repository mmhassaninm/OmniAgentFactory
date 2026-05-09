import logging
import os
from datetime import datetime


def setup_session_logging() -> str:
    """
    Configure root logger with a per-session file handler.
    Creates logs/<YYYY-MM-DD_HH-MM-SS>.log automatically.
    Returns the path of the log file created.
    """
    logs_dir = os.path.join(os.path.dirname(__file__), "logs")
    os.makedirs(logs_dir, exist_ok=True)

    session_ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    log_path = os.path.join(logs_dir, f"{session_ts}.log")

    formatter = logging.Formatter(
        fmt="[%(asctime)s] %(levelname)-8s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.DEBUG)

    root = logging.getLogger()
    # Raise root level so DEBUG messages from our own code reach the file
    if root.level == logging.WARNING or root.level == 0:
        root.setLevel(logging.DEBUG)
    root.addHandler(file_handler)

    # Write the mandatory first line
    root.info("=== Session started: %s ===", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    root.info("Log file: %s", log_path)

    return log_path
