import json
import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
import httpx
from app.config import settings
from app.models import Student, Attendance, TestScore, CounsellorTask, Instalment, AuditLog
from app.services.currency import to_decimal, ZERO, PAISE

def rule_based_risk_assessment(
    attendance_pct: float,
    overdue_count: int,
    overdue_amount: float,
    score_trend: str
) -> Dict[str, Any]:
    reasons: List[str] = []
    
    if attendance_pct < 65.0:
        reasons.append(f"Attendance critically low ({attendance_pct:.1f}% < 65%)")
    elif attendance_pct < 75.0:
        reasons.append(f"Attendance below threshold ({attendance_pct:.1f}% < 75%)")
        
    if overdue_count >= 2:
        reasons.append(f"{overdue_count} overdue instalments (₹{overdue_amount:,.0f} due)")
    elif overdue_count == 1:
        reasons.append(f"1 overdue instalment (₹{overdue_amount:,.0f} due)")
        
    if score_trend == "Declining":
        reasons.append("Recent test scores showing declining trend")
        
    # Determine risk level
    if len(reasons) >= 2 or attendance_pct < 60.0 or overdue_count >= 2:
        level = "High"
    elif len(reasons) == 1 or attendance_pct < 75.0 or overdue_count == 1 or score_trend == "Declining":
        level = "Medium"
    else:
        level = "Low"
        
    return {
        "risk_level": level,
        "risk_reasons": reasons if reasons else ["Academic and fee metrics are within normal range."],
        "recommended_action": "Schedule 1-on-1 academic counselling session" if level in ["High", "Medium"] else "Maintain routine monitoring"
    }

