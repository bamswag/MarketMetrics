"""Email delivery helpers for alerts and account actions.

Uses Brevo's transactional email API when configured and falls back to structured
logging in development.
"""

from __future__ import annotations

import logging
import re
from html import escape
from typing import Optional
from urllib.parse import urlparse

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def _brevo_is_configured() -> bool:
    return bool(settings.brevo_api_key and settings.email_from_address)


def _masked_api_key_suffix(value: str) -> str:
    if not value:
        return "missing"
    return value[-6:]


def _compact_url(value: str) -> str:
    return re.sub(r"[\r\n\t\f\v]+", "", value).strip()


def _redact_action_url(value: str) -> str:
    compact_url = _compact_url(value)
    parsed = urlparse(compact_url)
    if not parsed.scheme or not parsed.netloc:
        return "<invalid action url>"

    path_parts = [part for part in parsed.path.split("/") if part]
    if not path_parts:
        redacted_path = "/"
    elif len(path_parts) == 1:
        redacted_path = f"/{path_parts[0]}"
    else:
        redacted_path = f"/{path_parts[0]}/<redacted>"

    return f"{parsed.scheme}://{parsed.netloc}{redacted_path}"


def _send_transactional_email(
    *,
    to_email: str,
    subject: str,
    html_content: str,
    debug_action_url: Optional[str] = None,
) -> bool:
    if not _brevo_is_configured():
        if debug_action_url:
            logger.info("Email action link for %s: %s", to_email, _redact_action_url(debug_action_url))
        else:
            logger.debug("BREVO_API_KEY is missing — skipping transactional email to %s", to_email)
        return False

    payload = {
        "sender": {
            "name": settings.email_from_name,
            "email": settings.email_from_address,
        },
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html_content,
    }

    try:
        logger.warning(
            "Attempting Brevo API email send to %s from %s via %s (api key suffix: %s)",
            to_email,
            settings.email_from_address,
            settings.brevo_transactional_email_url,
            _masked_api_key_suffix(settings.brevo_api_key),
        )
        with httpx.Client(timeout=settings.brevo_timeout_seconds) as client:
            response = client.post(
                settings.brevo_transactional_email_url,
                headers={
                    "accept": "application/json",
                    "api-key": settings.brevo_api_key,
                    "content-type": "application/json",
                },
                json=payload,
            )
        response.raise_for_status()
        response_payload = response.json() if response.content else {}
        logger.warning(
            "Transactional email sent to %s via Brevo API (%s)",
            to_email,
            response_payload.get("messageId", "no message id"),
        )
        return True
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Brevo API rejected transactional email to %s with status %s: %s",
            to_email,
            exc.response.status_code,
            exc.response.text,
        )
        if debug_action_url:
            logger.warning("Email action link for %s: %s", to_email, _redact_action_url(debug_action_url))
        return False
    except Exception:
        logger.exception("Failed to send transactional email to %s via Brevo API", to_email)
        if debug_action_url:
            logger.warning("Email action link for %s: %s", to_email, _redact_action_url(debug_action_url))
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
    safe_display_name = escape(display_name.strip() or "there")
    safe_action_url = escape(_compact_url(action_url), quote=True)
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="margin: 0 0 10px;">Reset your MarketMetrics password</h2>
        <p style="color: #555; margin: 0 0 20px;">Hi {safe_display_name}, we received a request to reset your password.</p>
        <p style="margin: 0 0 24px;">
            <a href="{safe_action_url}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #0f766e; color: #fff; text-decoration: none; font-weight: 700;">
                Reset password
            </a>
        </p>
        <p style="color: #666; margin: 0 0 8px;">If you did not request this, you can safely ignore this email.</p>
        <p style="color: #666; margin: 0 0 8px;">If the button does not open, copy and paste this full link into your browser:</p>
        <div style="padding: 14px 16px; border-radius: 18px; background: #f3f6f8; border: 1px solid rgba(15, 118, 110, 0.12);">
            <a href="{safe_action_url}" style="font-size: 13px; line-height: 1.7; color: #0f766e; text-decoration: underline; word-break: break-word; overflow-wrap: anywhere;">
                {safe_action_url}
            </a>
        </div>
    </div>
    """


def _build_email_verification_html(display_name: str, action_url: str) -> str:
    safe_display_name = escape(display_name.strip() or "there")
    safe_action_url = escape(_compact_url(action_url), quote=True)
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="margin: 0 0 10px;">Confirm your new email address</h2>
        <p style="color: #555; margin: 0 0 20px;">Hi {safe_display_name}, confirm this email to finish updating your MarketMetrics account.</p>
        <p style="margin: 0 0 24px;">
            <a href="{safe_action_url}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #c96a45; color: #fff; text-decoration: none; font-weight: 700;">
                Verify email
            </a>
        </p>
        <p style="color: #666; margin: 0 0 8px;">Your current sign-in email will stay active until this change is verified.</p>
        <p style="color: #666; margin: 0 0 8px;">If the button does not open, copy and paste this full link into your browser:</p>
        <div style="padding: 14px 16px; border-radius: 18px; background: #f8f4f1; border: 1px solid rgba(201, 106, 69, 0.12);">
            <a href="{safe_action_url}" style="font-size: 13px; line-height: 1.7; color: #c96a45; text-decoration: underline; word-break: break-word; overflow-wrap: anywhere;">
                {safe_action_url}
            </a>
        </div>
    </div>
    """


