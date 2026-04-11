from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

import httpx

from app.core.config import settings


class AlpacaMarketDataError(Exception):
    pass


def _require_credentials() -> Dict[str, str]:
    if not settings.alpaca_api_key or not settings.alpaca_secret_key:
        raise AlpacaMarketDataError(
            "Missing ALPACA_API_KEY or ALPACA_SECRET_KEY in environment."
        )

    return {
        "APCA-API-KEY-ID": settings.alpaca_api_key,
        "APCA-API-SECRET-KEY": settings.alpaca_secret_key,
    }


async def _request_json(
    *,
    base_url: str,
    path: str,
    params: Optional[Dict[str, Any]] = None,
    timeout: float = 20.0,
) -> Dict[str, Any]:
    headers = _require_credentials()

    async with httpx.AsyncClient(base_url=base_url, headers=headers, timeout=timeout) as client:
        response = await client.get(path, params=params)

    if response.status_code != 200:
        message = response.text.strip() or f"HTTP {response.status_code}"
        raise AlpacaMarketDataError(f"Alpaca HTTP {response.status_code}: {message}")

    data = response.json()
    if isinstance(data, dict) and data.get("message"):
        raise AlpacaMarketDataError(data["message"])
    return data


def _normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper()


def _iso_datetime(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


async def fetch_daily_bar_rows(
    symbol: str,
    *,
    start: Optional[date] = None,
    end: Optional[date] = None,
    limit: int = 10000,
) -> List[Dict[str, Any]]:
    normalized_symbol = _normalize_symbol(symbol)
    end_date = end or date.today()
    start_date = start or (end_date - timedelta(days=settings.market_data_default_history_days))

    params = {
        "timeframe": "1Day",
        "start": f"{start_date.isoformat()}T00:00:00Z",
        "end": f"{end_date.isoformat()}T23:59:59Z",
        "adjustment": "all",
        "feed": settings.alpaca_data_feed,
        "limit": limit,
        "sort": "asc",
    }

    data = await _request_json(
        base_url=settings.alpaca_data_base_url,
        path=f"/v2/stocks/{normalized_symbol}/bars",
        params=params,
    )

    bars = data.get("bars") or []
    if not bars:
        raise AlpacaMarketDataError("No historical bar data is available for that symbol.")

    rows: List[Dict[str, Any]] = []
    for bar in bars:
        timestamp = bar.get("t")
        if not timestamp:
            continue

        point_date = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).date()
        rows.append(
            {
                "date": point_date,
                "open": float(bar.get("o") or 0.0),
                "high": float(bar.get("h") or 0.0),
                "low": float(bar.get("l") or 0.0),
                "close": float(bar.get("c") or 0.0),
                "volume": int(bar.get("v") or 0),
                "trade_count": int(bar.get("n") or 0),
                "vwap": float(bar.get("vw") or 0.0),
            }
        )

    if not rows:
        raise AlpacaMarketDataError("No historical bar data is available for that symbol.")

    return rows


