from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "霸霸精准流量获取工具"
    api_prefix: str = "/api"
    database_url: str = "sqlite:///./lead_ops.db"

    model_config = SettingsConfigDict(env_prefix="LEAD_OPS_", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
