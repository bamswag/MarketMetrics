from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import httpx


class AlphaVantageError(Exception):
    pass


BASE_URL = "https://www.alphavantage.co/query"

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

    if "Error Message" in data:
        raise AlphaVantageError(data["Error Message"])
    if "Information" in data:
        raise AlphaVantageError(data["Information"])
    if "Note" in data:
        raise AlphaVantageError(data["Note"])

    name = data.get("Name")
    return name if name else symbol

def _get_api_key() -> str:
    key = os.getenv("ALPHA_VANTAGE_API_KEY")
    if not key:
        raise AlphaVantageError("Missing ALPHA_VANTAGE_API_KEY in environment (.env not loaded?)")
    return key


async def fetch_company_name(symbol: str) -> str:

    params = {
        "function": "OVERVIER",
        "symbol": symbol,
        "apikey": _get_api_key(),
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(BASE_URL, params=params)
    if resp.status_code != 200:
        raise AlphaVantageError(f"Alpha Vantage HTTP {resp.status_code}")
    data = resp.json()
    if "Error Message" in data:
        raise AlphaVantageError(data["Error Message"])
    if "Name" in data:
        return data["Name"]
    if "Information" in data:
        raise AlphaVantageError(data["Information"])
    if "Note" in data:
        raise AlphaVantageError(data["Note"])

    return data
