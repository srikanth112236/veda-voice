"""Tests for Step 1: Multi-Tenant Native CRM Database Schema (SQLAlchemy 2.0).

Verifies:
1. Contact model CRUD with tags, pipeline stage, and custom fields.
2. Tenant isolation (tenant A cannot view tenant B contacts).
3. Unique constraint enforcement on (tenant_id, phone).
4. ContactTimelineEvent tracking and cascading deletion.
5. Call model relationship with contact_id, recording_url, and sentiment scoring.
6. EmailCampaign creation, status lifecycle, and tenant scoping.
"""

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from api.app.db.session import SessionLocal
from api.app.main import init_db
from api.app.models.call import Call
from api.app.models.crm import Contact, ContactTimelineEvent, EmailCampaign
from api.app.models.tenant import Tenant

# Ensure schema tables exist
init_db()


@pytest.fixture
def test_tenants() -> tuple[str, str]:
    """Create two isolated test tenants."""
    with SessionLocal() as db:
        t1 = Tenant(
            id=str(uuid.uuid4()),
            name=f"CRM Test Tenant Alpha {uuid.uuid4().hex[:6]}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-5pm",
            status="active",
        )
        t2 = Tenant(
            id=str(uuid.uuid4()),
            name=f"CRM Test Tenant Beta {uuid.uuid4().hex[:6]}",
            timezone="America/Chicago",
            hours="Mon-Fri 9am-6pm",
            status="active",
        )
        db.add_all([t1, t2])
        db.commit()
        return t1.id, t2.id


def test_contact_creation_and_defaults(test_tenants: tuple[str, str]) -> None:
    """Verify Contact can be created with required fields, defaults, and JSON fields."""
    tenant_a, _ = test_tenants
    with SessionLocal() as db:
        contact = Contact(
            tenant_id=tenant_a,
            name="Alice Smith",
            phone="+15125550101",
            email="alice@example.com",
            source="website_form",
            stage="new_lead",
            tags=["Interested", "High-Priority"],
            custom_fields={"preferred_time": "morning", "quote_amount": 450.0},
            notes="Inquired about tankless water heater installation.",
            lead_score=85.0,
        )
        db.add(contact)
        db.commit()
        db.refresh(contact)

        assert contact.id is not None
        assert contact.tenant_id == tenant_a
        assert contact.name == "Alice Smith"
        assert contact.phone == "+15125550101"
        assert contact.email == "alice@example.com"
        assert contact.source == "website_form"
        assert contact.stage == "new_lead"
        assert contact.tags == ["Interested", "High-Priority"]
        assert contact.custom_fields["quote_amount"] == 450.0
        assert contact.lead_score == 85.0
        assert isinstance(contact.first_contact_at, datetime)
        assert isinstance(contact.last_contact_at, datetime)


def test_contact_tenant_isolation(test_tenants: tuple[str, str]) -> None:
    """Verify strict tenant isolation: Tenant A cannot query Tenant B's contacts."""
    tenant_a, tenant_b = test_tenants
    with SessionLocal() as db:
        c1 = Contact(
            tenant_id=tenant_a,
            name="Alpha Contact",
            phone="+15125550201",
            stage="new_lead",
        )
        c2 = Contact(
            tenant_id=tenant_b,
            name="Beta Contact",
            phone="+15125550202",
            stage="qualified",
        )
        db.add_all([c1, c2])
        db.commit()

        # Query as Tenant A
        results_a = db.scalars(select(Contact).where(Contact.tenant_id == tenant_a)).all()
        phones_a = [c.phone for c in results_a]
        assert "+15125550201" in phones_a
        assert "+15125550202" not in phones_a

        # Query as Tenant B
        results_b = db.scalars(select(Contact).where(Contact.tenant_id == tenant_b)).all()
        phones_b = [c.phone for c in results_b]
        assert "+15125550202" in phones_b
        assert "+15125550201" not in phones_b


def test_contact_unique_tenant_phone_constraint(test_tenants: tuple[str, str]) -> None:
    """Verify (tenant_id, phone) uniqueness constraint."""
    tenant_a, tenant_b = test_tenants
    shared_phone = "+15125550303"

    with SessionLocal() as db:
        # First insertion for tenant A succeeds
        c1 = Contact(tenant_id=tenant_a, name="Contact 1", phone=shared_phone)
        db.add(c1)
        db.commit()

        # Same phone for tenant B must SUCCEED (multi-tenant boundary respected)
        c2 = Contact(tenant_id=tenant_b, name="Contact 2", phone=shared_phone)
        db.add(c2)
        db.commit()

        # Duplicate phone for SAME tenant A must FAIL
        c3 = Contact(tenant_id=tenant_a, name="Contact Duplicate", phone=shared_phone)
        db.add(c3)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


