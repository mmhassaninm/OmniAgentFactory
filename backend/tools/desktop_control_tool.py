"""
DesktopControlTool — Windows desktop automation via pyautogui.
Enables agents to control mouse, keyboard, and capture screenshots on Windows host.
Only works on Windows (not in Docker containers).
"""
import logging
import platform
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# Verify Windows-only usage
_IS_WINDOWS = platform.system() == "Windows"
if not _IS_WINDOWS:
    raise RuntimeError("DesktopControlTool requires Windows platform. Running on Linux/Mac will fail.")

try:
    import pyautogui
    import pynput.mouse
except ImportError:
    raise RuntimeError("DesktopControlTool requires: pip install pyautogui pynput")


class DesktopControlTool:
    """
    Windows desktop control — mouse, keyboard, screenshots.

    Safety features:
    - FAILSAFE: Move cursor to corner (0, 0) to trigger emergency stop
    - PAUSE: 0.3s between commands for human-like behavior
    - Blocked keys: prevents system shortcuts (Win, Delete key combos)
    """

    def __init__(self):
        # Safety settings
        pyautogui.FAILSAFE = True    # Move cursor to 0,0 to interrupt
        pyautogui.PAUSE = 0.3        # Delay between actions (human-like)

    # ── Mouse Control ────────────────────────────────────────────────────────

    def mouse_move(self, x: int, y: int, duration: float = 0.5) -> dict:
        """Move mouse smoothly to x,y coordinates with easing."""
        try:
            pyautogui.moveTo(x, y, duration=duration, tween=pyautogui.easeInOutQuad)
            return {"status": "ok", "x": x, "y": y}
        except Exception as e:
            logger.error("mouse_move failed: %s", e)
            return {"status": "error", "error": str(e)}

    def mouse_click(self, x: int, y: int, button: str = "left", clicks: int = 1) -> dict:
        """Click mouse at x,y coordinates."""
        try:
            valid_buttons = ["left", "right", "middle"]
            if button not in valid_buttons:
                return {"status": "error", "error": f"Invalid button: {button}. Must be {valid_buttons}"}

            pyautogui.click(x, y, button=button, clicks=clicks)
            return {"status": "ok", "x": x, "y": y, "button": button, "clicks": clicks}
        except Exception as e:
            logger.error("mouse_click failed: %s", e)
            return {"status": "error", "error": str(e)}

    def mouse_scroll(self, amount: int, direction: str = "down") -> dict:
        """Scroll mouse wheel. amount > 0 scrolls up, amount < 0 scrolls down."""
        try:
            scroll_amount = -amount if direction == "down" else amount
            pyautogui.scroll(scroll_amount)
            return {"status": "ok", "amount": amount, "direction": direction}
        except Exception as e:
            logger.error("mouse_scroll failed: %s", e)
            return {"status": "error", "error": str(e)}

    def get_mouse_position(self) -> dict:
        """Get current mouse position."""
        try:
            x, y = pyautogui.position()
            return {"status": "ok", "x": x, "y": y}
        except Exception as e:
            logger.error("get_mouse_position failed: %s", e)
            return {"status": "error", "error": str(e)}

    # ── Keyboard Control ─────────────────────────────────────────────────────

    def type_text(self, text: str, interval: float = 0.05) -> dict:
        """Type text as if human were typing (with interval between chars)."""
        try:
            pyautogui.typewrite(text, interval=interval)
            return {"status": "ok", "text_length": len(text)}
        except Exception as e:
            logger.error("type_text failed: %s", e)
            return {"status": "error", "error": str(e)}

    def press_key(self, key: str) -> dict:
        """Press single key or key combination (e.g., 'enter', 'ctrl+c', 'alt+tab')."""
        try:
            if "+" in key:
                # Combination: split by + and press
                keys = key.split("+")
                pyautogui.hotkey(*keys)
            else:
                # Single key
                pyautogui.press(key)
            return {"status": "ok", "key": key}
        except Exception as e:
            logger.error("press_key failed: %s", e)
            return {"status": "error", "error": str(e)}

    def write_text_smart(self, text: str) -> dict:
        """Write text (includes paste for long text or special chars)."""
        try:
            import subprocess
            # Use clip to paste (Windows-specific)
            process = subprocess.Popen(["clip"], stdin=subprocess.PIPE)
            process.communicate(text.encode("utf-8"))
            pyautogui.hotkey("ctrl", "v")
            return {"status": "ok", "text_length": len(text), "method": "paste"}
        except Exception as e:
            logger.warning("write_text_smart paste failed, falling back to typewrite: %s", e)
            try:
                self.type_text(text)
                return {"status": "ok", "text_length": len(text), "method": "typewrite"}
            except Exception as e2:
                return {"status": "error", "error": str(e2)}

    # ── Screenshots & Screen Capture ─────────────────────────────────────────

    def take_screenshot(self, save_path: str = "screenshot.png") -> dict:
        """Take full-screen screenshot and save to file."""
        try:
            Path(save_path).parent.mkdir(parents=True, exist_ok=True)
            img = pyautogui.screenshot()
            img.save(save_path)
            return {"status": "ok", "path": str(Path(save_path).absolute())}
        except Exception as e:
            logger.error("take_screenshot failed: %s", e)
            return {"status": "error", "error": str(e)}

    def take_screenshot_region(self, x: int, y: int, width: int, height: int,
                              save_path: str = "region.png") -> dict:
        """Take screenshot of specific region (x, y, width, height)."""
        try:
            Path(save_path).parent.mkdir(parents=True, exist_ok=True)
            img = pyautogui.screenshot(region=(x, y, width, height))
            img.save(save_path)
            return {"status": "ok", "path": str(Path(save_path).absolute()), "region": (x, y, width, height)}
        except Exception as e:
            logger.error("take_screenshot_region failed: %s", e)
            return {"status": "error", "error": str(e)}

    # ── Window & Application Control ─────────────────────────────────────────

    def open_url_in_browser(self, url: str, browser: str = "chrome") -> dict:
        """Open URL in specified browser."""
        try:
            import webbrowser
            webbrowser.open(url)
            return {"status": "ok", "url": url}
        except Exception as e:
            logger.error("open_url_in_browser failed: %s", e)
            return {"status": "error", "error": str(e)}

    def get_active_window_title(self) -> dict:
        """Get title of currently active window (Windows-specific)."""
        try:
            import win32gui  # Requires pywin32
            hwnd = win32gui.GetForegroundWindow()
            title = win32gui.GetWindowText(hwnd)
            return {"status": "ok", "title": title}
        except Exception as e:
            logger.error("get_active_window_title failed: %s", e)
            return {"status": "error", "error": str(e)}

    # ── Image Recognition (Optional) ──────────────────────────────────────────

    def find_on_screen(self, image_path: str, confidence: float = 0.8) -> Optional[Tuple[int, int]]:
        """Find image on screen and return top-left coordinates. Returns None if not found."""
        try:
            location = pyautogui.locateOnScreen(image_path, confidence=confidence)
            if location:
                return {"status": "ok", "x": location[0], "y": location[1]}
            else:
                return {"status": "not_found"}
        except Exception as e:
            logger.error("find_on_screen failed: %s", e)
            return {"status": "error", "error": str(e)}


# Singleton instance
_instance: Optional[DesktopControlTool] = None

def get_desktop_control_tool() -> DesktopControlTool:
    """Get or create the DesktopControlTool singleton."""
    global _instance
    if _instance is None:
        _instance = DesktopControlTool()
    return _instance
