# FeeFlow — Deployment & Operational Runbook

> **Positioning:** Every rupee accounted for. Every parent informed.
> **Repository:** https://github.com/iamerharsh333-jpg/feeflow
> **Target Environment:** Local macOS / Linux / Windows (Python 3.11+, Node.js 18+)

---

## 1. System Architecture & Prerequisites

FeeFlow is structured as an enterprise-grade coaching institute fee management, payment reconciliation, automated reminder, and retention platform.

### Required Runtimes
- **Python:** 3.11 or higher
- **Node.js:** v18.0.0 or higher (v20+ recommended)
- **Package Managers:** `npm` (frontend) and `pip` or `venv` (backend)
- **Database Engine:** SQLite (default for development/evaluation; fully ACID compliant with zero external dependencies) or PostgreSQL (supported via `DATABASE_URL`)

---

## 2. Environment Variables Configuration

Create a `.env` file in the project root or configure these variables in your deployment environment. **No sensitive API keys or paid credentials are required for local evaluation.**

| Variable Name | Required | Default Value | Description |
|---|---|---|---|
| `DATABASE_URL` | Optional | `sqlite:///./feeflow.db` | SQLAlchemy connection string |
| `JWT_SECRET` | Optional | `feeflow-development-secret-change-in-production` | Secret key for HS256 JWT access tokens |
| `JWT_ALGORITHM` | Optional | `HS256` | Token signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Optional | `480` | JWT token validity window (8 hours) |
| `STANDALONE_WORKER_MODE` | Optional | `false` | When `true`, disables in-process scheduler in FastAPI |
| `JOB_LOCK_LEASE_SECONDS` | Optional | `300` | Lease expiry duration for distributed worker locks |
| `REMINDER_INTERVAL_MINUTES`| Optional | `60` | Background reminder scheduler execution interval |
| `RISK_SCAN_INTERVAL_HOURS` | Optional | `24` | Automated dropout risk scan execution interval |
| `VITE_API_URL` | Optional | `http://localhost:8000` | Frontend API client base URL |

---

## 3. Step-by-Step Local Setup

### Step A: Clone and Prepare Workspace
```bash
git clone https://github.com/iamerharsh333-jpg/feeflow.git
cd feeflow
```

### Step B: Backend Setup & Dependency Installation
```bash
# Navigate to backend or root
python3 -m venv backend/venv
source backend/venv/bin/activate

# Install Python dependencies
pip install --upgrade pip
pip install -r backend/requirements.txt
```

### Step C: Database Initialization & Idempotent Seeding
```bash
# Set PYTHONPATH to include backend directory
export PYTHONPATH=backend

# Run seed script to establish tables, centres, users, fee structures, and sample students
python backend/seed.py
```

### Step D: Frontend Setup & Dependency Installation
```bash
# Install Node dependencies
npm install
```

---

## 4. Service Startup Commands

FeeFlow can be run in two execution topologies:

### Topology 1: Standard Monolithic Mode (Dev / Evaluation)
In standard mode, FastAPI runs with its integrated lifecycle scheduler.

1. **Terminal 1 — Backend API Server:**
   ```bash
   PYTHONPATH=backend backend/venv/bin/python backend/run.py
   # Or using uvicorn directly:
   # uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   *Health Check:* `http://localhost:8000/docs` (Swagger UI)

2. **Terminal 2 — Frontend Application:**
   ```bash
   npm run dev
   ```
   *Application Access:* `http://localhost:5173`

---

### Topology 2: Distributed Production Worker Mode (Multi-Process)
In multi-worker web environments (e.g., Gunicorn with 4 Uvicorn workers), automated reminders and risk scans are isolated into a standalone worker process with distributed DB leasing (`JobLock`).

1. **Terminal 1 — API Server (Standalone Worker Mode Enabled):**
   ```bash
   STANDALONE_WORKER_MODE=true PYTHONPATH=backend backend/venv/bin/python backend/run.py
   ```

2. **Terminal 2 — Standalone Background Worker:**
   ```bash
   PYTHONPATH=backend backend/venv/bin/python run_worker.py
   # Or:
   # PYTHONPATH=backend backend/venv/bin/python -m app.worker
   ```

