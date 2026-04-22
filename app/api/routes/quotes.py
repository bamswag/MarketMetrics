from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.schemas.quotes import PublicQuotesResponse
from app.services.quotes import get_public_quotes_cached

router = APIRouter(prefix="/quotes", tags=["quotes"])

MAX_PUBLIC_QUOTE_SYMBOLS = 60


def _parse_symbols(raw_symbols: str) -> list[str]:
    symbols: list[str] = []
    seen: set[str] = set()

    for raw_symbol in raw_symbols.split(","):
        symbol = raw_symbol.strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        symbols.append(symbol)

    return symbols


@router.get("/", response_model=PublicQuotesResponse)
async def public_quotes(
    symbols: str = Query(..., min_length=1),
):
    requested_symbols = _parse_symbols(symbols)
    if not requested_symbols:
        raise HTTPException(status_code=400, detail="At least one symbol is required.")

    if len(requested_symbols) > MAX_PUBLIC_QUOTE_SYMBOLS:
        raise HTTPException(
            status_code=400,
            detail=f"Quote lookup is limited to {MAX_PUBLIC_QUOTE_SYMBOLS} symbols per request.",
        )

    quotes = await get_public_quotes_cached(requested_symbols)
    return PublicQuotesResponse(quotes=quotes)
