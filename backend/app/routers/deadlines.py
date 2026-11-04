import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func

from app.database import get_db
from app.models import Instalment, Student, Centre, Reminder, CounsellorTask, User, UserRole
from app.auth import get_current_user
from app.services.reminders import get_kolkata_today

router = APIRouter(prefix="/deadlines", tags=["Deadline Management & Visibility"])


class DeadlineItemResponse(BaseModel):
    instalment_id: str
    instalment_number: int
    student_id: str
    student_name: str
    course: str
    batch: str
    centre_id: int
    centre_name: str
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    due_date: datetime.date
    amount: float
    paid_amount: float
    outstanding_balance: float
    status: str
    days_remaining: int
    overdue_days: int
    category: str
    reminders_sent: int
    last_reminder_date: Optional[datetime.date] = None

    class Config:
        from_attributes = True


class DeadlinesSummaryResponse(BaseModel):
    due_today_count: int
    due_in_3d_count: int
    due_in_7d_count: int
    overdue_count: int
    total_upcoming_amount: float
    total_overdue_amount: float


class CounsellorDeadlineItem(BaseModel):
    task_id: int
    student_id: str
    student_name: str
    course: str
    batch: str
    centre_name: str
    risk_level: str
    risk_score: float
    priority: str
    due_date: Optional[datetime.date] = None
    status: str
    days_remaining: int
    overdue_days: int
    notes: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True


def compute_category(due_date: datetime.date, today: datetime.date) -> str:
    if due_date < today:
        return "overdue"
    elif due_date == today:
        return "due_today"
    elif (due_date - today).days <= 3:
        return "due_in_3d"
    elif (due_date - today).days <= 7:
        return "due_in_7d"
    else:
        return "future"