def _build_welcome_email_html(display_name: str, account_url: str) -> str:
    safe_display_name = escape(display_name.strip() or "there")
    safe_account_url = escape(_compact_url(account_url), quote=True)
    return f"""
    <div style="margin: 0; padding: 0; background: #f4f7f9;">
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 620px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: #ffffff; border: 1px solid rgba(15, 23, 42, 0.08); border-radius: 24px; overflow: hidden; box-shadow: 0 22px 70px rgba(15, 23, 42, 0.12);">
                <div style="padding: 32px 34px; background: linear-gradient(135deg, #0f766e 0%, #153f3a 58%, #c96a45 100%); color: #ffffff;">
                    <p style="margin: 0 0 18px; font-size: 12px; line-height: 1; letter-spacing: 0.16em; font-weight: 800; text-transform: uppercase;">MarketMetrics</p>
                    <h1 style="margin: 0 0 12px; font-size: 30px; line-height: 1.15; font-weight: 800;">Welcome to MarketMetrics.</h1>
                    <p style="margin: 0; color: rgba(255, 255, 255, 0.86); font-size: 16px; line-height: 1.65;">Hi {safe_display_name}, welcome to your market monitoring workspace.</p>
                </div>

                <div style="padding: 32px 34px 34px;">
                    <p style="margin: 0 0 18px; color: #4b5563; font-size: 16px; line-height: 1.7;">
                        You can now search instruments, track stocks, ETFs, and crypto, create price alerts,
                        and review your account settings from one dashboard.
                    </p>
                    <div style="margin: 26px 0 28px;">
                        <a href="{safe_account_url}" style="display: inline-block; padding: 14px 22px; border-radius: 999px; background: #0f766e; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 800; box-shadow: 0 12px 28px rgba(15, 118, 110, 0.24);">
                            Open your account
                        </a>
                    </div>
                    <div style="margin: 0 0 26px;">
                        <div style="padding: 16px 18px; border-radius: 18px; background: #f7faf9; border: 1px solid rgba(15, 118, 110, 0.12); margin: 0 0 12px;">
                            <strong style="display: block; margin: 0 0 4px; color: #111827; font-size: 14px;">Track what matters</strong>
                            <span style="color: #64748b; font-size: 13px; line-height: 1.6;">Build watchlists and monitor price movement across supported assets.</span>
                        </div>
                        <div style="padding: 16px 18px; border-radius: 18px; background: #fff8f5; border: 1px solid rgba(201, 106, 69, 0.14);">
                            <strong style="display: block; margin: 0 0 4px; color: #111827; font-size: 14px;">Stay informed</strong>
                            <span style="color: #64748b; font-size: 13px; line-height: 1.6;">Create alerts and revisit your account preferences whenever you need to.</span>
                        </div>
                    </div>
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px; line-height: 1.6;">If the button does not open, copy and paste this link into your browser:</p>
                    <a href="{safe_account_url}" style="color: #0f766e; font-size: 13px; line-height: 1.7; text-decoration: underline; word-break: break-word; overflow-wrap: anywhere;">{safe_account_url}</a>
                    <p style="margin: 26px 0 0; color: #9ca3af; font-size: 12px; line-height: 1.6;">
                        This email confirms that a MarketMetrics account was created with this address.
                    </p>
                </div>
            </div>
        </div>
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


def send_welcome_email(
    to_email: str,
    display_name: str,
) -> bool:
    account_url = f"{settings.frontend_base_url}/account"
    return _send_transactional_email(
        to_email=to_email,
        subject="Welcome to MarketMetrics",
        html_content=_build_welcome_email_html(display_name, account_url),
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
