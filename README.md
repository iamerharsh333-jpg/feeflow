# FeeFlow — Fee Management & Parent Engagement Platform

A polished, full-stack fee management, payment tracking, reminder automation, and parent engagement platform for Indian coaching institutes.

---

## Architecture Overview

```
ISO/
├── src/                # React 18 + Vite + TypeScript frontend
│   ├── components/     # Reusable UI & Layout (Sidebar, TopNav, Modals, Tables)
│   ├── pages/          # Accounts, Student & Admin pages
│   ├── portal/         # Mobile-first Parent Portal
│   ├── context/        # AuthContext (Role-based JWT sessions) & AppContext
│   └── data/           # Client-side demo fallback records
├── backend/            # Python + FastAPI backend
│   ├── app/
│   │   ├── models.py   # SQLAlchemy ORM models (Students, Fees, Payments, etc.)
│   │   ├── schemas.py  # Pydantic validation schemas
│   │   ├── auth.py     # JWT & Bcrypt role-based authentication
│   │   ├── services/   # Business logic (Fees, Payments, Reminders, Refunds, Risk)
│   │   └── routers/    # REST API endpoints (all 12 feature modules)
│   ├── seed.py         # Database seeding script with mandated test records
│   ├── tests/          # Automated pytest test suite
│   ├── requirements.txt
│   └── .env.example
├── README.md
└── package.json
```

---

## 1. Frontend Quickstart (React + Vite)

```bash
npm install
npm run dev
```
- Web Application: [http://localhost:5173](http://localhost:5173)
- Unified Role Login: [http://localhost:5173/login](http://localhost:5173/login)

---

## 2. Backend Quickstart (FastAPI + SQLAlchemy)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python seed.py
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- API Base URL: `http://localhost:8000/api/v1`
- Swagger Interactive Documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health Check: `http://localhost:8000/health`

---

## 3. Running Backend Automated Tests

```bash
cd backend
./venv/bin/pytest tests -v
```
All 8 automated tests verify:
- Role-based access permissions (Parent, Student, Accounts)
- Fee ledger & dynamic overdue days calculation
- Partial and full payments with GST receipt creation
- Duplicate payment prevention (`409 Conflict`)
- Unmatched payment queue and manual matching
- Reminder scheduling and immediate auto-cancellation upon payment
- Pro-rata refund calculator & mandatory policy code approval

---

## 4. Role-Based Demo Credentials

| Role | Identifier | Password / OTP | Default Portal |
|:---|:---|:---|:---|
| **Parent** | `9876543210` | `123456` (OTP) | `/parent/dashboard` |
| **Student** | `STU-0412` | `Student@123` | `/student/dashboard` |
| **Accounts Staff** | `accounts@feeflow.demo` | `Demo@12345` | `/accounts/dashboard` |

---

## 5. Mandated Seed Records

| Student ID | Student Name | Batch | Centre | Due Date | Instalment Amount | Paid Amount | Status |
|:---|:---|:---|:---|:---|---:|---:|:---|
| `STU-0412` | Aarav Meena | JEE 2027 Morning | Jaipur Main | 2026-10-10 | ₹30,000 | ₹30,000 | **Paid** |
| `STU-0587` | Ishita Sharma | JEE 2027 Evening | Jaipur Main | 2026-10-10 | ₹30,000 | ₹15,000 | **Partially Paid** |
| `STU-0219` | Mohit Gurjar | NEET 2027 Morning | Kota | 2026-11-15 | ₹40,000 | ₹0 | **Pending** |
| `STU-0331` | Priya Agarwal | JEE 2027 Morning | Jaipur Main | 2025-10-10 | ₹30,000 | ₹30,000 | **Paid** |
| `STU-0445` | Sneha Patel | NEET 2027 Evening | Ajmer | 2025-07-15 | ₹40,000 | ₹0 | **Overdue** |
