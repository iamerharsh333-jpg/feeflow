import pytest
import os
import sys
import datetime
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import Base, get_db
from app.main import app
from app.auth import create_access_token, hash_password
from app.models import Centre, User, Student, Instalment

# Shared in-memory SQLite engine with StaticPool
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

@pytest.fixture(scope="function", autouse=True)
def setup_test_db():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    session = TestingSessionLocal()

    # Seed baseline
    c = Centre(id=1, name="Jaipur Main", code="JM-01", city="Jaipur")
    c2 = Centre(id=2, name="Jaipur West", code="JW-02", city="Jaipur")
    session.add_all([c, c2])
    session.flush()

    # Accounts user
    acc = User(
        identifier="accounts@feeflow.demo",
        full_name="Accounts Staff",
        hashed_password=hash_password("Demo@12345"),
        role="accounts_executive",
        centre_id=c.id,
        is_active=True
    )
    # Admin user
    adm = User(
        identifier="admin@feeflow.demo",
        full_name="Super Admin",
        hashed_password=hash_password("Demo@12345"),
        role="admin",
        centre_id=c.id,
        is_active=True
    )
    session.add_all([acc, adm])

    # Student user
    stu = Student(
        id="STU-0412",
        roll_number="JEE27-0412",
        name="Aarav Meena",
        course="JEE 2027",
        batch="Morning",
        centre_id=c.id,
        parent_name="Rajesh Meena",
        parent_phone="9876543210",
        total_fee=Decimal("120000.00"),
        enrollment_date=datetime.date(2025, 4, 1)
    )
    stu_user = User(
        identifier="STU-0412",
        full_name="Aarav Meena",
        hashed_password=hash_password("Student@123"),
        role="student",
        centre_id=c.id,
        is_active=True
    )
    session.add_all([stu, stu_user])
    session.flush()

    ins1 = Instalment(
        id="INS-0412-1",
        student_id=stu.id,
        instalment_number=1,
        due_date=datetime.date(2025, 4, 10),
        amount=Decimal("30000.00"),
        paid_amount=Decimal("30000.00"),
        status="Paid"
    )
    ins2 = Instalment(
        id="INS-0412-2",
        student_id=stu.id,
        instalment_number=2,
        due_date=datetime.date(2026, 10, 10),
        amount=Decimal("30000.00"),
        paid_amount=Decimal("0.00"),
        status="Pending"
    )
    session.add_all([ins1, ins2])
    session.commit()
    session.close()

    yield

    Base.metadata.drop_all(bind=test_engine)

@pytest.fixture
def db_session():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture
def client():
    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture
def admin_token():
    return create_access_token({
        "sub": "admin@feeflow.demo",
        "role": "admin",
        "name": "Super Admin"
    })

@pytest.fixture
def accounts_token():
    return create_access_token({
        "sub": "accounts@feeflow.demo",
        "role": "accounts_executive",
        "name": "Accounts Staff",
        "centre_id": 1
    })

@pytest.fixture
def student_token():
    return create_access_token({
        "sub": "STU-0412",
        "role": "student",
        "name": "Aarav Meena",
        "student_id": "STU-0412"
    })

@pytest.fixture
def parent_token():
    return create_access_token({
        "sub": "9876543210",
        "role": "parent",
        "name": "Rajesh Meena",
        "student_id": "STU-0412"
    })
