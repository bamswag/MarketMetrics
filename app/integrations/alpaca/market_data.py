from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

import httpx

from app.core.config import settings


class AlpacaMarketDataError(Exception):
    pass


_CRYPTO_SNAPSHOT_BATCH_SIZE = 50


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


def _to_crypto_data_symbol(symbol: str) -> str:
    """Convert catalog symbol like BTCUSD to API symbol like BTC/USD."""
    s = symbol.strip().upper()
    if "/" in s:
        return s
    if s.endswith("USD"):
        return f"{s[:-3]}/USD"
    return s


def _chunked(values: List[str], size: int) -> Iterable[List[str]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


async def _fetch_crypto_bars(
    symbol: str,
    *,
    start: date,
    end: date,
    limit: int = 10000,
) -> List[Dict[str, Any]]:
    api_symbol = _to_crypto_data_symbol(symbol)
    params = {
        "symbols": api_symbol,
        "timeframe": "1Day",
        "start": f"{start.isoformat()}T00:00:00Z",
        "end": f"{end.isoformat()}T23:59:59Z",
        "limit": limit,
        "sort": "asc",
    }
    data = await _request_json(
        base_url=settings.alpaca_data_base_url,
        path="/v1beta3/crypto/us/bars",
        params=params,
    )
    return data.get("bars", {}).get(api_symbol) or []


async def _fetch_crypto_snapshot(symbol: str) -> Dict[str, Any]:
    api_symbol = _to_crypto_data_symbol(symbol)
    data = await _request_json(
        base_url=settings.alpaca_data_base_url,
        path="/v1beta3/crypto/us/snapshots",
        params={"symbols": api_symbol},
    )
    snapshots = data.get("snapshots") or {}
    snapshot = snapshots.get(api_symbol)
    if not snapshot:
        raise AlpacaMarketDataError("No crypto quote data is available for that symbol.")
    return snapshot


async def fetch_daily_bar_rows(
    symbol: str,
    *,
    start: Optional[date] = None,
    end: Optional[date] = None,
    limit: int = 10000,
    asset_class: str = "us_equity",
) -> List[Dict[str, Any]]:
    normalized_symbol = _normalize_symbol(symbol)
    end_date = end or date.today()
    start_date = start or (end_date - timedelta(days=settings.market_data_default_history_days))

    if asset_class == "crypto":
        bars = await _fetch_crypto_bars(
            normalized_symbol, start=start_date, end=end_date, limit=limit
        )
    else:
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
    asset_class: str = "us_equity",
) -> List[Tuple[date, float]]:
    rows = await fetch_daily_bar_rows(symbol, start=start, end=end, asset_class=asset_class)
    return [(row["date"], row["close"]) for row in rows]


async def fetch_intraday_close_series(
    symbol: str,
    *,
    asset_class: str = "us_equity",
) -> List[Tuple[datetime, float]]:
    normalized_symbol = _normalize_symbol(symbol)
    now = datetime.utcnow().replace(microsecond=0)

    if asset_class == "crypto":
        api_symbol = _to_crypto_data_symbol(normalized_symbol)
        start = now - timedelta(hours=24)
        data = await _request_json(
            base_url=settings.alpaca_data_base_url,
            path="/v1beta3/crypto/us/bars",
            params={
                "symbols": api_symbol,
                "timeframe": "15Min",
                "start": f"{start.isoformat()}Z",
                "end": f"{now.isoformat()}Z",
                "limit": 200,
                "sort": "asc",
            },
        )
        bars = data.get("bars", {}).get(api_symbol) or []
    else:
        start = now - timedelta(days=2)
        data = await _request_json(
            base_url=settings.alpaca_data_base_url,
            path=f"/v2/stocks/{normalized_symbol}/bars",
            params={
                "timeframe": "15Min",
                "start": f"{start.isoformat()}Z",
                "end": f"{now.isoformat()}Z",
                "adjustment": "all",
                "feed": settings.alpaca_data_feed,
                "limit": 200,
                "sort": "asc",
            },
        )
        bars = data.get("bars") or []

    points: List[Tuple[datetime, float]] = []
    for bar in bars:
        timestamp = bar.get("t")
        close = bar.get("c")
        if not timestamp or close is None:
            continue
        points.append(
            (
                datetime.fromisoformat(timestamp.replace("Z", "+00:00")),
                float(close),
            )
        )

    if not points:
        raise AlpacaMarketDataError("No intraday bar data is available for that symbol.")

    if asset_class != "crypto":
        latest_session_day = max(point_dt.date() for point_dt, _ in points)
        points = [
            (point_dt, close)
            for point_dt, close in points
            if point_dt.date() == latest_session_day
        ]

    if not points:
        raise AlpacaMarketDataError("No intraday bar data is available for that symbol.")

    return points


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


async def fetch_snapshot(symbol: str, *, asset_class: str = "us_equity") -> Dict[str, Any]:
    normalized_symbol = _normalize_symbol(symbol)

    if asset_class == "crypto":
        raw_snapshot = await _fetch_crypto_snapshot(normalized_symbol)
        normalized = _normalize_snapshot(normalized_symbol, raw_snapshot)
        if normalized["price"] is None:
            raise AlpacaMarketDataError("No quote data is available for that symbol.")
        return normalized

    data = await _request_json(
        base_url=settings.alpaca_data_base_url,
        path=f"/v2/stocks/{normalized_symbol}/snapshot",
        params={"feed": settings.alpaca_data_feed},
    )
    normalized = _normalize_snapshot(normalized_symbol, data)
    if normalized["price"] is None:
        raise AlpacaMarketDataError("No quote data is available for that symbol.")
    return normalized


