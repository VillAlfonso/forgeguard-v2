"""
Email sending utilities — verification emails via SMTP.

If SMTP is not configured, the verification link is printed to the server
console instead so the flow can still be tested locally without a mail server.
"""

import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from .config import (
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, FROM_EMAIL,
    API_URL, APP_NAME,
)

logger = logging.getLogger(__name__)


def _smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send an HTML email. Returns True if sent, False if SMTP isn't configured."""
    if not _smtp_configured():
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL or SMTP_USER
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
    return True


def _verification_html(link: str) -> str:
    return f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#07120b;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#07120b;padding:32px 0;">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
               style="background:#0c1a12;border:1px solid #173a25;border-radius:6px;padding:36px;">
          <tr><td align="center" style="padding-bottom:20px;">
            <h1 style="margin:0;color:#00ff66;letter-spacing:6px;font-size:26px;">{APP_NAME.upper()}</h1>
            <p style="margin:8px 0 0;color:#6dba85;font-size:11px;letter-spacing:3px;">
              [ CONFIRM YOUR EMAIL ]
            </p>
          </td></tr>
          <tr><td style="color:#cfe9d8;font-size:14px;line-height:1.6;padding:8px 0 24px;">
            Thanks for registering. To activate your account, confirm this email
            address by clicking the button below. This link expires in 24 hours.
          </td></tr>
          <tr><td align="center" style="padding-bottom:28px;">
            <a href="{link}"
               style="display:inline-block;background:#00ff66;color:#04140a;
                      text-decoration:none;font-weight:bold;font-size:14px;
                      padding:14px 32px;border-radius:4px;letter-spacing:1px;">
              CONFIRM EMAIL
            </a>
          </td></tr>
          <tr><td style="color:#5f8a6e;font-size:12px;line-height:1.6;border-top:1px solid #173a25;padding-top:18px;">
            If the button doesn't work, paste this link into your browser:<br>
            <span style="color:#86efac;word-break:break-all;">{link}</span>
          </td></tr>
          <tr><td style="color:#3f6e4a;font-size:11px;padding-top:20px;">
            If you didn't create a {APP_NAME} account, you can safely ignore this email.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""


def send_verification_email(to_email: str, token: str) -> None:
    """Send (or print, if SMTP unconfigured) the email verification link."""
    link = f"{API_URL}/api/auth/verify-email?token={token}"
    subject = f"Confirm your {APP_NAME} account"
    try:
        sent = send_email(to_email, subject, _verification_html(link))
    except Exception as e:
        logger.warning(f"Verification email to {to_email} failed: {e}")
        sent = False

    if not sent:
        # Dev fallback so the flow is testable without a mail server.
        print(f"[VERIFY EMAIL] SMTP unavailable — link for {to_email}:\n  {link}")
