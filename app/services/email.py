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


def _build_email_support_card_html(
    title: str,
    body: str,
    *,
    background: str,
    border_color: str,
) -> str:
    safe_title = escape(title.strip())
    safe_body = escape(body.strip())
    return f"""
    <div style="padding: 16px 18px; border-radius: 18px; background: {background}; border: 1px solid {border_color}; margin: 0 0 12px;">
        <strong style="display: block; margin: 0 0 4px; color: #111827; font-size: 14px;">{safe_title}</strong>
        <span style="color: #64748b; font-size: 13px; line-height: 1.6;">{safe_body}</span>
    </div>
    """


def _build_branded_account_action_email_html(
    *,
    eyebrow: str,
    title: str,
    hero_message: str,
    summary: str,
    button_label: str,
    action_url: str,
    button_background: str,
    cards: list[tuple[str, str, str, str]],
    footer_note: str,
) -> str:
    safe_eyebrow = escape(eyebrow.strip())
    safe_title = escape(title.strip())
    safe_hero_message = escape(hero_message.strip())
    safe_summary = escape(summary.strip())
    safe_button_label = escape(button_label.strip())
    safe_action_url = escape(_compact_url(action_url), quote=True)
    safe_footer_note = escape(footer_note.strip())
    cards_html = "".join(
        _build_email_support_card_html(
            card_title,
            card_body,
            background=background,
            border_color=border_color,
        )
        for card_title, card_body, background, border_color in cards
    )
    return f"""
    <div style="margin: 0; padding: 0; background: #f4f7f9;">
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 620px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: #ffffff; border: 1px solid rgba(15, 23, 42, 0.08); border-radius: 24px; overflow: hidden; box-shadow: 0 22px 70px rgba(15, 23, 42, 0.12);">
                <div style="padding: 32px 34px; background: linear-gradient(135deg, #0f766e 0%, #153f3a 58%, #c96a45 100%); color: #ffffff;">
                    <p style="margin: 0 0 18px; font-size: 12px; line-height: 1; letter-spacing: 0.16em; font-weight: 800; text-transform: uppercase;">{safe_eyebrow}</p>
                    <h1 style="margin: 0 0 12px; font-size: 30px; line-height: 1.15; font-weight: 800;">{safe_title}</h1>
                    <p style="margin: 0; color: rgba(255, 255, 255, 0.86); font-size: 16px; line-height: 1.65;">{safe_hero_message}</p>
                </div>

                <div style="padding: 32px 34px 34px;">
                    <p style="margin: 0 0 18px; color: #4b5563; font-size: 16px; line-height: 1.7;">{safe_summary}</p>
                    <div style="margin: 26px 0 28px;">
                        <a href="{safe_action_url}" style="display: inline-block; padding: 14px 22px; border-radius: 999px; background: {button_background}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 800; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);">
                            {safe_button_label}
                        </a>
                    </div>
                    <div style="margin: 0 0 26px;">
                        {cards_html}
                    </div>
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px; line-height: 1.6;">If the button does not open, copy and paste this link into your browser:</p>
                    <a href="{safe_action_url}" style="color: #0f766e; font-size: 13px; line-height: 1.7; text-decoration: underline; word-break: break-word; overflow-wrap: anywhere;">{safe_action_url}</a>
                    <p style="margin: 26px 0 0; color: #9ca3af; font-size: 12px; line-height: 1.6;">{safe_footer_note}</p>
                </div>
            </div>
        </div>
    </div>
    """


def _build_password_reset_email_html(display_name: str, action_url: str) -> str:
    friendly_name = display_name.strip() or "there"
    return _build_branded_account_action_email_html(
        eyebrow="MarketMetrics",
        title="Reset your MarketMetrics password.",
        hero_message=f"Hi {friendly_name}, use this secure link to choose a fresh password.",
        summary="Complete the reset to restore access and invalidate older sessions tied to this password.",
        button_label="Reset password",
        action_url=action_url,
        button_background="#0f766e",
        cards=[
            (
                "Secure recovery",
                "Choose a strong new password you have not used on this account before.",
                "#f7faf9",
                "rgba(15, 118, 110, 0.12)",
            ),
            (
                "No action needed?",
                "If you did not request this reset, you can safely ignore this message.",
                "#fff8f5",
                "rgba(201, 106, 69, 0.14)",
            ),
        ],
        footer_note="This reset link was requested for your MarketMetrics account.",
    )


def _build_email_change_verification_html(display_name: str, action_url: str) -> str:
    friendly_name = display_name.strip() or "there"
    return _build_branded_account_action_email_html(
        eyebrow="MarketMetrics",
        title="Confirm your new email address.",
        hero_message=f"Hi {friendly_name}, verify this inbox to finish updating your MarketMetrics account.",
        summary="Your current sign-in email stays active until this new address is confirmed.",
        button_label="Verify email",
        action_url=action_url,
        button_background="#c96a45",
        cards=[
            (
                "Finish the change",
                "Once verified, this inbox becomes the email address used for account recovery and future updates.",
                "#fff8f5",
                "rgba(201, 106, 69, 0.14)",
            ),
            (
                "Still in control",
                "Your current email remains active until this confirmation is completed.",
                "#f7faf9",
                "rgba(15, 118, 110, 0.12)",
            ),
        ],
        footer_note="If you did not request this change, you can ignore this email and keep using your current address.",
    )


def _build_signup_verification_email_html(display_name: str, action_url: str) -> str:
    friendly_name = display_name.strip() or "there"
    return _build_branded_account_action_email_html(
        eyebrow="MarketMetrics",
        title="Verify your MarketMetrics account.",
        hero_message=f"Hi {friendly_name}, confirm this email address to finish setting up your account.",
        summary="You can already sign in, but verifying this inbox confirms ownership and keeps account recovery and future security updates pointed at the right place.",
        button_label="Verify your account",
        action_url=action_url,
        button_background="#0f766e",
        cards=[
            (
                "Confirm your inbox",
                "Use this secure link to verify the address connected to your new MarketMetrics account.",
                "#f7faf9",
                "rgba(15, 118, 110, 0.12)",
            ),
            (
                "Keep it protected",
                "Verification helps keep recovery, identity updates, and account communications tied to you.",
                "#fff8f5",
                "rgba(201, 106, 69, 0.14)",
            ),
        ],
        footer_note="If you did not create this account, you can safely ignore this email.",
    )


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


def send_signup_verification_email(
    to_email: str,
    display_name: str,
    action_url: str,
) -> bool:
    return _send_transactional_email(
        to_email=to_email,
        subject="Verify your MarketMetrics account",
        html_content=_build_signup_verification_email_html(display_name, action_url),
        debug_action_url=action_url,
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
        html_content=_build_email_change_verification_html(display_name, action_url),
        debug_action_url=action_url,
    )
