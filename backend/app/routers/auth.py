from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Student
from app.schemas import PasswordLoginRequest, OTPLoginRequest, SendOTPRequest, Token
from app.auth import (
    verify_password, create_access_token, send_mock_otp,
    verify_mock_otp, get_current_user
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/send-otp")
def request_otp(body: SendOTPRequest, db: Session = Depends(get_db)):
    phone = body.phone.strip()
    student = db.query(Student).filter(Student.parent_phone == phone).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Phone number not registered to any student account."
        )
    otp = send_mock_otp(phone)
    return {
        "message": f"Demo OTP generated for {phone}",
        "demo_otp": otp, # clearly identified as demo
        "expires_in_minutes": 5
    }

@router.post("/verify-otp", response_model=Token)
def verify_otp_login(body: OTPLoginRequest, db: Session = Depends(get_db)):
    phone = body.phone.strip()
    if not verify_mock_otp(phone, body.otp):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP."
        )
    
    student = db.query(Student).filter(Student.parent_phone == phone).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found for this parent.")

    token = create_access_token({
        "sub": phone,
        "role": "parent",
        "student_id": student.id,
        "name": student.parent_name,
        "centre_id": student.centre_id
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": "parent",
        "name": student.parent_name,
        "identifier": phone,
        "centre_id": student.centre_id,
        "student_id": student.id
    }

@router.post("/login", response_model=Token)
def password_login(body: PasswordLoginRequest, db: Session = Depends(get_db)):
    identifier = body.identifier.strip()
    
    # 1. Check if user is staff (Accounts / Admin)
    user = db.query(User).filter(User.identifier.ilike(identifier)).first()
    if user:
        if not user.hashed_password or not verify_password(body.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password.")
        token = create_access_token({
            "sub": user.identifier,
            "role": user.role,
            "name": user.full_name,
            "centre_id": user.centre_id
        })
        return {
            "access_token": token,
            "token_type": "bearer",
            "role": user.role,
            "name": user.full_name,
            "identifier": user.identifier,
            "centre_id": user.centre_id,
            "student_id": None
        }

    # 2. Check if student login (ID or roll number or mobile with Student@123)
    student = db.query(Student).filter(
        (Student.id.ilike(identifier)) |
        (Student.roll_number.ilike(identifier)) |
        (Student.parent_phone == identifier)
    ).first()
    
    if student:
        # Check password against User record or demo default
        student_user = db.query(User).filter(User.identifier == student.id).first()
        valid = False
        if student_user and student_user.hashed_password:
            valid = verify_password(body.password, student_user.hashed_password)
        elif body.password == "Student@123":
            valid = True
            
        if not valid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid student password.")
            
        token = create_access_token({
            "sub": student.id,
            "role": "student",
            "name": student.name,
            "centre_id": student.centre_id,
            "student_id": student.id
        })
        return {
            "access_token": token,
            "token_type": "bearer",
            "role": "student",
            "name": student.name,
            "identifier": student.id,
            "centre_id": student.centre_id,
            "student_id": student.id
        }

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid identifier or credentials.")

@router.get("/me")
def get_current_user_profile(user: User = Depends(get_current_user)):
    return {
        "identifier": user.identifier,
        "name": user.full_name,
        "role": user.role,
        "centre_id": user.centre_id
    }

