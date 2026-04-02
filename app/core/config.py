import os


class Settings:
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
    def alpha_vantage_api_key(self) -> str:
        return os.getenv("ALPHA_VANTAGE_API_KEY", "")


settings = Settings()
