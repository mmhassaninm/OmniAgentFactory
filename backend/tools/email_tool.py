import os
import smtplib
from email.message import EmailMessage
import logging

logger = logging.getLogger(__name__)

class EmailTool:
    def execute(self, action: str, to: str = None, subject: str = None, body: str = None, limit: int = 5) -> str:
        user = os.environ.get("EMAIL_USER")
        pw = os.environ.get("EMAIL_PASS")
        host = os.environ.get("EMAIL_SMTP_HOST", "smtp.gmail.com")
        port = int(os.environ.get("EMAIL_SMTP_PORT", 465))
        
        if not user or not pw:
            return "Zero-Trust Error: Email credentials (EMAIL_USER, EMAIL_PASS) not configured."
        
        try:
            if action == 'send':
                msg = EmailMessage()
                msg.set_content(body)
                msg['Subject'] = subject
                msg['From'] = user
                msg['To'] = to
                
                with smtplib.SMTP_SSL(host, port) as server:
                    server.login(user, pw)
                    server.send_message(msg)
                    
                return f"Email successfully sent to {to}."
            elif action == 'read':
                return "IMAP Reading not fully implemented in python port yet. Please check back later."
            else:
                return f"Unsupported Email action: {action}"
        except Exception as e:
            logger.error(f"EmailTool execution failed: {e}")
            return f"Error: {str(e)}"

_email_tool = EmailTool()

def dispatch_email(kwargs: dict) -> str:
    return _email_tool.execute(**kwargs)
