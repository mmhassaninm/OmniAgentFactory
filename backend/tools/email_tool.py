"""
Email tool with two modes:
1. Legacy sync send (existing `execute` / `dispatch_email` interface — preserved)
2. Async draft/approve flow for the Money Agent (human approves before sending)
"""
import imaplib
import logging
import os
import smtplib
import uuid
from datetime import datetime
from email.message import EmailMessage

logger = logging.getLogger(__name__)

# ── Draft store ──────────────────────────────────────────────────────────────
# pitch_id → draft dict; cleared once sent or skipped
_drafts: dict[str, dict] = {}


# ── Legacy interface (unchanged) ─────────────────────────────────────────────

class EmailTool:
    def execute(self, action: str, to: str = None, subject: str = None, body: str = None, limit: int = 5) -> str:
        user = os.environ.get("EMAIL_USER") or os.environ.get("GMAIL_ADDRESS")
        pw   = os.environ.get("EMAIL_PASS") or os.environ.get("GMAIL_APP_PASSWORD")
        host = os.environ.get("EMAIL_SMTP_HOST", "smtp.gmail.com")
        port = int(os.environ.get("EMAIL_SMTP_PORT", 465))

        if not user or not pw:
            return "Zero-Trust Error: Email credentials (EMAIL_USER/GMAIL_ADDRESS, EMAIL_PASS/GMAIL_APP_PASSWORD) not configured."

        try:
            if action == "send":
                msg = EmailMessage()
                msg.set_content(body)
                msg["Subject"] = subject
                msg["From"] = user
                msg["To"] = to
                with smtplib.SMTP_SSL(host, port) as server:
                    server.login(user, pw)
                    server.send_message(msg)
                return f"Email successfully sent to {to}."
            elif action == "read":
                return "IMAP Reading not fully implemented in python port yet. Please check back later."
            else:
                return f"Unsupported Email action: {action}"
        except Exception as e:
            logger.error("EmailTool.execute failed: %s", e)
            return f"Error: {str(e)}"


_email_tool = EmailTool()


def dispatch_email(kwargs: dict) -> str:
    return _email_tool.execute(**kwargs)


# ── Async draft/approve flow (Money Agent) ───────────────────────────────────

async def draft_email(to: str, subject: str, body: str, pitch_id: str | None = None) -> dict:
    """
    Stage an email for human approval. Does NOT send automatically.
    Returns the draft record with status PENDING_HUMAN.
    """
    draft_id = pitch_id or str(uuid.uuid4())[:8]
    draft = {
        "id": draft_id,
        "to": to,
        "subject": subject,
        "body": body,
        "status": "PENDING_HUMAN",
        "created_at": datetime.now().isoformat(),
    }
    _drafts[draft_id] = draft
    logger.info("[EmailTool] Draft %s staged for %s", draft_id, to)
    return draft


async def send_approved_email(draft_id: str) -> bool:
    """Send a previously staged draft. Called after human approves."""
    draft = _drafts.get(draft_id)
    if not draft:
        logger.warning("[EmailTool] Draft %s not found", draft_id)
        return False
    if draft["status"] == "SENT":
        return True

    user = os.environ.get("GMAIL_ADDRESS") or os.environ.get("EMAIL_USER")
    pw   = os.environ.get("GMAIL_APP_PASSWORD") or os.environ.get("EMAIL_PASS")
    if not user or not pw:
        logger.error("[EmailTool] Gmail credentials not configured — cannot send draft %s", draft_id)
        return False

    try:
        msg = EmailMessage()
        msg.set_content(draft["body"])
        msg["Subject"] = draft["subject"]
        msg["From"] = user
        msg["To"] = draft["to"]
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(user, pw)
            server.send_message(msg)
        _drafts[draft_id]["status"] = "SENT"
        _drafts[draft_id]["sent_at"] = datetime.now().isoformat()
        logger.info("[EmailTool] Draft %s sent to %s", draft_id, draft["to"])
        return True
    except Exception as e:
        logger.error("[EmailTool] Failed to send draft %s: %s", draft_id, e)
        return False


def skip_draft(draft_id: str) -> bool:
    """Mark a draft as skipped (human declined)."""
    if draft_id in _drafts:
        _drafts[draft_id]["status"] = "SKIPPED"
        return True
    return False


def get_pending_drafts() -> list[dict]:
    """Return all drafts awaiting human approval."""
    return [d for d in _drafts.values() if d["status"] == "PENDING_HUMAN"]


def get_all_drafts() -> list[dict]:
    return list(_drafts.values())


async def watch_for_replies(max_results: int = 10) -> list[dict]:
    """
    Check Gmail inbox for unread messages via IMAP.
    Returns list of {from, subject, snippet, date} dicts.
    """
    user = os.environ.get("GMAIL_ADDRESS")
    pw   = os.environ.get("GMAIL_APP_PASSWORD")
    if not user or not pw:
        return []

    replies = []
    try:
        with imaplib.IMAP4_SSL("imap.gmail.com") as mail:
            mail.login(user, pw)
            mail.select("INBOX")
            _, data = mail.search(None, "UNSEEN")
            ids = data[0].split()[-max_results:]
            for msg_id in ids:
                _, msg_data = mail.fetch(msg_id, "(RFC822)")
                import email as emaillib
                msg = emaillib.message_from_bytes(msg_data[0][1])
                replies.append({
                    "from": msg.get("From", ""),
                    "subject": msg.get("Subject", ""),
                    "date": msg.get("Date", ""),
                    "snippet": _extract_snippet(msg),
                })
    except Exception as e:
        logger.error("[EmailTool] IMAP watch_for_replies failed: %s", e)

    return replies


def _extract_snippet(msg) -> str:
    """Extract plain-text preview from email message."""
    try:
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    return part.get_payload(decode=True).decode("utf-8", errors="ignore")[:300]
        else:
            return msg.get_payload(decode=True).decode("utf-8", errors="ignore")[:300]
    except Exception:
        pass
    return ""
