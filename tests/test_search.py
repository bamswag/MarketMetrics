import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import app.services.search as search_service
from app.services.search import (
    DEFAULT_MOVER_UNIVERSE_BY_CATEGORY,
    get_dynamic_mover_universe_symbols_by_category,
    get_symbol_asset_class,
    get_symbol_metadata,
    resolve_company_name,
    resolve_crypto_pair_name,
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

    def test_crypto_pair_name_fallback_handles_live_pairs_missing_from_catalog(self):
        self.assertEqual(resolve_crypto_pair_name("PAXG/USD"), "PAX Gold / US Dollar")
        self.assertEqual(resolve_crypto_pair_name("PEPEUSD"), "Pepe / US Dollar")
        self.assertEqual(resolve_company_name("BCH/USD"), "Bitcoin Cash / US Dollar")

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

    @patch("app.services.search.fetch_assets_catalog", new_callable=AsyncMock)
    def test_dynamic_mover_universe_persists_live_crypto_catalog(
        self,
        mock_fetch_assets_catalog,
    ):
        mock_fetch_assets_catalog.return_value = [
            {
                "symbol": "LTCUSD",
                "name": "Litecoin",
                "exchange": "CRYPTO",
                "status": "active",
                "tradable": True,
                "class": "crypto",
            },
            {
                "symbol": "MATIC/USD",
                "name": "Polygon",
                "exchange": "CRYPTO",
                "status": "active",
                "tradable": True,
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

        with tempfile.TemporaryDirectory() as temp_dir:
            catalog_path = Path(temp_dir) / "symbol_catalog.json"
            with patch("app.services.search._catalog_path", return_value=catalog_path):
                payload = asyncio.run(
                    get_dynamic_mover_universe_symbols_by_category(force_refresh=True)
                )
                catalog_symbols = {
                    item["symbol"] for item in search_service.load_symbol_catalog(force=True)
                }

        self.assertIn("LTC/USD", payload["crypto"])
        self.assertIn("MATIC/USD", payload["crypto"])
        self.assertIn("LTC/USD", catalog_symbols)
        self.assertIn("MATIC/USD", catalog_symbols)

    @patch("app.services.search.fetch_assets_catalog", new_callable=AsyncMock)
    def test_degraded_crypto_universe_cache_retries_quickly_after_fallback(
        self,
        mock_fetch_assets_catalog,
    ):
        mock_fetch_assets_catalog.side_effect = [
            RuntimeError("temporary alpaca outage"),
            [
                {
                    "symbol": "LTCUSD",
                    "name": "Litecoin",
                    "exchange": "CRYPTO",
                    "status": "active",
                    "tradable": True,
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
            ],
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            catalog_path = Path(temp_dir) / "symbol_catalog.json"
            with patch("app.services.search._catalog_path", return_value=catalog_path):
                fallback_payload = asyncio.run(
                    get_dynamic_mover_universe_symbols_by_category(force_refresh=True)
                )
                self.assertEqual(
                    search_service._dynamic_crypto_mover_universe_ttl_seconds,
                    search_service._DEGRADED_MOVER_UNIVERSE_REFRESH_TTL_SECONDS,
                )
                search_service._dynamic_crypto_mover_universe_last_refresh_monotonic -= (
                    search_service._DEGRADED_MOVER_UNIVERSE_REFRESH_TTL_SECONDS + 1.0
                )

                recovered_payload = asyncio.run(
                    get_dynamic_mover_universe_symbols_by_category(force_refresh=False)
                )

        self.assertTrue(
            set(fallback_payload["crypto"]).issubset(
                set(DEFAULT_MOVER_UNIVERSE_BY_CATEGORY["crypto"])
            )
        )
        self.assertIn("LTC/USD", recovered_payload["crypto"])
        self.assertEqual(
            search_service._dynamic_crypto_mover_universe_ttl_seconds,
            search_service._MOVER_UNIVERSE_REFRESH_TTL_SECONDS,
        )
