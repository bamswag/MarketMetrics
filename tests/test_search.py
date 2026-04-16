import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from app.services.search import (
    DEFAULT_MOVER_UNIVERSE_BY_CATEGORY,
    get_dynamic_mover_universe_symbols_by_category,
    get_symbol_asset_class,
    get_symbol_metadata,
)

try:
    from test_auth import BaseAPITestCase
except ModuleNotFoundError:
    from tests.test_auth import BaseAPITestCase


class SearchRouteTests(BaseAPITestCase):
    @patch("app.api.routes.search.search_symbol_catalog")
    def test_company_search_is_available_without_authentication(self, mock_search_symbol_catalog):
        mock_search_symbol_catalog.return_value = [
            {
                "symbol": "AAPL",
                "name": "Apple Inc.",
                "exchange": "NASDAQ",
                "asset_class": "us_equity",
                "status": "active",
                "tradable": True,
            }
        ]

        response = self.client.get("/search/companies?q=apple")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["query"], "apple")
        self.assertEqual(len(payload["results"]), 1)
        self.assertEqual(payload["results"][0]["symbol"], "AAPL")
        self.assertEqual(payload["results"][0]["assetCategory"], "stocks")


class SearchServiceTests(unittest.TestCase):
    def test_crypto_alias_lookup_resolves_to_catalog_symbol(self):
        metadata = get_symbol_metadata("BTCUSD")

        self.assertIsNotNone(metadata)
        self.assertEqual(metadata["symbol"], "BTC/USD")
        self.assertEqual(get_symbol_asset_class("BTCUSD"), "crypto")

    @patch("app.services.search.fetch_assets_catalog", new_callable=AsyncMock)
    def test_dynamic_mover_universe_uses_active_tradable_usd_crypto_assets(
        self,
        mock_fetch_assets_catalog,
    ):
        mock_fetch_assets_catalog.return_value = [
            {
                "symbol": "BTCUSD",
                "name": "Bitcoin",
                "exchange": "CRYPTO",
                "status": "active",
                "tradable": True,
                "class": "crypto",
            },
            {
                "symbol": "ETH/USD",
                "name": "Ethereum",
                "exchange": "CRYPTO",
                "status": "active",
                "tradable": True,
                "class": "crypto",
            },
            {
                "symbol": "DOGEUSD",
                "name": "Dogecoin",
                "exchange": "CRYPTO",
                "status": "inactive",
                "tradable": True,
                "class": "crypto",
            },
            {
                "symbol": "XRP/BTC",
                "name": "XRP / Bitcoin",
                "exchange": "CRYPTO",
                "status": "active",
                "tradable": True,
                "class": "crypto",
            },
            {
                "symbol": "AVAXUSD",
                "name": "Avalanche",
                "exchange": "CRYPTO",
                "status": "active",
                "tradable": False,
                "class": "crypto",
            },
            {
                "symbol": "AAPL",
                "name": "Apple Inc.",
                "exchange": "NASDAQ",
                "status": "active",
                "tradable": True,
                "class": "us_equity",
            },
        ]

        payload = asyncio.run(
            get_dynamic_mover_universe_symbols_by_category(force_refresh=True)
        )

        self.assertEqual(payload["stocks"], DEFAULT_MOVER_UNIVERSE_BY_CATEGORY["stocks"])
        self.assertEqual(payload["etfs"], DEFAULT_MOVER_UNIVERSE_BY_CATEGORY["etfs"])
        self.assertEqual(payload["crypto"], ["BTC/USD", "ETH/USD"])