async def fetch_snapshots(
    symbols: Iterable[str],
    *,
    asset_class_map: Optional[Dict[str, str]] = None,
) -> Dict[str, Dict[str, Any]]:
    normalized_symbols = [_normalize_symbol(symbol) for symbol in symbols if symbol]
    if not normalized_symbols:
        return {}

    ac_map = asset_class_map or {}
    equity_symbols = [s for s in normalized_symbols if ac_map.get(s, "us_equity") != "crypto"]
    crypto_symbols = [s for s in normalized_symbols if ac_map.get(s) == "crypto"]

    result: Dict[str, Dict[str, Any]] = {}

    if equity_symbols:
        try:
            data = await _request_json(
                base_url=settings.alpaca_data_base_url,
                path="/v2/stocks/snapshots",
                params={
                    "symbols": ",".join(equity_symbols),
                    "feed": settings.alpaca_data_feed,
                },
            )
        except AlpacaMarketDataError:
            data = {}

        snapshots = data.get("snapshots") or {} if isinstance(data, dict) else {}
        for symbol in equity_symbols:
            snapshot = snapshots.get(symbol)
            if snapshot:
                result[symbol] = _normalize_snapshot(symbol, snapshot)

        missing = [s for s in equity_symbols if s not in result]
        if missing:
            result.update(await _fetch_snapshots_individually(missing))

    if crypto_symbols:
        batched_crypto_results: Dict[str, Dict[str, Any]] = {}
        for batch in _chunked(crypto_symbols, _CRYPTO_SNAPSHOT_BATCH_SIZE):
            api_symbols = [_to_crypto_data_symbol(symbol) for symbol in batch]
            try:
                data = await _request_json(
                    base_url=settings.alpaca_data_base_url,
                    path="/v1beta3/crypto/us/snapshots",
                    params={"symbols": ",".join(api_symbols)},
                )
            except AlpacaMarketDataError:
                data = {}

            snapshots = data.get("snapshots") or {} if isinstance(data, dict) else {}
            for symbol, api_symbol in zip(batch, api_symbols):
                snapshot = snapshots.get(api_symbol)
                if not snapshot:
                    continue
                normalized = _normalize_snapshot(symbol, snapshot)
                if normalized["price"] is not None:
                    batched_crypto_results[symbol] = normalized

            missing_crypto_symbols = [symbol for symbol in batch if symbol not in batched_crypto_results]
            if missing_crypto_symbols:
                fallback_results = await asyncio.gather(
                    *(
                        fetch_snapshot(symbol, asset_class="crypto")
                        for symbol in missing_crypto_symbols
                    ),
                    return_exceptions=True,
                )
                for symbol, payload in zip(missing_crypto_symbols, fallback_results):
                    if isinstance(payload, Exception):
                        continue
                    batched_crypto_results[symbol] = payload

        result.update(batched_crypto_results)

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
    equity_data, crypto_data = await asyncio.gather(
        _request_json(
            base_url=settings.alpaca_trading_base_url,
            path="/v2/assets",
            params={"status": "active", "asset_class": "us_equity"},
        ),
        _request_json(
            base_url=settings.alpaca_trading_base_url,
            path="/v2/assets",
            params={"status": "active", "asset_class": "crypto"},
        ),
        return_exceptions=True,
    )

    assets: List[Dict[str, Any]] = []
    if isinstance(equity_data, list):
        assets.extend(equity_data)
    if isinstance(crypto_data, list):
        assets.extend(crypto_data)

    if not assets:
        raise AlpacaMarketDataError("Unexpected Alpaca asset catalog response.")
    return assets


async def fetch_company_name(symbol: str) -> str:
    from app.services.search import get_symbol_metadata

    metadata = get_symbol_metadata(symbol)
    if metadata and metadata.get("name"):
        return metadata["name"]
    return _normalize_symbol(symbol)


def _change_percent_value(value: Any) -> Optional[float]:
    try:
        return float(str(value).replace("%", ""))
    except Exception:
        return None


async def fetch_top_movers(
    symbols: Iterable[str],
    *,
    top_n: int = 5,
    asset_class_map: Optional[Dict[str, str]] = None,
) -> Dict[str, List[Dict[str, Any]]]:
    snapshots = await fetch_snapshots(symbols, asset_class_map=asset_class_map)

    movers: List[Dict[str, Any]] = []
    for symbol, snapshot in snapshots.items():
        price = snapshot.get("price")
        change = snapshot.get("change")
        change_percent = snapshot.get("changePercent")
        change_percent_value = _change_percent_value(change_percent)
        if price is None or change is None or change_percent is None or change_percent_value is None:
            continue
        movers.append(
            {
                "symbol": symbol,
                "price": price,
                "change_amount": change,
                "change_percent": change_percent,
                "change_percent_value": change_percent_value,
                "volume": snapshot.get("volume"),
            }
        )

    gainers = sorted(
        [item for item in movers if item["change_percent_value"] > 0],
        key=lambda item: item["change_percent_value"],
        reverse=True,
    )
    losers = sorted(
        [item for item in movers if item["change_percent_value"] < 0],
        key=lambda item: item["change_percent_value"],
    )

    def _public_shape(item: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "symbol": item["symbol"],
            "price": item["price"],
            "change_amount": item["change_amount"],
            "change_percent": item["change_percent"],
            "volume": item["volume"],
        }

    return {
        "top_gainers": [_public_shape(item) for item in gainers[:top_n]],
        "top_losers": [_public_shape(item) for item in losers[:top_n]],
    }