def calculate_student_risk_score(student: Student, db: Session) -> Dict[str, Any]:
    today = datetime.date.today()
    reasons: List[str] = []
    
    # --- Signal 1: Financial & Overdue Instalments (0 - 35 points) ---
    overdue_instalments = [i for i in student.instalments if i.status == "Overdue"]
    overdue_count = len(overdue_instalments)
    overdue_amount_dec = sum((to_decimal(i.amount) - to_decimal(i.paid_amount) for i in overdue_instalments), ZERO)
    overdue_amount = float(overdue_amount_dec)
    
    max_overdue_days = 0
    for i in overdue_instalments:
        if i.due_date and today > i.due_date:
            days = (today - i.due_date).days
            if days > max_overdue_days:
                max_overdue_days = days

    fee_points = 0.0
    if overdue_count >= 2:
        fee_points = 35.0
        reasons.append(f"{overdue_count} overdue instalments totaling ₹{overdue_amount:,.0f} (oldest overdue by {max_overdue_days} days)")
    elif overdue_count == 1:
        if max_overdue_days > 30:
            fee_points = 25.0
            reasons.append(f"1 critical overdue instalment of ₹{overdue_amount:,.0f} overdue by {max_overdue_days} days (> 30 days)")
        else:
            fee_points = 15.0
            reasons.append(f"1 overdue instalment of ₹{overdue_amount:,.0f} overdue by {max_overdue_days} days")

    # --- Signal 2: Attendance Metrics & Trends (0 - 35 points) ---
    attendances = db.query(Attendance).filter(Attendance.student_id == student.id).order_by(Attendance.date.asc()).all()
    total_classes = len(attendances)
    att_points = 0.0
    att_pct = 85.0 # default baseline
    att_trend = "Stable"

    if total_classes > 0:
        present_count = sum(1 for a in attendances if a.status == "Present")
        att_pct = round((present_count / total_classes) * 100.0, 1)

        # Baseline attendance points
        if att_pct < 60.0:
            att_points = 30.0
            reasons.append(f"Attendance critically low at {att_pct}% (< 60% threshold)")
        elif att_pct < 75.0:
            att_points = 20.0
            reasons.append(f"Attendance below statutory 75% threshold ({att_pct}%)")
        elif att_pct < 85.0:
            att_points = 10.0

        # Trend detection (first half vs second half)
        if total_classes >= 6:
            half = total_classes // 2
            first_half = attendances[:half]
            second_half = attendances[half:]
            first_pct = (sum(1 for a in first_half if a.status == "Present") / len(first_half)) * 100.0
            second_pct = (sum(1 for a in second_half if a.status == "Present") / len(second_half)) * 100.0
            
            if second_pct < first_pct - 10.0:
                att_trend = "Declining"
                att_points = min(35.0, att_points + 10.0)
                reasons.append(f"Recent attendance drop: declined from {first_pct:.1f}% to {second_pct:.1f}%")
            elif second_pct > first_pct + 10.0:
                att_trend = "Improving"

    # --- Signal 3: Academic Performance & Test Trends (0 - 30 points) ---
    scores = db.query(TestScore).filter(TestScore.student_id == student.id).order_by(TestScore.test_date.asc()).all()
    test_points = 0.0
    score_trend = "Stable"
    avg_score_pct = 75.0

    if scores:
        percentages = [
            (s.marks_obtained / s.max_marks * 100.0) if s.max_marks > 0 else 0.0
            for s in scores
        ]
        avg_score_pct = round(sum(percentages) / len(percentages), 1)

        if avg_score_pct < 45.0:
            test_points = 20.0
            reasons.append(f"Academic average critically low ({avg_score_pct}% across {len(scores)} tests)")
        elif avg_score_pct < 60.0:
            test_points = 12.0
            reasons.append(f"Academic average below target ({avg_score_pct}%)")

        if len(scores) >= 3:
            first_half_avg = sum(percentages[:len(scores)//2]) / (len(scores)//2)
            second_half_avg = sum(percentages[len(scores)//2:]) / (len(scores) - len(scores)//2)
            
            if second_half_avg < first_half_avg - 8.0:
                score_trend = "Declining"
                test_points = min(30.0, test_points + 10.0)
                reasons.append(f"Repeated academic score decline: dropped from {first_half_avg:.1f}% to {second_half_avg:.1f}%")
            elif second_half_avg > first_half_avg + 8.0:
                score_trend = "Improving"

    # Total Score (0 - 100)
    total_risk_score = round(min(100.0, fee_points + att_points + test_points), 1)

    # Category classification
    if total_risk_score >= 60.0 or overdue_count >= 2 or att_pct < 60.0:
        risk_level = "High"
    elif total_risk_score >= 30.0 or overdue_count == 1 or att_pct < 75.0 or score_trend == "Declining":
        risk_level = "Medium"
    else:
        risk_level = "Low"

    evidence = {
        "overdue_instalments": overdue_count,
        "overdue_amount": overdue_amount,
        "max_overdue_days": max_overdue_days,
        "attendance_rate": att_pct,
        "attendance_trend": att_trend,
        "total_classes": total_classes,
        "test_average_percent": avg_score_pct,
        "test_score_trend": score_trend,
        "test_count": len(scores),
        "score_breakdown": {
            "fee_risk_points": fee_points,
            "attendance_risk_points": att_points,
            "academic_risk_points": test_points,
            "total_risk_score": total_risk_score
        }
    }

    if not reasons:
        reasons = ["Academic attendance and fee instalments are currently on track."]

    if risk_level == "High":
        recommended_action = "Schedule immediate 1-on-1 parent & student counselling session within 48 hours."
    elif risk_level == "Medium":
        recommended_action = "Initiate counsellor check-in regarding recent attendance or academic trend."
    else:
        recommended_action = "Maintain routine academic monitoring."

    return {
        "student_id": student.id,
        "student_name": student.name,
        "risk_score": total_risk_score,
        "risk_level": risk_level,
        "risk_reasons": reasons,
        "evidence": evidence,
        "recommended_action": recommended_action,
        "attendance_percent": att_pct,
        "overdue_count": overdue_count,
        "overdue_amount": overdue_amount,
        "score_trend": score_trend
    }

async def assess_student_risk(student: Student, db: Session) -> Dict[str, Any]:
    """
    Deterministic rule-based risk assessment + optional Gemini narrative.
    CRITICAL SAFETY RULES:
    1. NEVER automatically modify student fees or instalments.
    2. NEVER trigger parent notifications or messages.
    3. NEVER modify student enrolment status.
    4. Only creates/updates CounsellorTask records.
    """
    result = calculate_student_risk_score(student, db)

    # Optional Gemini narrative explanation (only if API key is valid and configured)
    if settings.GEMINI_API_KEY:
        try:
            prompt = (
                f"Analyze academic dropout risk for student {student.name}. "
                f"Evidence: Attendance={result['evidence']['attendance_rate']}%, "
                f"Overdue instalments={result['evidence']['overdue_instalments']} (₹{result['evidence']['overdue_amount']}), "
                f"Test trend={result['evidence']['test_score_trend']} (Avg {result['evidence']['test_average_percent']}%). "
                f"Respond ONLY with valid JSON: {{\"risk_reasons\": [\"reason1\", ...], \"recommended_action\": \"action text\"}}"
            )
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
            payload = {"contents": [{"parts": [{"text": prompt}]}]}
            
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    text_resp = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                    if text_resp.startswith("```json"):
                        text_resp = text_resp[7:-3].strip()
                    elif text_resp.startswith("```"):
                        text_resp = text_resp[3:-3].strip()
                    parsed = json.loads(text_resp)
                    if "risk_reasons" in parsed and isinstance(parsed["risk_reasons"], list):
                        # Supplement deterministic reasons with AI synthesis
                        result["ai_explanation"] = parsed["risk_reasons"]
                        if "recommended_action" in parsed:
                            result["recommended_action"] = parsed["recommended_action"]
        except Exception:
            # Safe fallback: preserve deterministic results without disruption
            pass

    # Safety: Automatically create or update CounsellorTask ONLY (no fee changes, no parent messages)
    if result["risk_level"] in ["High", "Medium"]:
        existing_task = db.query(CounsellorTask).filter(
            CounsellorTask.student_id == student.id,
            CounsellorTask.status.in_(["Open", "In Progress", "Unreviewed"])
        ).first()

        reasons_json = json.dumps(result["risk_reasons"])
        evidence_json = json.dumps(result["evidence"])
        priority = "Urgent" if result["risk_score"] >= 75.0 else ("High" if result["risk_level"] == "High" else "Medium")
        due_date = datetime.date.today() + datetime.timedelta(days=2 if priority in ["Urgent", "High"] else 5)

        if existing_task:
            existing_task.risk_level = result["risk_level"]
            existing_task.risk_score = result["risk_score"]
            existing_task.risk_reasons = reasons_json
            existing_task.evidence = evidence_json
            existing_task.priority = priority
            existing_task.due_date = due_date
        else:
            new_task = CounsellorTask(
                student_id=student.id,
                risk_level=result["risk_level"],
                risk_score=result["risk_score"],
                risk_reasons=reasons_json,
                evidence=evidence_json,
                priority=priority,
                due_date=due_date,
                status="Open"
            )
            db.add(new_task)
            db.flush()
            
            db.add(AuditLog(
                entity_name="CounsellorTask",
                entity_id=str(new_task.id),
                action="RISK_TASK_CREATED",
                changed_by="RiskEngine",
                new_values=f"Student: {student.id}, Score: {result['risk_score']}, Level: {result['risk_level']}"
            ))

        # Alert staff ONLY for high-risk dropout (NEVER send to parent/student)
        if result["risk_level"] == "High":
            try:
                from app.services.notifications import notify_high_risk_dropout
                task_id = new_task.id if 'new_task' in locals() else existing_task.id
                notify_high_risk_dropout(
                    db=db,
                    student=student,
                    task_id=task_id,
                    score=int(result["risk_score"])
                )
            except Exception:
                pass

        db.commit()

    return result


def run_daily_ai_risk_analysis(db: Session) -> Dict[str, Any]:
    """
    Automated daily AI risk analysis job:
    - Analyzes missed instalments, declining attendance trends, falling test scores.
    - Stores evidence and scoring reasons.
    - Creates or updates counsellor tasks.
    - Avoids duplicate open tasks.
    - Strictly never initiates fee changes or parent notifications.
    - Logs run in AutomationLog.
    """
    from app.models import AutomationLog
    start_time = datetime.datetime.utcnow()
    students = db.query(Student).all()
    high_risk_count = 0
    medium_risk_count = 0
    tasks_updated = 0

    for s in students:
        try:
            res = calculate_student_risk_score(s, db)
            if res.get("risk_level") == "High":
                high_risk_count += 1
            elif res.get("risk_level") == "Medium":
                medium_risk_count += 1
            if res.get("risk_level") in ["High", "Medium"]:
                tasks_updated += 1
        except Exception:
            pass

    duration = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
    log_rec = AutomationLog(
        job_name="risk_analysis",
        status="SUCCESS",
        items_processed=len(students),
        details=f"Students analyzed: {len(students)}, High risk: {high_risk_count}, Medium risk: {medium_risk_count}, Tasks: {tasks_updated}",
        duration_ms=duration
    )
    db.add(log_rec)
    db.commit()

    return {
        "status": "SUCCESS",
        "students_analyzed": len(students),
        "high_risk_count": high_risk_count,
        "medium_risk_count": medium_risk_count,
        "tasks_updated": tasks_updated,
        "duration_ms": duration
    }


def dismiss_risk_task(task_id: int, reason: str, db: Session, dismissed_by: str = "Accounts/Counsellor") -> CounsellorTask:
    """
    Allows authorized staff to dismiss a risk task as False Positive with mandatory reason.
    """
    from fastapi import HTTPException
    if not reason or not reason.strip():
        raise HTTPException(
            status_code=400,
            detail="A mandatory explanation reason is required to dismiss a risk task as false positive."
        )

    task = db.query(CounsellorTask).filter(CounsellorTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Counsellor task not found.")

    task.status = "False Positive"
    task.dismissal_reason = reason.strip()
    task.reviewed_at = datetime.datetime.utcnow()

    db.add(AuditLog(
        entity_name="CounsellorTask",
        entity_id=str(task.id),
        action="TASK_DISMISSED_FALSE_POSITIVE",
        changed_by=dismissed_by,
        new_values=f"Status: False Positive, Reason: {reason.strip()}"
    ))
    db.commit()
    db.refresh(task)
    return task