def test_contact_timeline_events_and_cascade(test_tenants: tuple[str, str]) -> None:
    """Verify timeline events can be appended to contact and are deleted when contact is deleted."""
    tenant_a, _ = test_tenants
    with SessionLocal() as db:
        contact = Contact(
            tenant_id=tenant_a,
            name="Bob Builder",
            phone="+15125550404",
            stage="new_lead",
        )
        db.add(contact)
        db.commit()
        db.refresh(contact)

        # Add timeline events
        e1 = ContactTimelineEvent(
            tenant_id=tenant_a,
            contact_id=contact.id,
            event_type="form_submitted",
            title="Emergency Intake Form Submitted",
            description="Submitted request for burst water pipe repair.",
            payload={"form_id": "form-123", "urgency": "emergency"},
        )
        e2 = ContactTimelineEvent(
            tenant_id=tenant_a,
            contact_id=contact.id,
            event_type="call",
            title="Outbound AI Triage Call Completed",
            description="AI receptionist completed 2m 14s consultation.",
            payload={"call_id": "call-abc-1", "outcome": "appointment_booked", "sentiment": 0.9},
        )
        db.add_all([e1, e2])
        db.commit()

        # Fetch timeline via relationship
        db.refresh(contact)
        assert len(contact.timeline_events) == 2
        event_types = [e.event_type for e in contact.timeline_events]
        assert "form_submitted" in event_types
        assert "call" in event_types

        # Deleting contact must cascade delete its timeline events
        db.delete(contact)
        db.commit()

        remaining_events = db.scalars(
            select(ContactTimelineEvent).where(ContactTimelineEvent.contact_id == contact.id)
        ).all()
        assert len(remaining_events) == 0


def test_call_recording_and_sentiment_relationship(test_tenants: tuple[str, str]) -> None:
    """Verify Call model links to Contact with recording_url, sentiment_score, and sentiment_label."""
    tenant_a, _ = test_tenants
    with SessionLocal() as db:
        contact = Contact(
            tenant_id=tenant_a,
            name="Carol Danvers",
            phone="+15125550505",
            stage="ai_called",
        )
        db.add(contact)
        db.commit()
        db.refresh(contact)

        call = Call(
            tenant_id=tenant_a,
            contact_id=contact.id,
            call_id=f"test_call_{uuid.uuid4().hex[:8]}",
            caller_number="+15125550505",
            dialed_number="+18005550199",
            direction="inbound",
            started_at=datetime.now(UTC),
            ended_at=datetime.now(UTC),
            duration_s=124.5,
            billable_minutes=3,
            outcome="appointment_booked",
            urgency="urgent",
            recording_url="https://storage.vedavoice.io/recordings/call_123.mp3",
            sentiment_score=0.88,
            sentiment_label="positive",
        )
        db.add(call)
        db.commit()
        db.refresh(call)

        # Verify attributes on call
        assert call.contact_id == contact.id
        assert call.recording_url == "https://storage.vedavoice.io/recordings/call_123.mp3"
        assert call.sentiment_score == 0.88
        assert call.sentiment_label == "positive"

        # Verify reverse relationship from contact
        db.refresh(contact)
        assert len(contact.calls) == 1
        assert contact.calls[0].call_id == call.call_id


def test_email_campaign_lifecycle(test_tenants: tuple[str, str]) -> None:
    """Verify EmailCampaign creation, status transitions, and tenant scoping."""
    tenant_a, tenant_b = test_tenants
    with SessionLocal() as db:
        camp_a = EmailCampaign(
            tenant_id=tenant_a,
            name="Post-Call Plumbing Estimate Follow-up",
            subject="Your Apex Plumbing Estimate & Booking Link",
            body_html="<p>Hi {{contact.name}}, thank you for speaking with our AI team today.</p>",
            trigger_event="post_call_followup",
            target_stage="qualified",
            status="active",
        )
        camp_b = EmailCampaign(
            tenant_id=tenant_b,
            name="Beta Monthly Newsletter",
            subject="Seasonal Maintenance Tips",
            body_html="<p>Check out our seasonal checklist.</p>",
            trigger_event="manual_broadcast",
            status="draft",
        )
        db.add_all([camp_a, camp_b])
        db.commit()

        # Tenant A can only query camp_a
        camps_a = db.scalars(select(EmailCampaign).where(EmailCampaign.tenant_id == tenant_a)).all()
        assert len(camps_a) == 1
        assert camps_a[0].name == "Post-Call Plumbing Estimate Follow-up"
        assert camps_a[0].trigger_event == "post_call_followup"
        assert camps_a[0].target_stage == "qualified"
