import datetime
from decimal import Decimal
from typing import List, Tuple
from sqlalchemy.orm import Session
from app.models import Student, Instalment, Discount

def calculate_overdue_days(due_date: datetime.date, status: str) -> int:
    if status == "Paid":
        return 0
    today = datetime.date.today()
    if today > due_date:
        return (today - due_date).days
    return 0

def refresh_instalment_statuses(instalments: List[Instalment], today: datetime.date = None):
    if today is None:
        today = datetime.date.today()
        
    for ins in instalments:
        amt = float(ins.amount)
        paid = float(ins.paid_amount)
        if paid >= amt and amt > 0:
            ins.status = "Paid"
        elif paid > 0 and paid < amt:
            ins.status = "Partially Paid"
        else: # paid == 0
            if today > ins.due_date:
                ins.status = "Overdue"
            elif (ins.due_date - today).days <= 15:
                ins.status = "Pending"
            else:
                ins.status = "Upcoming"

def get_student_fee_summary(student: Student, db: Session) -> dict:
    today = datetime.date.today()
    refresh_instalment_statuses(student.instalments, today)
    
    total_fee = float(student.total_fee)
    
    # Calculate discounts
    discounts = db.query(Discount).filter(Discount.student_id == student.id).all()
    total_discount = sum(float(d.amount) for d in discounts)
    effective_fee = max(0.0, total_fee - total_discount)
    
    total_paid = sum(float(i.paid_amount) for i in student.instalments)
    outstanding = max(0.0, effective_fee - total_paid)
    
    all_paid = len(student.instalments) > 0 and all(i.status == "Paid" for i in student.instalments)
    has_overdue = any(i.status == "Overdue" for i in student.instalments)
    has_partial = any(i.status == "Partially Paid" for i in student.instalments)
    
    if all_paid or outstanding == 0:
        fee_status = "Paid"
    elif has_overdue:
        fee_status = "Overdue"
    elif has_partial or total_paid > 0:
        fee_status = "Partially Paid"
    else:
        fee_status = "Pending"
        
    return {
        "total_fee": total_fee,
        "total_discount": total_discount,
        "effective_fee": effective_fee,
        "amount_paid": total_paid,
        "outstanding_amount": outstanding,
        "fee_status": fee_status,
        "instalments": student.instalments
    }

def create_default_instalments(
    student_id: str,
    total_fee: Decimal,
    enrollment_date: datetime.date,
    count: int = 4
) -> List[Instalment]:
    instalments = []
    base_amount = total_fee / Decimal(count)
    
    # 4 quarter dates starting from enrollment
    for i in range(1, count + 1):
        # rough 3 months spacing: 0, 90, 180, 270 days
        due_date = enrollment_date + datetime.timedelta(days=(i - 1) * 90)
        ins = Instalment(
            id=f"INS-{student_id.replace('STU-', '')}-{i}",
            student_id=student_id,
            instalment_number=i,
            due_date=due_date,
            amount=base_amount,
            paid_amount=Decimal("0.0"),
            status="Upcoming"
        )
        instalments.append(ins)
    return instalments
