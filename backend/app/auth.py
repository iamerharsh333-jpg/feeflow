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

# In-memory OTP store with rate limiting: phone -> {otp: str, expires_at: datetime, attempts: int, requested_at: datetime}
OTP_STORE: Dict[str, dict] = {
    "9876543210": {"otp": "123456", "expires_at": datetime.datetime.max.replace(tzinfo=datetime.timezone.utc), "attempts": 0, "requested_at": datetime.datetime.now(datetime.timezone.utc)},
    "9123456789": {"otp": "654321", "expires_at": datetime.datetime.max.replace(tzinfo=datetime.timezone.utc), "attempts": 0, "requested_at": datetime.datetime.now(datetime.timezone.utc)},
    "9988776655": {"otp": "111222", "expires_at": datetime.datetime.max.replace(tzinfo=datetime.timezone.utc), "attempts": 0, "requested_at": datetime.datetime.now(datetime.timezone.utc)},
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
    now = datetime.datetime.now(datetime.timezone.utc)
    # Check rate limit (1 request per 10 seconds)
    if phone in OTP_STORE:
        rec = OTP_STORE[phone]
        if (now - rec["requested_at"]).total_seconds() < 10:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Please wait 10 seconds before requesting another OTP."
            )
    
    # Pre-seeded demo OTPs preserved
    if phone == "9876543210":
        otp = "123456"
    elif phone == "9123456789":
        otp = "654321"
    elif phone == "9988776655":
        otp = "111222"
    else:
        import random
        otp = f"{random.randint(100000, 999999)}"

    expires_at = now + datetime.timedelta(minutes=5)
    OTP_STORE[phone] = {
        "otp": otp,
        "expires_at": expires_at,
        "attempts": 0,
        "requested_at": now
    }
    return otp

def verify_mock_otp(phone: str, otp: str) -> bool:
    if phone not in OTP_STORE:
        return False
    rec = OTP_STORE[phone]
    now = datetime.datetime.now(datetime.timezone.utc)
    
    if now > rec["expires_at"]:
        return False
        
    rec["attempts"] += 1
    if rec["attempts"] > 5:
        # Rate limit maximum attempts
        del OTP_STORE[phone]
        return False

    return rec["otp"] == otp.strip()

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

