# FeeFlow — Backend API

FastAPI-powered fee management, payment tracking, reminder automation, and parent engagement backend for coaching institutes.

---

## 1. Tech Stack
- **Framework**: Python 3.10+ / FastAPI
- **Database**: SQLite (local development) / PostgreSQL (production-ready via SQLAlchemy ORM)
- **Authentication**: JWT Bearer tokens + Bcrypt password hashing
- **Task Scheduling**: APScheduler for automatic overdue reminder processing
- **AI Risk Analysis**: Google Gemini API (with deterministic rule-based fallback when not configured)
- **Payment Gateway**: Configurable Mock mode & Razorpay test mode
- **Testing**: Pytest & HTTPX test client

---

## 2. Quick Setup & Run

### A. Setup Virtual Environment & Install Dependencies
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### B. Configure Environment
```bash
cp .env.example .env
```

### C. Seed Database
Seeds 4 centres, the 3 prompt-mandated student records, 2 additional realistic students, accounts staff user, instalments, and reminders:
```bash
python seed.py
```

### D. Start Backend Server
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- **API Base URL**: `http://localhost:8000/api/v1`
- **Swagger Interactive Docs**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`
- **Health Check**: `http://localhost:8000/health`

### E. Run Automated Tests
```bash
pytest tests -v
```

---

## 3. Demo Credentials

| Role | Identifier | Password / OTP | Access Scope |
|:---|:---|:---|:---|
| **Accounts Executive** | `accounts@feeflow.demo` | `Demo@12345` | Full centre accounts, ledger, refunds, reports, reminders |
| **System Admin** | `admin@feeflow.demo` | `Demo@12345` | Global admin access |
| **Parent 1** | `9876543210` | OTP `123456` | Linked only to student `STU-0412` (Aarav Meena) |
| **Parent 2** | `9123456789` | OTP `654321` | Linked only to student `STU-0587` (Ishita Sharma) |
| **Parent 3** | `9988776655` | OTP `111222` | Linked only to student `STU-0219` (Mohit Gurjar) |
| **Student** | `STU-0412` | `Student@123` | Access only own fees, test scores, attendance |

---

## 4. Mandated Seed Records

| Student ID | Student Name | Batch | Centre | Due Date | Instalment Amount | Paid Amount | Status |
|:---|:---|:---|:---|:---|---:|---:|:---|
| `STU-0412` | Aarav Meena | JEE 2027 Morning | Jaipur Main | 2026-10-10 | ₹30,000 | ₹30,000 | **Paid** |
| `STU-0587` | Ishita Sharma | JEE 2027 Evening | Jaipur Main | 2026-10-10 | ₹30,000 | ₹15,000 | **Partially Paid** |
| `STU-0219` | Mohit Gurjar | NEET 2027 Morning | Kota | 2026-11-15 | ₹40,000 | ₹0 | **Pending** |
| `STU-0331` | Priya Agarwal | JEE 2027 Morning | Jaipur Main | 2025-10-10 | ₹30,000 | ₹30,000 | **Paid** |
| `STU-0445` | Sneha Patel | NEET 2027 Evening | Ajmer | 2025-07-15 | ₹40,000 | ₹0 | **Overdue** |

*Note: Overdue days and balances are computed dynamically using the system date (`datetime.date.today()`). They are never hardcoded.*

---

## 5. Core Business Logic Implemented

1. **Fee Ledger & Overdue Calculation**:
   - Dynamic calculation of total fees, discounts, amount paid, and outstanding balance.
   - 4 scheduled quarterly instalments per student.
   - Dynamic calculation of overdue days based on system calendar date.
   - Supports partial and full payment recording.

2. **Payments & Idempotency**:
   - `reference_no` deduplication prevents double-processing (returns `409 Conflict`).
   - Unmatched payments queue (`GET /api/v1/payments/unmatched`): unmatched payments are never marked as paid automatically and must be verified by accounts.
   - GST-compliant receipts generated automatically with configurable GST rate (`18%` default), calculating base amount, CGST, and SGST.

3. **Reminders & Auto-Cancellation**:
   - Reminders scheduled: 3 days prior, on due date, and 3 days post due date.
   - Hindi and English message templates supported.
   - **Immediate Auto-Cancellation**: When an instalment becomes fully paid, all pending/scheduled reminders for that instalment are automatically cancelled.
   - Reminders are strictly suppressed for paid instalments.

4. **Refund Calculator**:
   - Pro-rata refund calculation considering course duration, withdrawal date, paid amount, and material/processing deductions.
   - Validates the 10-day refund deadline window.
   - Mandatory policy code required before final accounts approval.
   - Never processes automatic payouts; all decisions logged to `audit_logs`.

5. **AI Dropout Risk Analysis**:
   - Evaluates missed instalments, attendance rate, and test score trends.
   - Uses Gemini API when `GEMINI_API_KEY` is provided; safely falls back to explainable rule-based scoring otherwise.
   - Generates counsellor tasks only. Never alters fees or parent communication automatically.

6. **Bulk Uploads & Reporting**:
   - CSV bulk upload for attendance and test scores with row-level validation.
   - Exports centre-wise collection, batch dues, overdue ageing, and Tally-compatible voucher CSV (`Date`, `Voucher Type`, `Voucher No`, `Ledger Name`, `Amount`, `Dr/Cr`).

---

## 6. API Route Reference

- `POST /api/v1/auth/login` — Password login (Students, Accounts, Admin)
- `POST /api/v1/auth/send-otp` — Request OTP for mobile
- `POST /api/v1/auth/verify-otp` — Verify OTP & login (Parents)
- `GET  /api/v1/students` — List students with search and filters
- `GET  /api/v1/students/{id}` — Student profile & instalment schedule
- `GET  /api/v1/fees/{id}/ledger` — Full fee ledger & breakdown
- `POST /api/v1/fees/{id}/discounts` — Apply authorized fee discount
- `GET  /api/v1/payments` — Payment transactions list
- `POST /api/v1/payments` — Record payment
- `GET  /api/v1/payments/unmatched` — Unmatched payments queue
- `POST /api/v1/payments/{id}/match` — Match payment to student
- `POST /api/v1/payments/create-link` — Create payment link
- `GET  /api/v1/payments/{id}/receipt` — GST receipt breakdown
- `GET  /api/v1/reminders` — List reminders
- `POST /api/v1/reminders/preview` — Preview reminder in English or Hindi
- `POST /api/v1/reminders/{id}/send` — Trigger reminder delivery
- `POST /api/v1/refunds/estimate` — Pro-rata refund calculator
- `POST /api/v1/refunds/request` — Save refund estimate for review
- `POST /api/v1/refunds/requests/{id}/approve` — Approve refund with policy code
- `GET  /api/v1/dashboard/summary` — Overview KPI metrics
- `GET  /api/v1/reports/centre-collection` — Centre-wise collection report / CSV
- `GET  /api/v1/reports/batch-dues` — Batch-wise dues report / CSV
- `GET  /api/v1/reports/tally-export` — Tally-compatible voucher CSV
- `POST /api/v1/attendance/bulk-upload` — CSV attendance upload
- `POST /api/v1/tests/bulk-upload` — CSV test scores upload
- `GET  /api/v1/risk/tasks` — Counsellor risk monitoring tasks
- `POST /api/v1/consent` — Parental consent record

