import datetime
from decimal import Decimal
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.auth import get_current_user, require_role
from app.services.automation import (
    get_automation_status, set_scheduler_state,
    execute_reminder_scheduler, execute_risk_scan
)
from app.services.reminders import retry_failed_reminders
from app.services.payments import auto_match_incoming_payment
from app.services.risk import dismiss_risk_task
from app.services.currency import to_decimal, ZERO

router = APIRouter(prefix="/automation", tags=["Automation Engine"])

class SchedulerToggleRequest(BaseModel):
    enabled: bool

class DismissTaskRequest(BaseModel):
    reason: str

class AutoMatchPaymentRequest(BaseModel):
    reference_no: str
    amount: float
    method: str = "UPI"
    student_id: Optional[str] = None
    instalment_id: Optional[str] = None
    order_id: Optional[str] = None
    signature: Optional[str] = None
    payment_date: Optional[str] = None
    notes: Optional[str] = None

class AutomationTestRunRequest(BaseModel):
    simulation_date: Optional[str] = None


@router.get("/status")
def read_automation_status(
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    """Returns real-time health, counters, and execution history for the automation engine."""
    return get_automation_status(db)

@router.post("/toggle-reminders")
def toggle_reminder_automation(
    body: SchedulerToggleRequest,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    """Enables or disables automatic 5-minute reminder background cycles."""
    enabled = set_scheduler_state(body.enabled, db)
    return {
        "scheduler_enabled": enabled,
        "message": f"Automatic reminder scheduler {'enabled' if enabled else 'disabled'} successfully."
    }

@router.post("/run-reminders")
def trigger_reminder_cycle(
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    """Triggers an immediate on-demand execution of the reminder cycle."""
    result = execute_reminder_scheduler(db)
    return result

@router.post("/run-risk-scan")
def trigger_risk_scan(
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    """Triggers an immediate on-demand scan of student academic & fee dropout risk."""
    result = execute_risk_scan(db)
    return result

@router.post("/retry-failed")
def retry_failed_reminder_deliveries(
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    """Retries all failed delivery reminders safely without duplicating messages."""
    retried_count = retry_failed_reminders(db)
    return {
        "status": "SUCCESS",
        "retried_count": retried_count,
        "message": f"Successfully retried {retried_count} failed reminder deliveries."
    }

@router.post("/match-payment")
def auto_match_payment(
    body: AutoMatchPaymentRequest,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    """
    Automatic payment ingestion & reconciliation endpoint:
    - Verifies signature
    - Matches student/instalment
    - Atomically updates ledger, receipt, and reminder cancellations
    - If unmatchable, queues in reconciliation backlog as 'Unmatched'
    """
    p_date = None
    if body.payment_date:
        try:
            p_date = datetime.date.fromisoformat(body.payment_date)
        except Exception:
            p_date = datetime.date.today()

    payment, is_matched = auto_match_incoming_payment(
        db=db,
        reference_no=body.reference_no,
        amount=Decimal(str(body.amount)),
        method=body.method,
        student_id=body.student_id,
        instalment_id=body.instalment_id,
        order_id=body.order_id,
        signature=body.signature,
        payment_date=p_date,
        notes=body.notes,
        recorded_by=current_user.full_name
    )

    return {
        "payment_id": payment.id,
        "transaction_id": payment.transaction_id,
        "status": payment.status,
        "is_matched": is_matched,
        "student_id": payment.student_id,
        "instalment_id": payment.instalment_id,
        "amount": float(to_decimal(payment.amount)),
        "message": "Payment automatically matched and fee ledger updated." if is_matched else "Payment saved as Unmatched in accounts reconciliation queue."
    }

@router.post("/counsellor-tasks/{task_id}/dismiss")
def dismiss_task(
    task_id: int,
    body: DismissTaskRequest,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    """Dismisses an open risk counsellor task as False Positive with mandatory reason."""
    task = dismiss_risk_task(
        task_id=task_id,
        reason=body.reason,
        db=db,
        dismissed_by=current_user.full_name
    )
    return {
        "task_id": task.id,
        "status": task.status,
        "dismissal_reason": task.dismissal_reason,
        "reviewed_at": task.reviewed_at.isoformat() if task.reviewed_at else None,
        "message": "Counsellor task successfully dismissed as false positive."
    }

@router.post("/test-run")
def simulate_automation_test_run(
    body: Optional[AutomationTestRunRequest] = None,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    """
    Admin-restricted manual simulation test-run:
    - Scans all active instalments against statutory milestone rules.
    - Dry-run: does not dispatch actual messages or duplicate database alerts.
    - Accurately details which milestones trigger, balances calculated, and escalation routing.
    """
    from app.services.reminders import AUTOMATION_REMINDER_OFFSETS, get_kolkata_today
    from app.models import Instalment, Student

    target_date = get_kolkata_today()
    if body and body.simulation_date:
        try:
            target_date = datetime.date.fromisoformat(body.simulation_date)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid simulation_date format: {body.simulation_date}. Expected YYYY-MM-DD."
            )

    active_instalments = db.query(Instalment).join(Student, Instalment.student_id == Student.id).filter(
        Instalment.status != "Paid",
        Instalment.paid_amount < Instalment.amount
    ).all()

    triggers = []
    escalations = []
    summary_counts = {
        "UPCOMING_7D": 0,
        "UPCOMING_3D": 0,
        "DUE_TODAY": 0,
        "OVERDUE_1D": 0,
        "OVERDUE_7D": 0,
        "OVERDUE_30D": 0
    }

    for ins in active_instalments:
        student = ins.student
        rem_due = float(max(ZERO, to_decimal(ins.amount) - to_decimal(ins.paid_amount)))
        centre_name = student.centre.name if student.centre else "Jaipur Main"

        for offset, stage_code, label in AUTOMATION_REMINDER_OFFSETS:
            sched_date = ins.due_date + datetime.timedelta(days=offset)
            if sched_date == target_date:
                summary_counts[stage_code] = summary_counts.get(stage_code, 0) + 1

                notifications = [
                    {
                        "recipient": student.parent_phone,
                        "role": "parent",
                        "channel": "whatsapp",
                        "type": "FEE_OVERDUE" if offset > 0 else "FEE_UPCOMING"
                    },
                    {
                        "recipient": f"centre_{student.centre_id}_staff",
                        "role": "accounts_executive",
                        "channel": "in_app",
                        "type": "STAFF_DEADLINE_ALERT"
                    }
                ]

                if stage_code == "OVERDUE_7D":
                    escalations.append({
                        "level": "Centre Manager Escalation (7 Days Overdue)",
                        "recipient": f"centre_{student.centre_id}_manager",
                        "student_id": student.id,
                        "student_name": student.name,
                        "amount": rem_due
                    })
                    notifications.append({
                        "recipient": f"centre_{student.centre_id}_manager",
                        "role": "accounts_executive",
                        "channel": "in_app",
                        "type": "OVERDUE_ESCALATION"
                    })
                elif stage_code == "OVERDUE_30D":
                    escalations.append({
                        "level": "Critical Admin Escalation (30 Days Overdue)",
                        "recipient": "admin_escalation",
                        "student_id": student.id,
                        "student_name": student.name,
                        "amount": rem_due
                    })
                    notifications.append({
                        "recipient": "admin_escalation",
                        "role": "admin",
                        "channel": "in_app",
                        "type": "OVERDUE_CRITICAL_ESCALATION"
                    })

                triggers.append({
                    "instalment_id": ins.id,
                    "student_id": student.id,
                    "student_name": student.name,
                    "centre_name": centre_name,
                    "batch": student.batch,
                    "due_date": ins.due_date.isoformat(),
                    "remaining_balance": round(rem_due, 2),
                    "stage_code": stage_code,
                    "stage_label": label,
                    "event_key": f"{ins.id}_{stage_code}",
                    "notifications_to_send": notifications
                })

    return {
        "status": "SIMULATION_SUCCESS",
        "dry_run": True,
        "simulation_date": target_date.isoformat(),
        "active_instalments_scanned": len(active_instalments),
        "milestones_triggered": len(triggers),
        "triggers": triggers,
        "escalations": escalations,
        "summary": summary_counts
    }


