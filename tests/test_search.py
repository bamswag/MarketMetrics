import unittest
from unittest.mock import patch

from app.services.search import get_symbol_asset_class, get_symbol_metadata

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


class SearchServiceTests(unittest.TestCase):
    def test_crypto_alias_lookup_resolves_to_catalog_symbol(self):
        metadata = get_symbol_metadata("BTCUSD")

        self.assertIsNotNone(metadata)
        self.assertEqual(metadata["symbol"], "BTC/USD")
        self.assertEqual(get_symbol_asset_class("BTCUSD"), "crypto")
