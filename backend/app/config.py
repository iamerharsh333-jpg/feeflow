import os
from decimal import Decimal
from typing import Optional

# Load .env file automatically if present
def load_dotenv_file():
    candidates = [
        os.path.join(os.getcwd(), ".env"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"),
    ]
    for env_path in candidates:
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'").strip('"')
                        if k and k not in os.environ:
                            os.environ[k] = v
            break

load_dotenv_file()

class Settings:
    PROJECT_NAME: str = "FeeFlow API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Database
    # Vercel serverless functions have a read-only application filesystem.
    # Use writable temporary storage for demo mode when no external DB is configured.
    _default_database_url = "sqlite:////tmp/feeflow.db" if os.getenv("VERCEL") == "1" else "sqlite:///./feeflow.db"
    DATABASE_URL: str = os.getenv("DATABASE_URL", _default_database_url)
    
    # Frontend URL / CORS Origins (supports comma-separated list of origins)
    FRONTEND_URL: Optional[str] = os.getenv("FRONTEND_URL", None)
    
    # JWT Auth
    JWT_SECRET: str = os.getenv("JWT_SECRET", "feeflow-super-secret-key-change-in-production-2026")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # AI / Gemini API Key
    GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY", None)
    
    # Payments (Razorpay or Mock)
    PAYMENT_MODE: str = os.getenv("PAYMENT_MODE", "mock")  # "mock" or "razorpay"
    PAYMENT_GATEWAY_KEY: str = os.getenv("PAYMENT_GATEWAY_KEY", "rzp_test_mock_key")
    PAYMENT_GATEWAY_SECRET: str = os.getenv("PAYMENT_GATEWAY_SECRET", "rzp_test_mock_secret")
    
    # SMS / WhatsApp / OTP Providers
    OTP_PROVIDER: str = os.getenv("OTP_PROVIDER", "mock")
    MESSAGE_PROVIDER: str = os.getenv("MESSAGE_PROVIDER", "mock")
    
    # Taxation (Configurable GST rate percentage)
    GST_RATE: Decimal = Decimal(os.getenv("GST_RATE", "18.0"))

    # Worker & Automation Execution
    STANDALONE_WORKER_MODE: bool = os.getenv("STANDALONE_WORKER_MODE", "true").lower() in ("true", "1", "yes")
    REMINDER_INTERVAL_MINUTES: int = int(os.getenv("REMINDER_INTERVAL_MINUTES", "5"))
    RISK_SCAN_INTERVAL_HOURS: int = int(os.getenv("RISK_SCAN_INTERVAL_HOURS", "24"))
    JOB_LOCK_LEASE_SECONDS: int = int(os.getenv("JOB_LOCK_LEASE_SECONDS", "300"))

settings = Settings()
