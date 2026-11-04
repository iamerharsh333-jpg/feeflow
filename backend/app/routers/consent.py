import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import ParentalConsent, Student, User
from app.schemas import ParentalConsentCreate, ParentalConsentResponse
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/consent", tags=["Parental Consent"])

@router.post("", response_model=ParentalConsentResponse, status_code=status.HTTP_201_CREATED)
def record_parental_consent(
    body: ParentalConsentCreate,
    current_user: User = Depends(require_role("parent", "accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == body.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    consent = ParentalConsent(
        student_id=body.student_id,
        parent_phone=body.parent_phone,
        consent_type=body.consent_type,
        verified=True,
        verified_at=datetime.datetime.now(datetime.timezone.utc),
        ip_address=body.ip_address,
        notes=body.notes
    )
    db.add(consent)
    db.commit()
    db.refresh(consent)
    return consent

@router.get("/{student_id}")
def check_parental_consent(
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    consents = db.query(ParentalConsent).filter(ParentalConsent.student_id == student_id).all()
    has_valid_consent = any(c.verified for c in consents)

    return {
        "student_id": student_id,
        "parental_consent_verified": has_valid_consent,
        "consent_count": len(consents),
        "records": [
            {
                "id": c.id,
                "type": c.consent_type,
                "verified_at": c.verified_at,
                "parent_phone": c.parent_phone
            }
            for c in consents
        ]
    }

