"""
Omni Commander — Email Executor

Handles composing and dispatching emails over secure SMTP connection.
Loads Gmail address and App Password from system settings.
"""

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any

from core.config import get_settings


async def execute_email_action(params: Dict[str, Any]) -> Dict[str, Any]:
    """Send an email to a target recipient."""
    to_email = params.get("to", "")
    subject = params.get("subject", "Omni Commander Notification")
    body = params.get("body", "")
    
    if not to_email:
        return {"success": False, "error": "Recipient email address ('to') is missing."}
    if not body:
         return {"success": False, "error": "Email body message is empty."}
         
    settings = get_settings()
    gmail_address = settings.gmail_address
    gmail_password = settings.gmail_app_password
    
    if not gmail_address or not gmail_password:
        return {
            "success": False,
            "error": "Gmail address or App Password is not configured in settings. Go to Settings → General tab."
        }
        
    try:
        # Create message envelope
        msg = MIMEMultipart()
        msg["From"] = gmail_address
        msg["To"] = to_email
        msg["Subject"] = subject
        
        # Attach body
        msg.attach(MIMEText(body, "plain", "utf-8"))
        
        # Connect to secure Gmail SMTP
        smtp_host = "smtp.gmail.com"
        smtp_port = 587
        
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
        server.starttls() # Secure connection
        server.login(gmail_address, gmail_password)
        server.sendmail(gmail_address, to_email, msg.as_string())
        server.quit()
        
        return {
            "success": True,
            "message": f"Successfully sent email to {to_email}",
            "recipient": to_email,
            "subject": subject
        }
        
    except Exception as e:
        return {"success": False, "error": f"SMTP Dispatch Error: {str(e)}"}
