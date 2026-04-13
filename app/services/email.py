"""Email notification service for triggered price alerts.

Uses SendGrid HTTP API when SENDGRID_API_KEY is configured.
Falls back to a no-op when the key is absent (development mode).
"""

from __future__ import annotations

import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

_HAS_SENDGRID = False
try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail

    _HAS_SENDGRID = True
except ImportError:
    logger.info("sendgrid package not installed — email notifications disabled")


def _build_alert_email_html(
    symbol: str,
    condition: str,
    target_price: Optional[float],
    trigger_price: float,
    severity: str,
) -> str:
    severity_label = "URGENT " if severity == "urgent" else ""
    if condition == "range_exit":
        detail = f"{symbol} exited the target range at ${trigger_price:.2f}."
    elif condition == "percent_change":
        detail = f"{symbol} moved {target_price}% from the reference price. Current: ${trigger_price:.2f}."
    else:
        detail = f"{symbol} moved {condition} ${target_price:.2f}. Current price: ${trigger_price:.2f}."

    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="margin: 0 0 8px;">{severity_label}MarketMetrics Alert Triggered</h2>
        <p style="color: #555; margin: 0 0 24px;">{detail}</p>
        <p style="font-size: 13px; color: #999;">
            This alert was created in your MarketMetrics dashboard.
            Log in to manage your alerts.
        </p>
    </div>
    """


def send_alert_email(
    to_email: str,
    symbol: str,
    condition: str,
    target_price: Optional[float],
    trigger_price: float,
    severity: str = "normal",
) -> bool:
    """Send an alert notification email. Returns True on success, False otherwise."""
    api_key = settings.sendgrid_api_key
    if not api_key:
        logger.debug("No SENDGRID_API_KEY set — skipping email for %s alert", symbol)
        return False

    if not _HAS_SENDGRID:
        logger.warning("sendgrid package not installed — cannot send email")
        return False

    from_email = settings.email_from_address
    severity_prefix = "[URGENT] " if severity == "urgent" else ""
    subject = f"{severity_prefix}{symbol} alert triggered — MarketMetrics"
    html_content = _build_alert_email_html(symbol, condition, target_price, trigger_price, severity)

    message = Mail(
        from_email=from_email,
        to_emails=to_email,
        subject=subject,
        html_content=html_content,
    )

    try:
        client = SendGridAPIClient(api_key)
        response = client.send(message)
        logger.info(
            "Alert email sent to %s for %s (status %s)",
            to_email,
            symbol,
            response.status_code,
        )
        return True
    except Exception:
        logger.exception("Failed to send alert email to %s for %s", to_email, symbol)
        return False
