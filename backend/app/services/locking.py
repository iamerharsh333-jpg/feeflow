import os
import uuid
import datetime
import logging
from typing import Tuple, Optional, Dict, Any
from contextlib import contextmanager
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import JobLock, AutomationLog

logger = logging.getLogger("feeflow.locking")


def get_default_worker_id() -> str:
    """Generates a unique identifier for the current process/worker."""
    return f"worker-{os.getpid()}-{uuid.uuid4().hex[:6]}"


def acquire_job_lock(
    job_name: str,
    db: Session,
    lease_seconds: int = 300,
    worker_id: Optional[str] = None
) -> Tuple[bool, Optional[str]]:
    """
    Acquires a database-backed distributed lease for a job.
    
    Returns:
        (True, worker_id) if the lease was successfully acquired.
        (False, None) if the job is actively locked by another process.
        
    Lease semantics:
    - If no lock record exists, creates one in LOCKED state.
    - If a lock record exists and is RELEASED, acquires it atomically.
    - If a lock record exists and is LOCKED but expires_at <= utcnow,
      it detects worker crash / stale lease, logs recovery, and acquires it.
    - If a lock record exists and is LOCKED with expires_at > utcnow,
      acquisition is denied.
    """
    wid = worker_id or get_default_worker_id()
    now = datetime.datetime.utcnow()
    expires_at = now + datetime.timedelta(seconds=lease_seconds)

    # 1. Try atomic update if row exists and is either RELEASED or EXPIRED
    try:
        # Check if there is an expired lock to log recovery
        stale_lock = db.query(JobLock).filter(
            JobLock.job_name == job_name,
            JobLock.status == "LOCKED",
            JobLock.expires_at <= now
        ).first()

        if stale_lock:
            stale_owner = stale_lock.locked_by
            stale_expiry = stale_lock.expires_at
            logger.warning(
                f"Recovering stale/expired job lock '{job_name}' "
                f"(previous owner: {stale_owner}, expired at: {stale_expiry} UTC)."
            )
            # Record an automation log entry noting the lease recovery
            recovery_log = AutomationLog(
                job_name=job_name,
                status="RECOVERED",
                items_processed=0,
                details=f"Recovered stale lock from dead process {stale_owner} (expired at {stale_expiry} UTC)",
                duration_ms=0,
                executed_at=now
            )
            db.add(recovery_log)

        updated = db.query(JobLock).filter(
            JobLock.job_name == job_name,
            or_(
                JobLock.status == "RELEASED",
                JobLock.expires_at <= now
            )
        ).update({
            "locked_by": wid,
            "locked_at": now,
            "expires_at": expires_at,
            "status": "LOCKED"
        }, synchronize_session=False)

        if updated == 1:
            db.commit()
            logger.debug(f"Acquired job lock '{job_name}' for worker '{wid}' until {expires_at} UTC.")
            return True, wid
        db.commit()
    except Exception as e:
        logger.error(f"Error during atomic update for job lock '{job_name}': {e}")
        db.rollback()

    # 2. Check if the lock is held by an active worker
    existing = db.query(JobLock).filter(JobLock.job_name == job_name).first()
    if existing and existing.status == "LOCKED" and existing.expires_at > now:
        logger.info(
            f"Job '{job_name}' is currently locked by '{existing.locked_by}' "
            f"until {existing.expires_at} UTC. Duplicate execution prevented."
        )
        return False, None

    # 3. If no lock record exists yet, insert a new one
    try:
        new_lock = JobLock(
            job_name=job_name,
            locked_by=wid,
            locked_at=now,
            expires_at=expires_at,
            status="LOCKED"
        )
        db.add(new_lock)
        db.commit()
        logger.debug(f"Created new job lock '{job_name}' for worker '{wid}'.")
        return True, wid
    except IntegrityError:
        # Race condition: another process inserted between our query and insert
        db.rollback()
        logger.info(f"Concurrent insert collision for job lock '{job_name}'. Contending worker took lock.")
        return False, None
    except Exception as e:
        logger.error(f"Unexpected error creating job lock for '{job_name}': {e}")
        db.rollback()
        return False, None


def release_job_lock(job_name: str, worker_id: str, db: Session) -> bool:
    """
    Releases a held job lock if and only if it is owned by the specified worker_id.
    Prevents a slow/expired prior worker from releasing a lock that has since
    been acquired by another worker.
    """
    try:
        now = datetime.datetime.utcnow()
        updated = db.query(JobLock).filter(
            JobLock.job_name == job_name,
            JobLock.locked_by == worker_id,
            JobLock.status == "LOCKED"
        ).update({
            "status": "RELEASED",
            "expires_at": now
        }, synchronize_session=False)
        db.commit()
        if updated > 0:
            logger.debug(f"Released job lock '{job_name}' by worker '{worker_id}'.")
            return True
        logger.warning(f"Could not release job lock '{job_name}': lock not held by worker '{worker_id}'.")
        return False
    except Exception as e:
        logger.error(f"Error releasing job lock for '{job_name}': {e}")
        db.rollback()
        return False


def get_job_lock_info(job_name: str, db: Session) -> Dict[str, Any]:
    """Retrieves metadata about current lock status for a job."""
    lock = db.query(JobLock).filter(JobLock.job_name == job_name).first()
    if not lock:
        return {"job_name": job_name, "is_locked": False, "status": "NO_LOCK"}

    now = datetime.datetime.utcnow()
    is_active = (lock.status == "LOCKED" and lock.expires_at > now)
    return {
        "job_name": job_name,
        "is_locked": is_active,
        "status": lock.status,
        "locked_by": lock.locked_by,
        "locked_at": lock.locked_at.isoformat() if lock.locked_at else None,
        "expires_at": lock.expires_at.isoformat() if lock.expires_at else None,
        "is_expired": (lock.status == "LOCKED" and lock.expires_at <= now)
    }


def force_release_job_lock(job_name: str, db: Session) -> bool:
    """Force releases a job lock regardless of owner (for testing and recovery)."""
    try:
        updated = db.query(JobLock).filter(JobLock.job_name == job_name).update({
            "status": "RELEASED",
            "expires_at": datetime.datetime.utcnow()
        }, synchronize_session=False)
        db.commit()
        return updated > 0
    except Exception as e:
        logger.error(f"Error force-releasing job lock for '{job_name}': {e}")
        db.rollback()
        return False


@contextmanager
def job_lease(
    job_name: str,
    db: Session,
    lease_seconds: int = 300,
    worker_id: Optional[str] = None
):
    """
    Context manager for database-backed job leasing.
    Yields (acquired: bool, worker_id: Optional[str]).
    Automatically releases the lock on exit if acquired.
    """
    acquired, wid = acquire_job_lock(job_name, db, lease_seconds=lease_seconds, worker_id=worker_id)
    try:
        yield acquired, wid
    finally:
        if acquired and wid:
            release_job_lock(job_name, wid, db)

