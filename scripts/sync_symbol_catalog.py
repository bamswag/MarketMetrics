#!/usr/bin/env python3
from __future__ import annotations

import asyncio

from app.integrations.alpaca.assets import fetch_assets_catalog
from app.services.search import (
    build_symbol_catalog_from_assets,
    get_symbol_asset_class,
    load_symbol_catalog,
    save_symbol_catalog,
)


async def main():
    assets = await fetch_assets_catalog()
    catalog = build_symbol_catalog_from_assets(assets)
    catalog_has_crypto = any(
        get_symbol_asset_class(str(item.get("symbol") or "")) == "crypto"
        for item in catalog
    )
    if not catalog_has_crypto:
        existing_crypto_entries = [
            item
            for item in load_symbol_catalog(force=True)
            if get_symbol_asset_class(str(item.get("symbol") or "")) == "crypto"
        ]
        if existing_crypto_entries:
            catalog.extend(existing_crypto_entries)
            print(
                "Warning: live asset sync returned no crypto symbols; preserved existing crypto catalog entries."
            )

    path = save_symbol_catalog(catalog)
    print(f"Saved {len(catalog)} symbols to {path}")


if __name__ == "__main__":
    asyncio.run(main())
