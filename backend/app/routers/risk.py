import re
import json
import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import CounsellorTask, Student, User, AuditLog
from app.schemas import (
    CounsellorTaskResponse, AssignCounsellorRequest,
    RiskStatusUpdateRequest, DismissRiskTaskRequest
)
from app.auth import require_role
from app.services.risk import (
    assess_student_risk,
    seed_demo_dropout_risk_student,
    run_daily_ai_risk_analysis
)
from app.services.currency import to_decimal, ZERO

router = APIRouter(prefix="/risk", tags=["Risk & Counselling"])

@router.get("/summary")
def get_risk_summary(
    current_user: User = Depends(require_role("accounts_executive", "admin", "counsellor")),
    db: Session = Depends(get_db)
):
    query = db.query(CounsellorTask).join(Student, CounsellorTask.student_id == Student.id)
    if current_user.role in ["accounts_executive", "counsellor"] and current_user.centre_id:
        query = query.filter(Student.centre_id == current_user.centre_id)

    tasks = query.all()
    total_flagged = len(tasks)
    high_count = sum(1 for t in tasks if t.risk_level == "High")
    medium_count = sum(1 for t in tasks if t.risk_level == "Medium")
    low_count = sum(1 for t in tasks if t.risk_level == "Low")
    immediate = sum(1 for t in tasks if t.priority in ["Urgent", "High"] and t.status in ["Open", "In Progress", "Unreviewed"])
    open_tasks = sum(1 for t in tasks if t.status in ["Open", "In Progress", "Unreviewed"])
    resolved_tasks = sum(1 for t in tasks if t.status in ["Resolved", "Contacted"])
    false_positives = sum(1 for t in tasks if t.status in ["False Positive", "Dismissed"])

    return {
        "total_flagged": total_flagged,
        "high_risk_count": high_count,
        "medium_risk_count": medium_count,
        "low_risk_count": low_count,
        "immediate_followup_count": immediate,
        "open_tasks_count": open_tasks,
        "resolved_tasks_count": resolved_tasks,
        "false_positive_count": false_positives
    }

@router.get("/tasks", response_model=List[CounsellorTaskResponse])
def list_counsellor_tasks(
    risk_level: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(require_role("accounts_executive", "admin", "counsellor")),
    db: Session = Depends(get_db)
):
    query = db.query(CounsellorTask).join(Student, CounsellorTask.student_id == Student.id)
    
    # Centre isolation: Accounts executive and counsellor only see tasks for their centre
    if current_user.role in ["accounts_executive", "counsellor"] and current_user.centre_id:
        query = query.filter(Student.centre_id == current_user.centre_id)

    if risk_level:
        query = query.filter(CounsellorTask.risk_level == risk_level)
    if status_filter:
        query = query.filter(CounsellorTask.status == status_filter)

    tasks = query.order_by(CounsellorTask.created_at.desc()).all()
    results = []
    
    is_counsellor = (current_user.role == "counsellor")

    for t in tasks:
        student = t.student
        reasons = []
        try:
            reasons = json.loads(t.risk_reasons)
            if not isinstance(reasons, list):
                reasons = [str(reasons)]
        except Exception:
            reasons = [t.risk_reasons] if t.risk_reasons else []

        evidence_dict = None
        if t.evidence:
            try:
                evidence_dict = json.loads(t.evidence)
            except Exception:
                evidence_dict = None

        att_pct = 85.0
        score_trend = "Stable"
        if evidence_dict:
            att_pct = float(evidence_dict.get("attendance_rate", 85.0))
            score_trend = str(evidence_dict.get("test_score_trend", "Stable"))

        # Safety requirement: Never expose fee amounts to counsellors
        if is_counsellor:
            outstanding = 0.0
            if evidence_dict:
                evidence_dict.pop("overdue_amount", None)
                if "score_breakdown" in evidence_dict and isinstance(evidence_dict["score_breakdown"], dict):
                    evidence_dict["score_breakdown"]["fee_risk_points"] = None
            # Redact monetary values from reason strings
            sanitized_reasons = []
            for r in reasons:
                sanitized_r = re.sub(r"₹[0-9,]+", "overdue fee balance", r)
                sanitized_reasons.append(sanitized_r)
            reasons = sanitized_reasons
        else:
            outstanding_dec = sum(
                (max(ZERO, to_decimal(i.amount) - to_decimal(i.paid_amount))
                for i in student.instalments
                if i.status == "Overdue"), ZERO
            ) if student else ZERO
            outstanding = float(outstanding_dec)

        results.append(CounsellorTaskResponse(
            id=t.id,
            student_id=t.student_id,
            student_name=student.name if student else "Unknown",
            centre_name=student.centre.name if student and student.centre else "N/A",
            course=student.course if student else "N/A",
            risk_level=t.risk_level,
            risk_score=float(t.risk_score or 50.0),
            risk_reasons=reasons,
            evidence=evidence_dict,
            attendance_percent=att_pct,
            test_score_trend=score_trend,
            outstanding_amount=outstanding,
            counsellor_name=t.counsellor_name,
            priority=t.priority or "High",
            due_date=t.due_date,
            status=t.status,
            dismissal_reason=t.dismissal_reason,
            notes=t.notes,
            flagged_date=t.flagged_date or datetime.date.today(),
            reviewed_at=t.reviewed_at,
            created_at=t.created_at or datetime.datetime.utcnow()
        ))
    return results

