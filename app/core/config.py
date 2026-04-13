import os
from pathlib import Path

from dotenv import find_dotenv, load_dotenv


load_dotenv(find_dotenv(), override=False)


class Settings:
    @property
    def project_root(self) -> Path:
        return Path(__file__).resolve().parents[2]

    @property
    def database_url(self) -> str:
        return os.getenv("DATABASE_URL", "sqlite:///./marketmetrics.db")

    @property
    def jwt_secret(self) -> str:
        return os.getenv("JWT_SECRET", "change-me")

    @property
    def jwt_algorithm(self) -> str:
        return os.getenv("JWT_ALGORITHM", "HS256")

    @property
    def access_token_expire_minutes(self) -> int:
        return int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

    @property
    def frontend_base_url(self) -> str:
        return os.getenv("FRONTEND_BASE_URL", "http://127.0.0.1:5173")

    @property
    def google_client_id(self) -> str:
        return os.getenv("GOOGLE_CLIENT_ID", "")

    @property
    def google_client_secret(self) -> str:
        return os.getenv("GOOGLE_CLIENT_SECRET", "")

    @property
    def google_oauth_redirect_uri(self) -> str:
        return os.getenv(
            "GOOGLE_OAUTH_REDIRECT_URI",
            "http://127.0.0.1:8000/auth/google/callback",
        )

    @property
    def alpaca_api_key(self) -> str:
        return os.getenv("ALPACA_API_KEY", "")

    @property
    def alpaca_secret_key(self) -> str:
        return os.getenv("ALPACA_SECRET_KEY", "")

    @property
    def alpaca_data_feed(self) -> str:
        return os.getenv("ALPACA_DATA_FEED", "iex")

    @property
    def alpaca_data_base_url(self) -> str:
        return os.getenv("ALPACA_DATA_BASE_URL", "https://data.alpaca.markets")

    @property
    def alpaca_trading_base_url(self) -> str:
        return os.getenv("ALPACA_TRADING_BASE_URL", "https://paper-api.alpaca.markets")

    @property
    def symbol_catalog_path(self) -> Path:
        raw_path = os.getenv("SYMBOL_CATALOG_PATH", "data/symbol_catalog.json")
        return (self.project_root / raw_path).resolve()

    @property
    def prediction_model_dir(self) -> Path:
        raw_path = os.getenv("PREDICTION_MODEL_DIR", "artifacts/prediction")
        return (self.project_root / raw_path).resolve()

    @property
    def prediction_training_lookback_days(self) -> int:
        return int(os.getenv("PREDICTION_TRAINING_LOOKBACK_DAYS", "1825"))

    @property
    def market_data_default_history_days(self) -> int:
        return int(os.getenv("MARKET_DATA_DEFAULT_HISTORY_DAYS", "3650"))

    @property
    def prediction_fetch_concurrency(self) -> int:
        return int(os.getenv("PREDICTION_FETCH_CONCURRENCY", "5"))

    @property
    def sendgrid_api_key(self) -> str:
        return os.getenv("SENDGRID_API_KEY", "")

    @property
    def email_from_address(self) -> str:
        return os.getenv("EMAIL_FROM_ADDRESS", "noreply@marketmetrics.app")

    @property
    def password_reset_token_expire_minutes(self) -> int:
        return int(os.getenv("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", "60"))

    @property
    def email_verification_token_expire_minutes(self) -> int:
        return int(os.getenv("EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES", "1440"))

    @property
    def prediction_training_universe(self) -> list[str]:
        raw_value = os.getenv("PREDICTION_TRAINING_UNIVERSE", "")
        if not raw_value.strip():
            return []
        return [symbol.strip().upper() for symbol in raw_value.split(",") if symbol.strip()]

    @property
    def prediction_training_universe_path(self) -> Path:
        raw_path = os.getenv("PREDICTION_TRAINING_UNIVERSE_PATH", "data/training_universe.json")
        return (self.project_root / raw_path).resolve()


settings = Settings()
