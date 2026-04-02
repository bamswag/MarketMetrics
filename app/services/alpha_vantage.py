from __future__ import annotations

from typing import Any, Dict

import httpx

from app.core.config import settings


class AlphaVantageError(Exception):
    pass


BASE_URL = "https://www.alphavantage.co/query"


def _get_api_key() -> str:
    key = settings.alpha_vantage_api_key
    if not key:
        raise AlphaVantageError("Missing ALPHA_VANTAGE_API_KEY in environment (.env not loaded?)")
    return key


def _raise_if_api_error(data: Dict[str, Any]) -> None:
    # Alpha Vantage returns these keys for problems / rate limits
    if "Error Message" in data:
        raise AlphaVantageError(data["Error Message"])
    if "Information" in data:
        raise AlphaVantageError(data["Information"])
    if "Note" in data:
        raise AlphaVantageError(data["Note"])


async def fetch_company_name(symbol: str) -> str:
    params = {
        "function": "OVERVIEW",
        "symbol": symbol,
        "apikey": _get_api_key(),
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(BASE_URL, params=params)

    if resp.status_code != 200:
        raise AlphaVantageError(f"Alpha Vantage HTTP {resp.status_code}")

    data = resp.json()
    _raise_if_api_error(data)

    return data.get("Name") or symbol


async def fetch_top_movers() -> Dict[str, Any]:
    params = {
        "function": "TOP_GAINERS_LOSERS",
        "apikey": _get_api_key(),
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(BASE_URL, params=params)

    if resp.status_code != 200:
        raise AlphaVantageError(f"Alpha Vantage HTTP {resp.status_code}")

    data = resp.json()
    _raise_if_api_error(data)
    return data


async def search_companies(keywords: str) -> Dict[str, Any]:
    params = {
        "function": "SYMBOL_SEARCH",
        "keywords": keywords,
        "apikey": _get_api_key(),
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(BASE_URL, params=params)

    if resp.status_code != 200:
        raise AlphaVantageError(f"Alpha Vantage HTTP {resp.status_code}")

    data = resp.json()
    _raise_if_api_error(data)
    return data
