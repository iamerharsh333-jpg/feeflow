import io
import csv
import datetime
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Student, Centre, Payment, User
from app.auth import require_role
from app.services.fees import get_student_fee_summary
from app.services.currency import to_decimal, ZERO, PAISE, ONE_HUNDRED

router = APIRouter(prefix="/reports", tags=["Reports & Exports"])

@router.get("/centre-collection")
def get_centre_collection_report(
    export_csv: bool = Query(False),
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    query = db.query(Centre)
    if current_user.role == "accounts_executive" and current_user.centre_id:
        query = query.filter(Centre.id == current_user.centre_id)
    centres = query.all()
    rows = []
    for c in centres:
        c_students = db.query(Student).filter(Student.centre_id == c.id).all()
        collected = sum((to_decimal(get_student_fee_summary(s, db)["amount_paid"]) for s in c_students), ZERO)
        outstanding = sum((to_decimal(get_student_fee_summary(s, db)["outstanding_amount"]) for s in c_students), ZERO)
        total = collected + outstanding
        rate = float(round((collected / total * ONE_HUNDRED), 1)) if total > ZERO else 0.0
        rows.append({
            "centre": c.name,
            "students": len(c_students),
            "collected": float(collected),
            "outstanding": float(outstanding),
            "total": float(total),
            "collection_rate_percent": rate
        })

    if export_csv:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Centre", "Students", "Collected (INR)", "Outstanding (INR)", "Total (INR)", "Collection Rate (%)"])
        for r in rows:
            writer.writerow([r["centre"], r["students"], f"{r['collected']:.2f}", f"{r['outstanding']:.2f}", f"{r['total']:.2f}", r["collection_rate_percent"]])
        return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=centre_collection.csv"})

    return rows

@router.get("/batch-dues")
def get_batch_dues_report(
    export_csv: bool = Query(False),
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    query = db.query(Student)
    if current_user.role == "accounts_executive" and current_user.centre_id:
        query = query.filter(Student.centre_id == current_user.centre_id)
    students = query.all()
    batch_map = {}
    for s in students:
        key = f"{s.course} - {s.batch}"
        if key not in batch_map:
            batch_map[key] = {"course": s.course, "batch": s.batch, "students": 0, "collected": ZERO, "outstanding": ZERO}
        sum_res = get_student_fee_summary(s, db)
        batch_map[key]["students"] += 1
        batch_map[key]["collected"] += to_decimal(sum_res["amount_paid"])
        batch_map[key]["outstanding"] += to_decimal(sum_res["outstanding_amount"])

    rows = []
    for b in batch_map.values():
        c_val = b["collected"]
        o_val = b["outstanding"]
        t_val = c_val + o_val
        rows.append({
            "course": b["course"],
            "batch": b["batch"],
            "students": b["students"],
            "collected": float(c_val),
            "outstanding": float(o_val),
            "total": float(t_val)
        })

    if export_csv:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Course", "Batch", "Students", "Collected (INR)", "Outstanding (INR)", "Total (INR)"])
        for r in rows:
            writer.writerow([r["course"], r["batch"], r["students"], f"{r['collected']:.2f}", f"{r['outstanding']:.2f}", f"{r['total']:.2f}"])
        return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=batch_dues.csv"})

    return rows

@router.get("/reconciliation")
def get_payment_reconciliation_report(
    from_date: Optional[datetime.date] = Query(None),
    to_date: Optional[datetime.date] = Query(None),
    export_csv: bool = Query(False),
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    query = db.query(Payment)
    if current_user.role == "accounts_executive" and current_user.centre_id:
        query = query.filter((Payment.centre_id == current_user.centre_id) | (Payment.centre_id == None))
    if from_date:
        query = query.filter(Payment.payment_date >= from_date)
    if to_date:
        query = query.filter(Payment.payment_date <= to_date)
    payments = query.order_by(Payment.payment_date.desc()).all()

    rows = []
    for p in payments:
        amt_dec = to_decimal(p.amount)
        rows.append({
            "transaction_id": p.transaction_id,
            "student_id": p.student_id or "Unmatched",
            "student_name": p.student.name if p.student else "Unknown",
            "payment_date": p.payment_date.strftime("%Y-%m-%d"),
            "amount": float(amt_dec),
            "method": p.method,
            "reference_no": p.reference_no,
            "status": p.status
        })

    if export_csv:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Transaction ID", "Student ID", "Student Name", "Date", "Amount (INR)", "Method", "Reference", "Status"])
        for r in rows:
            writer.writerow([r["transaction_id"], r["student_id"], r["student_name"], r["payment_date"], f"{r['amount']:.2f}", r["method"], r["reference_no"], r["status"]])
        return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=payment_reconciliation.csv"})

    return rows

@router.get("/tally-export")
def get_tally_compatible_export(
    from_date: Optional[datetime.date] = Query(None),
    to_date: Optional[datetime.date] = Query(None),
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    """
    Exports successful payments in standard Tally Receipt Voucher CSV format.
    Columns: Date, Voucher Type, Voucher No, Ledger Name, Amount, Dr/Cr
    Guarantees exact Decimal monetary representation (e.g. 12500.50).
    """
    query = db.query(Payment).filter(Payment.status.in_(["Success", "Paid"]))
    if current_user.role == "accounts_executive" and current_user.centre_id:
        query = query.filter(Payment.centre_id == current_user.centre_id)
    if from_date:
        query = query.filter(Payment.payment_date >= from_date)
    if to_date:
        query = query.filter(Payment.payment_date <= to_date)
    payments = query.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Voucher Type", "Voucher No", "Ledger Name", "Amount", "Dr/Cr"])

    for p in payments:
        date_str = p.payment_date.strftime("%d-%m-%Y")
        amt_dec = to_decimal(p.amount)
        amt_str = f"{amt_dec:.2f}"
        
        # Bank / Cash Debit row
        bank_ledger = "HDFC Bank A/c" if p.method in ["UPI", "Bank Transfer", "Online"] else "Cash in Hand"
        writer.writerow([date_str, "Receipt", p.transaction_id, bank_ledger, amt_str, "Dr"])
        # Student Fee Revenue Credit row
        fee_ledger = f"Fee Revenue - {p.student.course if p.student else 'General'}"
        writer.writerow([date_str, "Receipt", p.transaction_id, fee_ledger, amt_str, "Cr"])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tally_receipt_vouchers.csv"}
    )
