import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Student, Payment, Centre, User, Instalment
from app.schemas import DashboardSummary
from app.auth import require_role
from app.services.fees import get_student_fee_summary
from app.services.currency import to_decimal, round_currency, ZERO, PAISE, ONE_HUNDRED

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

def resolve_effective_centre(centre_id: Optional[int], current_user: User) -> Optional[int]:
    if current_user.role == "accounts_executive" and current_user.centre_id:
        if centre_id and centre_id != current_user.centre_id:
            raise HTTPException(status_code=403, detail="Forbidden: You cannot access metrics for another centre.")
        return current_user.centre_id
    return centre_id

@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary(
    centre_id: Optional[int] = Query(None),
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    eff_centre_id = resolve_effective_centre(centre_id, current_user)

    query = db.query(Student)
    if eff_centre_id:
        query = query.filter(Student.centre_id == eff_centre_id)

    students = query.all()
    total_students = len(students)

    total_fee = ZERO
    total_collected = ZERO
    total_outstanding = ZERO
    total_overdue = ZERO
    overdue_students_count = 0

    today = datetime.date.today()

    for s in students:
        summary = get_student_fee_summary(s, db)
        total_fee += to_decimal(summary["effective_fee"])
        total_collected += to_decimal(summary["amount_paid"])
        total_outstanding += to_decimal(summary["outstanding_amount"])

        overdue_insts = [
            i for i in s.instalments
            if i.status != "Paid" and i.due_date < today
        ]
        if overdue_insts:
            overdue_students_count += 1
            for i in overdue_insts:
                total_overdue += (to_decimal(i.amount) - to_decimal(i.paid_amount))

    collection_rate = 0.0
    if total_fee > ZERO:
        collection_rate = float(round((total_collected / total_fee) * ONE_HUNDRED, 1))
    elif total_collected + total_outstanding > ZERO:
        collection_rate = float(round((total_collected / (total_collected + total_outstanding)) * ONE_HUNDRED, 1))

    unmatched_query = db.query(Payment).filter(Payment.status.in_(["Unmatched", "Under Review"]))
    if eff_centre_id:
        unmatched_query = unmatched_query.filter(
            (Payment.centre_id == eff_centre_id) | (Payment.centre_id == None)
        )
    unmatched_count = unmatched_query.count()

    # Trigger reconciliation backlog alert if unmatched payments require action
    if unmatched_count > 0:
        try:
            from app.services.notifications import notify_reconciliation_backlog
            notify_reconciliation_backlog(db=db, centre_id=eff_centre_id, count=unmatched_count)
            db.commit()
        except Exception:
            pass

    return {
        "total_students": total_students,
        "total_fee": float(total_fee),
        "fees_collected": float(total_collected),
        "outstanding_fees": float(total_outstanding),
        "overdue_fees": float(total_overdue),
        "collection_rate": collection_rate,
        "overdue_students_count": overdue_students_count,
        "unmatched_payments_count": unmatched_count
    }

@router.get("/monthly")
def get_monthly_collections(
    centre_id: Optional[int] = Query(None),
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    eff_centre_id = resolve_effective_centre(centre_id, current_user)

    # 1. Fetch successful payments
    p_query = db.query(Payment).filter(Payment.status == "Success")
    if eff_centre_id:
        p_query = p_query.filter(Payment.centre_id == eff_centre_id)
    payments = p_query.all()

    # 2. Fetch scheduled instalments for target calculation
    i_query = db.query(Instalment)
    if eff_centre_id:
        i_query = i_query.join(Student).filter(Student.centre_id == eff_centre_id)
    instalments = i_query.all()

    # Academic year months (Apr through Nov)
    month_names = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"]

    # Aggregate collected by month in Decimal
    collected_map: Dict[str, Decimal] = {m: ZERO for m in month_names}
    for p in payments:
        m_abbr = p.payment_date.strftime("%b")
        if m_abbr in collected_map:
            collected_map[m_abbr] += to_decimal(p.amount)

    # Aggregate target by instalment due dates in Decimal
    target_map: Dict[str, Decimal] = {m: ZERO for m in month_names}
    for ins in instalments:
        m_abbr = ins.due_date.strftime("%b")
        if m_abbr in target_map:
            target_map[m_abbr] += to_decimal(ins.amount)

    result = []
    for m in month_names:
        c_val = collected_map[m]
        t_val = target_map[m]
        # If no instalment is due in that month, target reflects collected or baseline
        if t_val == ZERO and c_val > ZERO:
            t_val = round_currency(c_val * Decimal("1.10"))
        result.append({
            "month": m,
            "collected": float(c_val),
            "target": float(t_val)
        })

    return result

@router.get("/centre-wise")
def get_centre_wise_collections(
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    query = db.query(Centre)
    if current_user.role == "accounts_executive" and current_user.centre_id:
        query = query.filter(Centre.id == current_user.centre_id)

    centres = query.all()
    results = []
    today = datetime.date.today()

    for c in centres:
        c_students = db.query(Student).filter(Student.centre_id == c.id).all()
        collected = ZERO
        outstanding = ZERO
        overdue = ZERO
        for s in c_students:
            sum_res = get_student_fee_summary(s, db)
            collected += to_decimal(sum_res["amount_paid"])
            outstanding += to_decimal(sum_res["outstanding_amount"])
            for ins in s.instalments:
                if ins.status != "Paid" and ins.due_date < today:
                    overdue += (to_decimal(ins.amount) - to_decimal(ins.paid_amount))

        total = collected + outstanding
        rate = float(round((collected / total * ONE_HUNDRED), 1)) if total > ZERO else 0.0
        results.append({
            "centre_id": c.id,
            "centre": c.name,
            "students": len(c_students),
            "collected": float(collected),
            "outstanding": float(outstanding),
            "overdue": float(overdue),
            "collection_rate": rate
        })
    return results

@router.get("/batch-wise")
def get_batch_wise_collections(
    centre_id: Optional[int] = Query(None),
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    eff_centre_id = resolve_effective_centre(centre_id, current_user)

    query = db.query(Student)
    if eff_centre_id:
        query = query.filter(Student.centre_id == eff_centre_id)
    students = query.all()

    today = datetime.date.today()
    batches: Dict[str, Dict[str, Any]] = {}

    for s in students:
        key = f"{s.course} — {s.batch}"
        if key not in batches:
            batches[key] = {
                "course": s.course,
                "batch": s.batch,
                "label": key,
                "students": 0,
                "collected": ZERO,
                "outstanding": ZERO,
                "overdue": ZERO
            }

        sum_res = get_student_fee_summary(s, db)
        batches[key]["students"] += 1
        batches[key]["collected"] += to_decimal(sum_res["amount_paid"])
        batches[key]["outstanding"] += to_decimal(sum_res["outstanding_amount"])

        for ins in s.instalments:
            if ins.status != "Paid" and ins.due_date < today:
                batches[key]["overdue"] += (to_decimal(ins.amount) - to_decimal(ins.paid_amount))

    res = []
    for b in batches.values():
        res.append({
            "course": b["course"],
            "batch": b["batch"],
            "label": b["label"],
            "students": b["students"],
            "collected": float(b["collected"]),
            "outstanding": float(b["outstanding"]),
            "overdue": float(b["overdue"])
        })
    return res

@router.get("/ageing")
def get_overdue_ageing(
    centre_id: Optional[int] = Query(None),
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    eff_centre_id = resolve_effective_centre(centre_id, current_user)

    today = datetime.date.today()
    query = db.query(Student)
    if eff_centre_id:
        query = query.filter(Student.centre_id == eff_centre_id)
    students = query.all()

    # Buckets: "Not Due", "1–30 days", "31–60 days", "Over 60 days"
    not_due_amt, not_due_cnt = ZERO, 0
    b1_amt, b1_cnt = ZERO, 0 # 1-30 days
    b2_amt, b2_cnt = ZERO, 0 # 31-60 days
    b3_amt, b3_cnt = ZERO, 0 # > 60 days

    for s in students:
        for ins in s.instalments:
            if ins.status == "Paid":
                continue
            due_amt = to_decimal(ins.amount) - to_decimal(ins.paid_amount)
            if due_amt <= ZERO:
                continue

            if ins.due_date >= today:
                not_due_amt += due_amt
                not_due_cnt += 1
            else:
                overdue_days = (today - ins.due_date).days
                if overdue_days <= 30:
                    b1_amt += due_amt
                    b1_cnt += 1
                elif overdue_days <= 60:
                    b2_amt += due_amt
                    b2_cnt += 1
                else:
                    b3_amt += due_amt
                    b3_cnt += 1

    return [
        {"bucket": "Not Due", "amount": float(not_due_amt), "count": not_due_cnt},
        {"bucket": "1–30 days", "amount": float(b1_amt), "count": b1_cnt},
        {"bucket": "31–60 days", "amount": float(b2_amt), "count": b2_cnt},
        {"bucket": "Over 60 days", "amount": float(b3_amt), "count": b3_cnt},
    ]
