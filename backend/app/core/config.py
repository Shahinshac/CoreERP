from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    ENVIRONMENT: str = "development"
    PROJECT_NAME: str = "ERP Backend"

    # Database & Supabase Pooler Configuration
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/erp"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 2
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 300
    DB_POOL_PRE_PING: bool = True

    # CORS Origins
    CORS_ORIGINS: Union[List[str], str] = ["http://localhost:5173", "http://localhost:3000"]

    # Auth & Secrets
    JWT_SECRET: str = "insecure-dev-secret-change-in-production"

    # Supabase Integration
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.strip().startswith("[") and v.strip().endswith("]"):
                # Let pydantic default json parser handle if passed as json array
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


settings = Settings()