async def fetch_daily_close_series(
    symbol: str,
    *,
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> List[Tuple[date, float]]:
    rows = await fetch_daily_bar_rows(symbol, start=start, end=end)
    return [(row["date"], row["close"]) for row in rows]


def _extract_snapshot_price(snapshot: Dict[str, Any]) -> Optional[float]:
    latest_trade = snapshot.get("latestTrade") or {}
    daily_bar = snapshot.get("dailyBar") or {}
    prev_daily_bar = snapshot.get("prevDailyBar") or {}

    if latest_trade.get("p") is not None:
        return float(latest_trade["p"])
    if daily_bar.get("c") is not None:
        return float(daily_bar["c"])
    if prev_daily_bar.get("c") is not None:
        return float(prev_daily_bar["c"])
    return None


def _normalize_snapshot(symbol: str, snapshot: Dict[str, Any]) -> Dict[str, Any]:
    latest_trade = snapshot.get("latestTrade") or {}
    daily_bar = snapshot.get("dailyBar") or {}
    prev_daily_bar = snapshot.get("prevDailyBar") or {}

    price = _extract_snapshot_price(snapshot)
    previous_close = prev_daily_bar.get("c")
    change = None
    change_percent = None
    if price is not None and previous_close not in (None, 0):
        change = price - float(previous_close)
        change_percent = f"{((change / float(previous_close)) * 100):.2f}%"

    latest_trading_day = None
    raw_latest_day = daily_bar.get("t") or prev_daily_bar.get("t")
    if raw_latest_day:
        latest_trading_day = raw_latest_day.split("T")[0]

    return {
        "symbol": symbol,
        "price": price,
        "change": round(change, 4) if change is not None else None,
        "changePercent": change_percent,
        "volume": int(daily_bar.get("v") or prev_daily_bar.get("v") or 0) or None,
        "latestTradingDay": latest_trading_day,
        "source": "alpaca",
    }


async def fetch_snapshot(symbol: str) -> Dict[str, Any]:
    normalized_symbol = _normalize_symbol(symbol)
    data = await _request_json(
        base_url=settings.alpaca_data_base_url,
        path=f"/v2/stocks/{normalized_symbol}/snapshot",
        params={"feed": settings.alpaca_data_feed},
    )
    normalized = _normalize_snapshot(normalized_symbol, data)
    if normalized["price"] is None:
        raise AlpacaMarketDataError("No quote data is available for that symbol.")
    return normalized


async def fetch_snapshots(symbols: Iterable[str]) -> Dict[str, Dict[str, Any]]:
    normalized_symbols = [_normalize_symbol(symbol) for symbol in symbols if symbol]
    if not normalized_symbols:
        return {}

    try:
        data = await _request_json(
            base_url=settings.alpaca_data_base_url,
            path="/v2/stocks/snapshots",
            params={
                "symbols": ",".join(normalized_symbols),
                "feed": settings.alpaca_data_feed,
            },
        )
    except AlpacaMarketDataError:
        return await _fetch_snapshots_individually(normalized_symbols)

    snapshots = data.get("snapshots") or {}
    result: Dict[str, Dict[str, Any]] = {}
    for symbol in normalized_symbols:
        snapshot = snapshots.get(symbol)
        if not snapshot:
            continue
        result[symbol] = _normalize_snapshot(symbol, snapshot)

    if len(result) < len(normalized_symbols):
        missing_symbols = [symbol for symbol in normalized_symbols if symbol not in result]
        result.update(await _fetch_snapshots_individually(missing_symbols))

    return result


async def _fetch_snapshots_individually(symbols: Iterable[str]) -> Dict[str, Dict[str, Any]]:
    normalized_symbols = [_normalize_symbol(symbol) for symbol in symbols if symbol]
    if not normalized_symbols:
        return {}

    results = await asyncio.gather(
        *(fetch_snapshot(symbol) for symbol in normalized_symbols),
        return_exceptions=True,
    )

    snapshots: Dict[str, Dict[str, Any]] = {}
    for symbol, payload in zip(normalized_symbols, results):
        if isinstance(payload, Exception):
            continue
        snapshots[symbol] = payload
    return snapshots


async def fetch_market_calendar(start: date, end: date) -> List[date]:
    data = await _request_json(
        base_url=settings.alpaca_trading_base_url,
        path="/v2/calendar",
        params={
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
    )

    trading_days: List[date] = []
    if isinstance(data, list):
        for item in data:
            raw_date = item.get("date")
            if raw_date:
                trading_days.append(datetime.strptime(raw_date, "%Y-%m-%d").date())

    return trading_days


async def fetch_assets_catalog() -> List[Dict[str, Any]]:
    data = await _request_json(
        base_url=settings.alpaca_trading_base_url,
        path="/v2/assets",
        params={
            "status": "active",
            "asset_class": "us_equity",
        },
    )
    if not isinstance(data, list):
        raise AlpacaMarketDataError("Unexpected Alpaca asset catalog response.")
    return data


async def fetch_company_name(symbol: str) -> str:
    from app.services.search import get_symbol_metadata

    metadata = get_symbol_metadata(symbol)
    if metadata and metadata.get("name"):
        return metadata["name"]
    return _normalize_symbol(symbol)


async def fetch_top_movers(
    symbols: Iterable[str],
    *,
    top_n: int = 5,
) -> Dict[str, List[Dict[str, Any]]]:
    snapshots = await fetch_snapshots(symbols)

    movers: List[Dict[str, Any]] = []
    for symbol, snapshot in snapshots.items():
        price = snapshot.get("price")
        change = snapshot.get("change")
        change_percent = snapshot.get("changePercent")
        if price is None or change is None or change_percent is None:
            continue
        movers.append(
            {
                "symbol": symbol,
                "price": price,
                "change_amount": change,
                "change_percent": change_percent,
                "volume": snapshot.get("volume"),
            }
        )

    sorted_movers = sorted(
        movers,
        key=lambda item: float(str(item["change_percent"]).replace("%", "")),
        reverse=True,
    )

    return {
        "top_gainers": sorted_movers[:top_n],
        "top_losers": list(reversed(sorted_movers[-top_n:])),
    }
