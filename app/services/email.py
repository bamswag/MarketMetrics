"""Email delivery helpers for alerts and account actions.

Uses SendGrid when configured and falls back to structured logging in development.
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


def _send_transactional_email(
    *,
    to_email: str,
    subject: str,
    html_content: str,
    debug_action_url: Optional[str] = None,
) -> bool:
    api_key = settings.sendgrid_api_key
    if not api_key:
        if debug_action_url:
            logger.info("Email action link for %s: %s", to_email, debug_action_url)
        else:
            logger.debug("No SENDGRID_API_KEY set — skipping transactional email to %s", to_email)
        return False

    if not _HAS_SENDGRID:
        logger.warning("sendgrid package not installed — cannot send email")
        if debug_action_url:
            logger.info("Email action link for %s: %s", to_email, debug_action_url)
        return False

    from_email = settings.email_from_address
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
            "Transactional email sent to %s (status %s)",
            to_email,
            response.status_code,
        )
        return True
    except Exception:
        logger.exception("Failed to send transactional email to %s", to_email)
        if debug_action_url:
            logger.info("Email action link for %s: %s", to_email, debug_action_url)
        return False


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


def _build_password_reset_email_html(display_name: str, action_url: str) -> str:
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="margin: 0 0 10px;">Reset your MarketMetrics password</h2>
        <p style="color: #555; margin: 0 0 20px;">Hi {display_name}, we received a request to reset your password.</p>
        <p style="margin: 0 0 24px;">
            <a href="{action_url}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #0f766e; color: #fff; text-decoration: none; font-weight: 700;">
                Reset password
            </a>
        </p>
        <p style="color: #666; margin: 0 0 8px;">If you did not request this, you can safely ignore this email.</p>
        <p style="font-size: 13px; color: #999; word-break: break-all;">{action_url}</p>
    </div>
    """


def _build_email_verification_html(display_name: str, action_url: str) -> str:
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="margin: 0 0 10px;">Confirm your new email address</h2>
        <p style="color: #555; margin: 0 0 20px;">Hi {display_name}, confirm this email to finish updating your MarketMetrics account.</p>
        <p style="margin: 0 0 24px;">
            <a href="{action_url}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #c96a45; color: #fff; text-decoration: none; font-weight: 700;">
                Verify email
            </a>
        </p>
        <p style="color: #666; margin: 0 0 8px;">Your current sign-in email will stay active until this change is verified.</p>
        <p style="font-size: 13px; color: #999; word-break: break-all;">{action_url}</p>
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
    severity_prefix = "[URGENT] " if severity == "urgent" else ""
    subject = f"{severity_prefix}{symbol} alert triggered — MarketMetrics"
    html_content = _build_alert_email_html(symbol, condition, target_price, trigger_price, severity)
    return _send_transactional_email(
        to_email=to_email,
        subject=subject,
        html_content=html_content,
    )


def send_password_reset_email(
    to_email: str,
    display_name: str,
    action_url: str,
) -> bool:
    return _send_transactional_email(
        to_email=to_email,
        subject="Reset your MarketMetrics password",
        html_content=_build_password_reset_email_html(display_name, action_url),
        debug_action_url=action_url,
    )


def send_email_change_verification_email(
    to_email: str,
    display_name: str,
    action_url: str,
) -> bool:
    return _send_transactional_email(
        to_email=to_email,
        subject="Verify your new MarketMetrics email",
        html_content=_build_email_verification_html(display_name, action_url),
        debug_action_url=action_url,
    )
