"""Unit tests for Phase 1: Database & Schema Evolution (FR-LOC & FR-PACK-SCHEMA)."""

import uuid

from api.app.db.session import SessionLocal
from api.app.models.industry_pack import IndustryPackVersion
from api.app.models.staff import StaffMember
from api.app.models.subscription import Subscription
from api.app.models.tenant import Tenant
from api.app.services.industry_packs import seed_default_industry_packs


def test_subscription_schema_defaults():
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(
            id=tenant_id,
            name="Schema Test Tenant",
            status="active",
        )
        db.add(tenant)
        db.flush()

        sub = Subscription(
            tenant_id=tenant.id,
            tier="starter",
            status="active",
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)

        assert sub.max_locations == 1
        assert sub.allow_custom_packs is False
        assert sub.hipaa_baa_signed is False


def test_staff_member_duty_status_schema():
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(
            id=tenant_id,
            name="Staff Test Tenant",
            status="active",
        )
        db.add(tenant)
        db.flush()

        staff = StaffMember(
            tenant_id=tenant.id,
            name="John Doe",
            email="john@example.com",
            role="technician",
            skills=["plumbing", "drain"],
        )
        db.add(staff)
        db.commit()
        db.refresh(staff)

        assert staff.duty_status == "on_duty"

        # Test modifying duty status
        staff.duty_status = "on_break"
        db.commit()
        db.refresh(staff)
        assert staff.duty_status == "on_break"


def test_industry_pack_version_validation_schema():
    with SessionLocal() as db:
        seeded = seed_default_industry_packs(db)
        assert len(seeded) >= 4

        # Check seeded version
        first_pack = seeded[0]
        version = (
            db.query(IndustryPackVersion)
            .filter(IndustryPackVersion.pack_id == first_pack.id)
            .first()
        )
        assert version is not None
        assert version.validation_status == "valid"
        assert isinstance(version.validation_errors, list)
        assert version.is_system_default is True