3. **Terminal 3 — Frontend Application:**
   ```bash
   npm run dev
   ```

---

## 5. Verified Demo Credentials

The seeded database contains pre-configured credentials across all 6 platform roles:

| Role | Username / Identifier | Password / OTP | Associated Scope / Notes |
|---|---|---|---|
| **System Administrator** | `admin@feeflow.demo` | `Demo@12345` | Global access across all centres, audit logs, and settings |
| **Accounts Executive** | `accounts@feeflow.demo` | `Demo@12345` | Janakpuri Centre (Centre 1); ledger, payments, reconciliation |
| **Centre Manager** | `manager@feeflow.demo` | `Demo@12345` | Janakpuri Centre; centre-level isolation, approvals |
| **Academic Counsellor** | `counsellor@feeflow.demo` | `Demo@12345` | Retention tasks only; confidential financial amounts masked |
| **Student (Aarav Meena)** | `STU-0412` | `Student@123` | JEE 2027 Morning; ₹30,000 due, ₹30,000 paid (100% Paid) |
| **Student (Ishita Sharma)**| `STU-0587` | `Student@123` | JEE 2027 Evening; ₹30,000 due, ₹15,000 paid (Partial Dues) |
| **Student (Mohit Gurjar)** | `STU-0219` | `Student@123` | NEET 2027 Morning; ₹40,000 due, ₹0 paid (Overdue) |
| **Parent (Aarav Meena)** | `9876543210` | OTP: `123456` | Bilingual Parent Portal (English & Hindi) |
| **Parent (Ishita Sharma)**| `9123456789` | OTP: `654321` | Active partial balance; instant Razorpay mock checkout |
| **Parent (Mohit Gurjar)** | `9988776655` | OTP: `111222` | Pending overdue instalment; instant payment & receipts |
| **Evaluator Demo Student**| `STU-0999` (Rohan Verma) | `Student@123` | High-risk dropout scenario for interactive evaluation |

*Note: For any other parent phone number, an OTP is generated and returned directly in the `/auth/send-otp` response for developer convenience.*

---

## 6. Core Workflow Verification Guide

### 1. Parent Portal 5-Second Test (Mobile Usability)
1. Navigate to `http://localhost:5173/parent-portal`.
2. Enter mobile number `9123456789` and click **Send OTP**.
3. Enter OTP `654321` and verify.
4. **5-Second Verification:** Observe that within 5 seconds, the parent clearly sees:
   - Total Balance Due (`₹45,000.00`)
   - Next Instalment Due Date
   - Primary **Pay Now** button
5. Toggle the language switch (`English` / `हिंदी`) to inspect native Hindi typography and translated terminology.
6. Click **Pay Now**, select Mock UPI / Net Banking, and click **Simulate Successful Payment**.
7. Confirm that the fee ledger updates immediately, balance decreases, and an official GST tax receipt is generated with print support.

### 2. Payment Reconciliation & Unmatched Exception Queue
1. Log in as `accounts@feeflow.demo` at `http://localhost:5173/login`.
2. Navigate to **Payments & Collections** (`/payments`).
3. Click **Record Offline Payment**, enter an unrecognised student roll number (e.g., `STU-UNKNOWN-9999`) with a reference number `NEFT-REF-8899`.
4. Observe that the transaction enters the **Unmatched Payments Exception Queue** with status `Unmatched`.
5. Notice that no student ledger or instalment was prematurely marked as paid.
6. Open the transaction in the queue, select **Reconcile**, assign it to student `STU-0219` (Mohit Gurjar), and submit.
7. Observe that the status transitions to `Reconciled`, the audit trail logs the reconciliation timestamp and user identity, and the instalment is updated with exact Decimal precision.

