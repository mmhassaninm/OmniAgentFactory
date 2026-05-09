from datetime import datetime


def get_datetime(timezone: str = "UTC") -> str:
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(timezone)
        now = datetime.now(tz)
        fmt = now.strftime('%Y-%m-%d %H:%M:%S %Z')
        day_name = now.strftime('%A')
        return f"Current date/time in {timezone}: {fmt} ({day_name})"
    except Exception:
        now = datetime.now()
        fmt = now.strftime('%Y-%m-%d %H:%M:%S UTC')
        day_name = now.strftime('%A')
        return f"Current date/time (UTC, requested '{timezone}' was invalid): {fmt} ({day_name})"