@router.post("/assess/{student_id}")
async def trigger_student_risk_assessment(
    student_id: str,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if current_user.role == "accounts_executive" and current_user.centre_id:
        if student.centre_id != current_user.centre_id:
            raise HTTPException(status_code=403, detail="Forbidden: You cannot assess a student from another centre.")

    result = await assess_student_risk(student, db)
    return {
        "message": "Risk assessment completed. Counsellor task updated if risk threshold met.",
        "data": result
    }

@router.post("/tasks/{task_id}/assign")
def assign_counsellor(
    task_id: int,
    body: AssignCounsellorRequest,
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    task = db.query(CounsellorTask).filter(CounsellorTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    student = task.student or db.query(Student).filter(Student.id == task.student_id).first()
    if current_user.role == "accounts_executive" and current_user.centre_id:
        if student and student.centre_id != current_user.centre_id:
            raise HTTPException(status_code=403, detail="Forbidden: Cannot reassign tasks for foreign centres.")

    task.counsellor_name = body.counsellor_name
    task.priority = body.priority or task.priority
    task.status = "In Progress"
    if body.notes:
        task.notes = f"{task.notes or ''} | {body.notes}".strip(" | ")
    
    db.add(AuditLog(
        entity_name="CounsellorTask",
        entity_id=str(task.id),
        action="RISK_TASK_ASSIGNED",
        changed_by=current_user.full_name,
        new_values=f"Assigned to {body.counsellor_name}, Priority: {task.priority}"
    ))
    db.commit()
    return {"message": "Counsellor assigned successfully", "task_id": task.id, "counsellor": task.counsellor_name}

@router.post("/tasks/{task_id}/dismiss")
def dismiss_risk_task(
    task_id: int,
    body: DismissRiskTaskRequest,
    current_user: User = Depends(require_role("accounts_executive", "admin", "counsellor")),
    db: Session = Depends(get_db)
):
    task = db.query(CounsellorTask).filter(CounsellorTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    student = task.student or db.query(Student).filter(Student.id == task.student_id).first()
    if current_user.role in ["accounts_executive", "counsellor"] and current_user.centre_id:
        if student and student.centre_id != current_user.centre_id:
            raise HTTPException(status_code=403, detail="Forbidden: Cannot dismiss tasks for foreign centres.")

    if not body.reason or not body.reason.strip():
        raise HTTPException(status_code=400, detail="Mandatory dismissal reason is required to dismiss a risk task.")

    task.status = "False Positive"
    task.dismissal_reason = body.reason.strip()
    task.reviewed_at = datetime.datetime.now(datetime.timezone.utc)
    if body.notes:
        task.notes = f"{task.notes or ''} | Dismissal notes: {body.notes}".strip(" | ")

    db.add(AuditLog(
        entity_name="CounsellorTask",
        entity_id=str(task.id),
        action="RISK_TASK_DISMISSED",
        changed_by=current_user.full_name,
        new_values=f"Status: False Positive, Reason: {body.reason}"
    ))
    db.commit()
    return {
        "message": "Task dismissed as false positive.",
        "task_id": task.id,
        "dismissal_reason": task.dismissal_reason
    }

@router.post("/tasks/{task_id}/status")
def update_task_status(
    task_id: int,
    body: RiskStatusUpdateRequest,
    current_user: User = Depends(require_role("accounts_executive", "admin", "counsellor")),
    db: Session = Depends(get_db)
):
    task = db.query(CounsellorTask).filter(CounsellorTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    student = task.student or db.query(Student).filter(Student.id == task.student_id).first()
    if current_user.role in ["accounts_executive", "counsellor"] and current_user.centre_id:
        if student and student.centre_id != current_user.centre_id:
            raise HTTPException(status_code=403, detail="Forbidden: Centre isolation violated.")

    allowed = ["Open", "In Progress", "Contacted", "Resolved", "False Positive"]
    if body.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status value. Must be one of {allowed}")

    if body.status == "False Positive":
        if not body.dismissal_reason or not body.dismissal_reason.strip():
            raise HTTPException(status_code=400, detail="Mandatory dismissal reason required for False Positive.")
        task.dismissal_reason = body.dismissal_reason.strip()

    task.status = body.status
    task.reviewed_at = datetime.datetime.now(datetime.timezone.utc)
    if body.notes:
        task.notes = f"{task.notes or ''} | {body.notes}".strip(" | ")
        
    db.add(AuditLog(
        entity_name="CounsellorTask",
        entity_id=str(task.id),
        action=f"RISK_TASK_{body.status.upper().replace(' ', '_')}",
        changed_by=current_user.full_name,
        new_values=f"Student: {task.student_id}, Status: {body.status}, Notes: {body.notes or ''}"
    ))
    db.commit()
    return {"message": f"Task marked as {body.status}", "task_id": task.id}


@router.post("/seed-demo")
def seed_demo_scenario(
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    """
    Seeds or resets the dedicated demo student (Rohan Verma, STU-0999) with:
    - Attendance declining from 85.0% to 58.3%
    - 3 declining test scores (72%, 61%, 43%)
    - 1 instalment overdue by 25 days
    - High Risk classification with an initial CounsellorTask
    """
    student = seed_demo_dropout_risk_student(db)
    return {
        "status": "SUCCESS",
        "message": "Demo dropout-risk scenario student (STU-0999, Rohan Verma) seeded successfully.",
        "student_id": student.id,
        "student_name": student.name,
        "batch": student.batch,
        "course": student.course
    }


@router.post("/run-scan")
def trigger_bulk_risk_scan(
    current_user: User = Depends(require_role("accounts_executive", "admin")),
    db: Session = Depends(get_db)
):
    """
    Manually triggers the rule-based dropout risk scan across all students.
    Creates or updates counsellor tasks for all High and Medium risk students.
    """
    res = run_daily_ai_risk_analysis(db)
    return {
        "status": "SUCCESS",
        "message": f"Risk scan completed. Analyzed {res['students_analyzed']} students; updated {res['tasks_updated']} counsellor tasks.",
        "data": res,
        "students_analyzed": res.get("students_analyzed", 0),
        "high_risk_count": res.get("high_risk_count", 0),
        "medium_risk_count": res.get("medium_risk_count", 0),
        "low_risk_count": res.get("low_risk_count", 0),
        "tasks_updated": res.get("tasks_updated", 0)
    }



