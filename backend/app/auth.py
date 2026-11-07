import re
import datetime
import bcrypt
import jwt
from typing import Optional, List, Dict
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import User, Student

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/token", auto_error=False)

def normalize_phone(phone: str) -> str:
    cleaned = re.sub(r"[^\d]", "", (phone or "").strip())
    if len(cleaned) == 12 and cleaned.startswith("91"):
        cleaned = cleaned[2:]
    elif len(cleaned) == 11 and cleaned.startswith("0"):
        cleaned = cleaned[1:]
    return cleaned

DEMO_PARENT_OTPS: Dict[str, str] = {
    "9876543210": "123456",
    "9123456789": "654321",
    "9988776655": "111222",
    "9654321098": "123456",
    "9712345678": "123456",
    "9822334455": "123456",
}

# In-memory OTP store with rate limiting: phone -> {otp: str, expires_at: datetime, attempts: int, requested_at: datetime}
_init_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=60)
OTP_STORE: Dict[str, dict] = {
    "9876543210": {"otp": "123456", "expires_at": datetime.datetime.max.replace(tzinfo=datetime.timezone.utc), "attempts": 0, "requested_at": _init_time},
    "9123456789": {"otp": "654321", "expires_at": datetime.datetime.max.replace(tzinfo=datetime.timezone.utc), "attempts": 0, "requested_at": _init_time},
    "9988776655": {"otp": "111222", "expires_at": datetime.datetime.max.replace(tzinfo=datetime.timezone.utc), "attempts": 0, "requested_at": _init_time},
}

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    to_encode = data.copy()
    now = datetime.datetime.now(datetime.timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + datetime.timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except Exception:
        return None

def send_mock_otp(phone: str) -> str:
    norm_phone = normalize_phone(phone)
    now = datetime.datetime.now(datetime.timezone.utc)
    # Check rate limit (1 request per 10 seconds)
    if norm_phone in OTP_STORE:
        rec = OTP_STORE[norm_phone]
        if (now - rec["requested_at"]).total_seconds() < 10:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Please wait 10 seconds before requesting another OTP."
            )

    # Pre-seeded demo OTPs preserved
    if norm_phone in DEMO_PARENT_OTPS:
        otp = DEMO_PARENT_OTPS[norm_phone]
        expires_at = datetime.datetime.max.replace(tzinfo=datetime.timezone.utc)
    else:
        import random
        otp = f"{random.randint(100000, 999999)}"
        expires_at = now + datetime.timedelta(minutes=15)

    OTP_STORE[norm_phone] = {
        "otp": otp,
        "expires_at": expires_at,
        "attempts": 0,
        "requested_at": now
    }
    return otp

def verify_mock_otp(phone: str, otp: str) -> bool:
    norm_phone = normalize_phone(phone)
    clean_otp = (otp or "").strip()
    if not clean_otp:
        return False

    # 1. Demo accounts support permanent demo OTP (123456 or designated demo code)
    if norm_phone in DEMO_PARENT_OTPS:
        if clean_otp == DEMO_PARENT_OTPS[norm_phone] or clean_otp == "123456":
            if norm_phone in OTP_STORE:
                OTP_STORE[norm_phone]["attempts"] = 0
            return True
        # Explicitly wrong OTP for demo account must still be rejected
        return False

    # 2. General in-memory OTP store verification
    if norm_phone not in OTP_STORE:
        return False

    rec = OTP_STORE[norm_phone]
    now = datetime.datetime.now(datetime.timezone.utc)

    if now > rec["expires_at"]:
        return False

    rec["attempts"] += 1
    if rec["attempts"] > 10:
        return False

    return rec["otp"] == clean_otp

def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    identifier: str = payload.get("sub")
    role: str = payload.get("role")
    if not identifier or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token payload",
        )

    # Check if user exists in database
    user = db.query(User).filter(User.identifier == identifier).first()
    if not user:
        # Check if student exists for student/parent roles
        student = db.query(Student).filter(
            (Student.id == identifier) | (Student.parent_phone == identifier)
        ).first()
        if student:
            # Synthetic user object for valid authenticated student/parent session
            user = User(
                identifier=identifier,
                full_name=student.name if role == "student" else student.parent_name,
                role=role,
                centre_id=student.centre_id,
                is_active=True
            )
        else:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user

def require_role(*allowed_roles: str):
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles and current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires one of {allowed_roles}"
            )
        return current_user
    return role_checker