@router.get("", response_model=List[DeadlineItemResponse])
def get_deadlines(
    category: Optional[str] = Query(None, description="due_in_7d, due_in_3d, due_today, overdue, upcoming, all"),
    centre_id: Optional[int] = Query(None),
    batch: Optional[str] = Query(None),
    from_date: Optional[datetime.date] = Query(None),
    to_date: Optional[datetime.date] = Query(None),
    payment_status: Optional[str] = Query(None, alias="status"),
    student_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Role-enforced visible deadlines:
    - Parent: Only own student's instalments.
    - Accounts executive: Only authorised centre's instalments.
    - Counsellor: Strictly forbidden from financial queries (403).
    - Admin: All authorised centres with multi-filtering.
    """
    # 1. Counsellors are prohibited from viewing financial ledgers
    if current_user.role == "counsellor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Counsellors do not have authorization to view student financial ledgers. Use /deadlines/counsellor for assigned tasks."
        )

    today = get_kolkata_today()

    query = db.query(Instalment).join(Student, Instalment.student_id == Student.id)

    # 2. Role-based isolation
    if current_user.role == "parent":
        linked_students = db.query(Student.id).filter(Student.parent_phone == current_user.identifier).all()
        linked_ids = [s[0] for s in linked_students]
        if not linked_ids:
            return []
        
        if student_id and student_id not in linked_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: You can only view deadlines for your linked student."
            )
        
        query = query.filter(Instalment.student_id.in_(linked_ids))

    elif current_user.role == "student":
        if student_id and student_id != current_user.identifier:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: You can only view your own instalment deadlines."
            )
        query = query.filter(Instalment.student_id == current_user.identifier)

    elif current_user.role in ["accounts_executive", "centre_manager"]:
        if not current_user.centre_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Staff user has no assigned centre."
            )
        if centre_id and centre_id != current_user.centre_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: You cannot view deadlines for other centres (assigned centre: {current_user.centre_id})."
            )
        query = query.filter(Student.centre_id == current_user.centre_id)

    elif current_user.role == "admin":
        if centre_id:
            query = query.filter(Student.centre_id == centre_id)

    # 3. Filters
    if student_id and current_user.role not in ["parent", "student"]:
        # Verify centre permission if staff
        if current_user.role in ["accounts_executive", "centre_manager"]:
            target_st = db.query(Student).filter(Student.id == student_id).first()
            if not target_st or target_st.centre_id != current_user.centre_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access forbidden: Target student does not belong to your centre."
                )
        query = query.filter(Instalment.student_id == student_id)

    if batch:
        query = query.filter(Student.batch == batch)

    if from_date:
        query = query.filter(Instalment.due_date >= from_date)
    if to_date:
        query = query.filter(Instalment.due_date <= to_date)

    if payment_status:
        query = query.filter(Instalment.status == payment_status)

    # 4. Category filtering
    if category == "due_today":
        query = query.filter(
            Instalment.due_date == today,
            Instalment.status != "Paid",
            Instalment.paid_amount < Instalment.amount
        )
    elif category == "due_in_3d":
        query = query.filter(
            Instalment.due_date > today,
            Instalment.due_date <= today + datetime.timedelta(days=3),
            Instalment.status != "Paid",
            Instalment.paid_amount < Instalment.amount
        )
    elif category == "due_in_7d":
        query = query.filter(
            Instalment.due_date > today,
            Instalment.due_date <= today + datetime.timedelta(days=7),
            Instalment.status != "Paid",
            Instalment.paid_amount < Instalment.amount
        )
    elif category == "overdue":
        query = query.filter(
            Instalment.due_date < today,
            Instalment.status != "Paid",
            Instalment.paid_amount < Instalment.amount
        )
    elif category == "upcoming":
        query = query.filter(
            Instalment.due_date >= today,
            Instalment.status != "Paid",
            Instalment.paid_amount < Instalment.amount
        )

    # Order by due date ascending
    instalments = query.order_by(Instalment.due_date.asc()).offset(offset).limit(limit).all()

    # Pre-fetch reminder statistics for these instalments
    inst_ids = [ins.id for ins in instalments]
    reminder_counts = {}
    last_reminder_dates = {}
    if inst_ids:
        rem_stats = db.query(
            Reminder.instalment_id,
            func.count(Reminder.id),
            func.max(Reminder.scheduled_date)
        ).filter(
            Reminder.instalment_id.in_(inst_ids),
            Reminder.status == "Sent"
        ).group_by(Reminder.instalment_id).all()
        for r_id, count, max_date in rem_stats:
            reminder_counts[r_id] = count
            last_reminder_dates[r_id] = max_date

    results = []
    for ins in instalments:
        st = ins.student
        c_name = st.centre.name if st.centre else "Unknown Centre"
        bal = max(0.0, float(ins.amount - ins.paid_amount))
        
        if ins.due_date < today:
            days_rem = 0
            ov_days = (today - ins.due_date).days
        else:
            days_rem = (ins.due_date - today).days
            ov_days = 0

        cat = compute_category(ins.due_date, today)

        # Parent details exposure rule:
        # Accounts/Admin can see parent phone and name
        # Parent sees own details
        # In other cases, protect
        parent_p = st.parent_phone if current_user.role in ["admin", "accounts_executive", "centre_manager", "parent"] else None
        parent_n = st.parent_name if current_user.role in ["admin", "accounts_executive", "centre_manager", "parent"] else None

        results.append(DeadlineItemResponse(
            instalment_id=ins.id,
            instalment_number=ins.instalment_number,
            student_id=st.id,
            student_name=st.name,
            course=st.course,
            batch=st.batch,
            centre_id=st.centre_id,
            centre_name=c_name,
            parent_name=parent_n,
            parent_phone=parent_p,
            due_date=ins.due_date,
            amount=float(ins.amount),
            paid_amount=float(ins.paid_amount),
            outstanding_balance=bal,
            status=ins.status,
            days_remaining=days_rem,
            overdue_days=ov_days,
            category=cat,
            reminders_sent=reminder_counts.get(ins.id, 0),
            last_reminder_date=last_reminder_dates.get(ins.id)
        ))

    return results


@router.get("/summary", response_model=DeadlinesSummaryResponse)
def get_deadlines_summary(
    centre_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Summary counters for deadline dashboards and role-tailored KPI banners.
    """
    if current_user.role == "counsellor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Counsellors do not have authorization to view financial summary metrics."
        )

    today = get_kolkata_today()

    query = db.query(Instalment).join(Student, Instalment.student_id == Student.id)

    # Permission scoping
    if current_user.role == "parent":
        linked_students = db.query(Student.id).filter(Student.parent_phone == current_user.identifier).all()
        linked_ids = [s[0] for s in linked_students]
        if not linked_ids:
            return DeadlinesSummaryResponse(
                due_today_count=0, due_in_3d_count=0, due_in_7d_count=0,
                overdue_count=0, total_upcoming_amount=0.0, total_overdue_amount=0.0
            )
        query = query.filter(Instalment.student_id.in_(linked_ids))

    elif current_user.role == "student":
        query = query.filter(Instalment.student_id == current_user.identifier)

    elif current_user.role in ["accounts_executive", "centre_manager"]:
        if not current_user.centre_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No assigned centre.")
        query = query.filter(Student.centre_id == current_user.centre_id)

    elif current_user.role == "admin":
        if centre_id:
            query = query.filter(Student.centre_id == centre_id)

    # Only consider active unpaid or partially paid instalments
    unpaid_query = query.filter(
        Instalment.status != "Paid",
        Instalment.paid_amount < Instalment.amount
    )

    all_unpaid = unpaid_query.all()

    due_today_count = 0
    due_in_3d_count = 0
    due_in_7d_count = 0
    overdue_count = 0
    total_upcoming_amount = 0.0
    total_overdue_amount = 0.0

    for ins in all_unpaid:
        bal = max(0.0, float(ins.amount - ins.paid_amount))
        if ins.due_date < today:
            overdue_count += 1
            total_overdue_amount += bal
        else:
            total_upcoming_amount += bal
            if ins.due_date == today:
                due_today_count += 1
            elif (ins.due_date - today).days <= 3:
                due_in_3d_count += 1
            elif (ins.due_date - today).days <= 7:
                due_in_7d_count += 1

    return DeadlinesSummaryResponse(
        due_today_count=due_today_count,
        due_in_3d_count=due_in_3d_count,
        due_in_7d_count=due_in_7d_count,
        overdue_count=overdue_count,
        total_upcoming_amount=round(total_upcoming_amount, 2),
        total_overdue_amount=round(total_overdue_amount, 2)
    )


