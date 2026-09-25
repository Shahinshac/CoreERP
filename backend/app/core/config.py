from typing import List, Union
from pydantic import field_validator, model_validator
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
    AUTOMATION_KEY: str = "insecure-automation-secret-change-in-production"
    RATE_LIMIT_ENABLED: bool = True

    # Supabase Integration (Legacy Storage Provider — dual-provider transition)
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # Cloudinary Integration (Primary Server-side Storage Provider — never exposed to frontend)
    CLOUDINARY_URL: str = ""
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    # Seller GST & Billing Configuration (Indian GST Statutory Defaults)
    SELLER_NAME: str = "My Retail Store Pvt Ltd"
    SELLER_GSTIN: str = "27ABCDE1234F1Z5"
    SELLER_STATE: str = "Maharashtra"
    SELLER_STATE_CODE: str = "27"
    SELLER_ADDRESS: str = "123 Commercial Hub, MG Road, Mumbai, Maharashtra 400001"
    SELLER_PHONE: str = "+91 9876543210"
    SELLER_EMAIL: str = "billing@myretailstore.com"
    SELLER_UPI_ID: str = "retailstore@upi"
    SELLER_UPI_NAME: str = "My Retail Store"

    # Brevo Transactional Email Configuration (Free-tier HTTP API)
    BREVO_API_KEY: str = ""
    EMAIL_FROM: str = "no-reply@myretailstore.com"
    EMAIL_FROM_NAME: str = "My Retail Store"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.strip().startswith("[") and v.strip().endswith("]"):
                import json
                try:
                    v = json.loads(v)
                except Exception:
                    pass
        if isinstance(v, str):
            origins = [origin.strip().rstrip("/") for origin in v.split(",") if origin.strip()]
        else:
            origins = [str(origin).strip().rstrip("/") for origin in v if str(origin).strip()]
        # In credentialed CORS, wildcard '*' is forbidden by browsers and FastAPI CORSMiddleware
        return [o for o in origins if o != "*"]

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.ENVIRONMENT.lower() == "production":
            if "insecure" in self.JWT_SECRET.lower():
                raise ValueError("JWT_SECRET must be set to a secure secret in production.")
            if "insecure" in self.AUTOMATION_KEY.lower():
                raise ValueError("AUTOMATION_KEY must be set to a secure secret in production.")
        return self


settings = Settings()
