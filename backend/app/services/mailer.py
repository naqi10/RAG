import smtplib
from email.message import EmailMessage
import httpx

from ..utils.config import (
    BREVO_API_KEY,
    BREVO_SENDER_NAME,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_FROM_EMAIL,
    SMTP_USE_TLS,
)
from ..utils.logger import logger


def is_mail_configured() -> bool:
    brevo_ready = bool(BREVO_API_KEY and SMTP_FROM_EMAIL)
    smtp_ready = bool(SMTP_HOST and SMTP_PORT and SMTP_USER and SMTP_PASSWORD and SMTP_FROM_EMAIL)
    return brevo_ready or smtp_ready


def _send_via_brevo(to_email: str, subject: str, body: str) -> None:
    payload = {
        "sender": {"name": BREVO_SENDER_NAME, "email": SMTP_FROM_EMAIL},
        "to": [{"email": to_email}],
        "subject": subject,
        "textContent": body,
    }
    headers = {
        "accept": "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
    }
    with httpx.Client(timeout=20.0) as client:
        res = client.post("https://api.brevo.com/v3/smtp/email", json=payload, headers=headers)
        if res.status_code >= 400:
            raise RuntimeError(f"Brevo send failed ({res.status_code}): {res.text}")


def send_invite_email(to_email: str, subject: str, body: str) -> None:
    if not is_mail_configured():
        raise RuntimeError("Mail is not configured. Set BREVO_API_KEY (+SMTP_FROM_EMAIL) or SMTP_* values in backend/.env.")

    if BREVO_API_KEY:
        try:
            _send_via_brevo(to_email, subject, body)
            logger.info(f"Invite email sent via Brevo to {to_email}")
            return
        except Exception as exc:
            logger.warning(f"Brevo send failed, falling back to SMTP: {exc}")

    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM_EMAIL
        msg["To"] = to_email
        msg.set_content(body)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
            if SMTP_USE_TLS:
                server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        logger.info(f"Invite email sent to {to_email}")
    except Exception as exc:
        logger.error(f"Failed to send invite email to {to_email}: {exc}")
        raise