### 3. Explainable AI Dropout-Risk Workflow
1. Navigate to **Risk & Counselling** (`/risk-counselling`).
2. Inspect the **Evaluator Demo Scenario** banner for student `STU-0999` (Rohan Verma).
3. Click **Seed Demo Scenario** (if not already seeded) and **Trigger Risk Scan**.
4. Observe the explainable score breakdown:
   - Attendance Factor: 58% attendance (down from 85%) $\rightarrow$ 35 pts
   - Academic Factor: Test scores 72% $\rightarrow$ 61% $\rightarrow$ 43% $\rightarrow$ 35 pts
   - Financial Factor: Instalment overdue by 25 days $\rightarrow$ 15 pts
   - Total Risk Score: **85/100 (High Risk)**
5. Click **Counsellor Action**, select **Mark False Positive**, enter the mandatory dismissal justification (e.g., *"Medical certificate submitted; student attended remedial batch"*), and click **Submit Decision**.
6. Verify that the task status updates to `False Positive`, an immutable audit record is created, and financial records remain untouched.

### 4. Automated Reminders & Scheduled Cancellation
1. Navigate to **Automations & Deadlines** (`/deadlines`).
2. Inspect scheduled reminder dispatches across the 6 policy stages:
   - `-7 days` (Upcoming early reminder)
   - `-3 days` (Upcoming final notice)
   - `0 days` (Due date reminder)
   - `+1 day` (Grace period alert)
   - `+7 days` (Overdue warning)
   - `+30 days` (Critical arrears escalation)
3. Trigger a simulation run or verify via test suite that when an instalment is fully settled, all pending future reminders are cancelled automatically.

### 5. Pro-Rata Refund Calculator & Policy Rules
1. Navigate to **Refunds** (`/refunds`).
2. Select student `STU-0587`, input withdrawal date, select the regulatory coaching refund tier (e.g., *Within 15 days of batch start: 100% tuition refund minus registration fee*).
3. Review the exact statutory deduction, GST reversal calculation, and net refundable amount.
4. Submit the refund claim; log in as `admin@feeflow.demo` or `manager@feeflow.demo` to approve or reject with audit trail logging.

---

## 7. Automated Test Suite Execution

FeeFlow includes comprehensive test suites covering financial precision, role-based access control, distributed worker locking, parent workflows, and risk safety.

```bash
# Run complete test suite (123 tests)
backend/venv/bin/pytest backend/tests/ -v

# Run targeted test suites:
# 1. Financial Decimal precision and ledger calculations
backend/venv/bin/pytest backend/tests/test_financial_precision.py -v

# 2. Standalone worker concurrency & lease locking
backend/venv/bin/pytest backend/tests/test_standalone_worker.py -v

# 3. AI dropout-risk detection and safety
backend/venv/bin/pytest backend/tests/test_ai_dropout_risk_demo.py -v

# 4. Payment reconciliation and unmatched queue
backend/venv/bin/pytest backend/tests/test_unmatched_payments.py -v

# 5. Role-based access control & centre isolation
backend/venv/bin/pytest backend/tests/test_auth_roles.py -v
```

### Production Frontend Build Verification
```bash
# TypeScript compiler check and Vite production build
npx tsc --noEmit && npm run build
```
*Expected Output:* `dist/` directory generated with zero errors in ~6-8 seconds.

---

## 8. Honest Integration Disclosures & Architecture Boundaries

To ensure complete transparency during technical evaluation:

1. **Payment Gateway:** Razorpay integration uses a sandbox/mock checkout modal with cryptographic HMAC signature verification logic on the backend. No live merchant credit card processing or live bank transfers are executed.
2. **Messaging & SMS/WhatsApp Delivery:** Notification and reminder dispatches are simulated via database logging (`reminders`, `notifications`, `audit_logs`). No paid external telephony gateways (Twilio, Gupshup, Exotel) are provisioned.
3. **Dropout-Risk Engine:** Built using a transparent, explainable rule-based scoring algorithm (weighted linear combination of attendance rate, test score delta, and overdue payment duration). It is intentionally not an opaque deep-learning model to ensure 100% explainability and regulatory auditability.
4. **Data Protection & Consent:** Parental consent tracking (`parental_consents` table) records opt-ins and timestamps; however, full DPDP 2023 compliance requires external enterprise legal data retention agreements.