@router.get("/counsellor", response_model=List[CounsellorDeadlineItem])
def get_counsellor_deadlines(
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns assigned retention and follow-up tasks with deadlines for Counsellors.
    Zero parent contact or financial details are exposed.
    """
    if current_user.role not in ["counsellor", "admin", "centre_manager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Only counsellors and administrators can view retention tasks."
        )

    today = get_kolkata_today()

    query = db.query(CounsellorTask).join(Student, CounsellorTask.student_id == Student.id)

    if current_user.role == "counsellor":
        if current_user.centre_id:
            query = query.filter(Student.centre_id == current_user.centre_id)

    if status_filter:
        query = query.filter(CounsellorTask.status == status_filter)

    tasks = query.order_by(CounsellorTask.due_date.asc().nullslast()).all()

    results = []
    for t in tasks:
        st = t.student
        c_name = st.centre.name if st.centre else "Jaipur Main"
        
        if t.due_date:
            if t.due_date < today:
                d_rem = 0
                ov_days = (today - t.due_date).days
            else:
                d_rem = (t.due_date - today).days
                ov_days = 0
        else:
            d_rem = 0
            ov_days = 0

        results.append(CounsellorDeadlineItem(
            task_id=t.id,
            student_id=st.id,
            student_name=st.name,
            course=st.course,
            batch=st.batch,
            centre_name=c_name,
            risk_level=t.risk_level,
            risk_score=float(t.risk_score),
            priority=t.priority,
            due_date=t.due_date,
            status=t.status,
            days_remaining=d_rem,
            overdue_days=ov_days,
            notes=t.notes,
            created_at=t.created_at
        ))

    return results

