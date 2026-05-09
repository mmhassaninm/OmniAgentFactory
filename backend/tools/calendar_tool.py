import os
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class CalendarTool:
    def __init__(self):
        self.data_dir = Path("data/skills")
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.events_db_path = self.data_dir / "calendar.json"
        self.tasks_db_path = self.data_dir / "tasks.json"

    def _read_db(self, path):
        if not path.exists():
            return []
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write_db(self, path, data):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def execute(self, action: str, title: str = None, notes: str = None, when: str = None, deadline: str = None, list_name: str = None, id: str = None, limit: int = 20) -> str:
        try:
            if action == 'addTask':
                tasks = self._read_db(self.tasks_db_path)
                new_id = str(len(tasks) + 1)
                tasks.append({"id": new_id, "title": title, "notes": notes, "when": when, "deadline": deadline, "list": list_name, "status": "pending"})
                self._write_db(self.tasks_db_path, tasks)
                return f"Task '{title}' added with ID: {new_id}"
            elif action == 'listTasks':
                tasks = self._read_db(self.tasks_db_path)
                if list_name:
                    tasks = [t for t in tasks if t.get("list") == list_name]
                return json.dumps(tasks[:limit], indent=2)
            elif action == 'addEvent':
                events = self._read_db(self.events_db_path)
                new_id = str(len(events) + 1)
                events.append({"id": new_id, "title": title, "notes": notes, "when": when})
                self._write_db(self.events_db_path, events)
                return f"Event '{title}' scheduled for {when} (ID: {new_id})"
            elif action == 'listEvents':
                events = self._read_db(self.events_db_path)
                return json.dumps(events[:limit], indent=2)
            else:
                return f"Unsupported Calendar action: {action}"
        except Exception as e:
            logger.error(f"CalendarTool execution failed: {e}")
            return f"Error: {str(e)}"

_calendar_tool = CalendarTool()

def dispatch_calendar(kwargs: dict) -> str:
    return _calendar_tool.execute(**kwargs)
