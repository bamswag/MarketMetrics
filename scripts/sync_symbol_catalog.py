#!/usr/bin/env python3
from __future__ import annotations

import asyncio

from app.integrations.alpaca.assets import fetch_assets_catalog
from app.services.search import save_symbol_catalog


async def main():
    assets = await fetch_assets_catalog()
    catalog = [
        {
            "symbol": asset.get("symbol"),
            "name": asset.get("name") or asset.get("symbol"),
            "exchange": asset.get("exchange"),
            "status": asset.get("status"),
            "asset_class": asset.get("class") or asset.get("asset_class") or "us_equity",
            "tradable": bool(asset.get("tradable", True)),
        }
        for asset in assets
        if asset.get("symbol")
    ]
    path = save_symbol_catalog(catalog)
    print(f"Saved {len(catalog)} symbols to {path}")


if __name__ == "__main__":
    asyncio.run(main())
