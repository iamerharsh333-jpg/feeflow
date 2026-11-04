import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.services.reminders import process_due_reminders

# Routers
from app.routers import (
    auth, students, fees, payments, reminders, refunds,
    dashboard, reports, attendance, tests, risk, consent, receipts, notifications, automation
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("feeflow")

# APScheduler instance
scheduler = BackgroundScheduler()

def scheduled_reminder_job():
    db = SessionLocal()
    try:
        from app.services.automation import execute_reminder_scheduler
        res = execute_reminder_scheduler(db)
        if res.get("status") == "SUCCESS" and res.get("sent_count", 0) > 0:
            logger.info(f"APScheduler: Sent {res['sent_count']} due reminders.")
    except Exception as e:
        logger.error(f"Error in scheduled_reminder_job: {e}")
    finally:
        db.close()

def scheduled_risk_job():
    db = SessionLocal()
    try:
        from app.services.automation import execute_risk_scan
        res = execute_risk_scan(db)
        if res.get("status") == "SUCCESS":
            logger.info(f"APScheduler: Daily AI risk scan completed ({res.get('students_analyzed', 0)} students analyzed).")
    except Exception as e:
        logger.error(f"Error in scheduled_risk_job: {e}")
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables initialized.")

    # Auto-seed if database is empty
    init_db = SessionLocal()
    try:
        from app.models import Centre
        if init_db.query(Centre).count() == 0:
            logger.info("Database empty on startup. Automatically seeding baseline data...")
            try:
                from seed import seed
                seed()
            except Exception as se:
                logger.warning(f"Could not run seed script: {se}")
    except Exception as e:
        logger.error(f"Error checking database initial state: {e}")
    finally:
        init_db.close()
    
    # Start scheduler: 5-minute reminder cycles + daily risk analysis
    scheduler.add_job(scheduled_reminder_job, "interval", minutes=5, id="reminder_check", replace_existing=True)
    scheduler.add_job(scheduled_risk_job, "interval", hours=24, id="daily_risk_scan", replace_existing=True)
    scheduler.start()
    logger.info("APScheduler background worker started (5-min reminder cycles + 24-hr risk scans).")
    
    yield
    
    # Shutdown
    scheduler.shutdown(wait=False)
    logger.info("APScheduler stopped.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="FeeFlow API: Fee management & parent engagement platform for Indian coaching institutes.",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
api_v1 = settings.API_V1_STR
app.include_router(auth.router, prefix=api_v1)
app.include_router(students.router, prefix=api_v1)
app.include_router(fees.router, prefix=api_v1)
app.include_router(payments.router, prefix=api_v1)
app.include_router(reminders.router, prefix=api_v1)
app.include_router(refunds.router, prefix=api_v1)
app.include_router(dashboard.router, prefix=api_v1)
app.include_router(reports.router, prefix=api_v1)
app.include_router(attendance.router, prefix=api_v1)
app.include_router(tests.router, prefix=api_v1)
app.include_router(risk.router, prefix=api_v1)
app.include_router(consent.router, prefix=api_v1)
app.include_router(receipts.router, prefix=api_v1)
app.include_router(notifications.router, prefix=api_v1)
app.include_router(automation.router, prefix=api_v1)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": "connected"
    }

@app.get("/")
def root():
    return {
        "message": "Welcome to FeeFlow Backend API",
        "documentation": "/docs",
        "health": "/health"
    }

if __name__ == "__main__":
    import uvicorn
    import sys
    import os
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True, app_dir=backend_dir)

