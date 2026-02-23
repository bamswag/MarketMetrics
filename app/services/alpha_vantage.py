from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import httpx


class AlphaVantageError(Exception):
    pass


BASE_URL = "https://www.alphavantage.co/query"


def _get_api_key() -> str:
    key = os.getenv("ALPHA_VANTAGE_API_KEY")
    if not key:
        raise AlphaVantageError("Missing ALPHA_VANTAGE_API_KEY in environment (.env not loaded?)")
    return key


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


    if "Error Message" in data:
        raise AlphaVantageError(data["Error Message"])
    if "Information" in data:

        raise AlphaVantageError(data["Information"])
    if "Note" in data:
        raise AlphaVantageError(data["Note"])

    return data
