import os
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
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./feeflow.db")
    
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
    GST_RATE: float = float(os.getenv("GST_RATE", "18.0"))

settings = Settings()
