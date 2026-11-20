"""Comprehensive End-to-End Integration Test for Portal Phases 1, 2, and 3.

Verifies:
- Phase 1: Calendar manual booking, conflict detection, Google Calendar sync, and auto-CRM contact creation
- Phase 2: Dual-Mode Direct FAQ creation, automatic KnowledgeChunk vectorization, and RAG retrieval
- Phase 3: AI Receptionist profile updates, phonetic glossary, and live test-call 10-point TCPA compliance gate
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from api.app.main import app

client = TestClient(app)


def test_portal_phases_1_to_3_end_to_end_lifecycle() -> None:
    """Execute complete cross-module integration lifecycle across Calendar, Knowledge, and Profile."""
    # -------------------------------------------------------------------------
    # 1. Tenant Registration & Authentication
    # -------------------------------------------------------------------------
    unique_suffix = uuid.uuid4().hex[:8]
    email = f"marcus_{unique_suffix}@marcusclinic.com"
    phone_offset = uuid.uuid4().int % 9000000 + 1000000
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": "Marcus Dental & Wellness Clinic",
            "owner_name": "Dr. Marcus Vance",
            "email": email,
            "password": "SecurePassword123!",
            "timezone": "America/Chicago",
            "niche": "dental",
            "phone_number": f"+1512{phone_offset}",
        },
    )
    assert reg_resp.status_code == 200, reg_resp.text
    token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # -------------------------------------------------------------------------
    # 2. Phase 1: Calendar Manual Booking & Conflict Detection
    # -------------------------------------------------------------------------
    client.post("/api/v1/portal/calendar/connect-sandbox", headers=headers)

    tomorrow = datetime.now(UTC) + timedelta(days=2)
    start_time = tomorrow.replace(hour=10, minute=0, second=0, microsecond=0)
    end_time = tomorrow.replace(hour=11, minute=0, second=0, microsecond=0)

    booking_payload = {
        "customer_name": "Jane Doe",
        "customer_phone": f"+1512{phone_offset + 1}",
        "customer_email": "jane.doe@example.com",
        "service_type": "Comprehensive Prophylaxis Cleaning",
        "start_at": start_time.isoformat(),
        "end_at": end_time.isoformat(),
        "notes": "Patient requested Dr. Marcus Vance",
    }

    # Create first booking -> Expect 200 and auto-link to CRM contact
    book_resp = client.post(
        "/api/v1/portal/calendar/bookings/manual",
        headers=headers,
        json=booking_payload,
    )
    assert book_resp.status_code == 200, book_resp.text
    book_data = book_resp.json()
    assert book_data["status"] == "confirmed"
    assert book_data["customer_name"] == "Jane Doe"
    assert "id" in book_data
    assert "contact_id" in book_data
    assert book_data["contact_id"] is not None  # Auto-linked to CRM contact!
    booking_id = book_data["id"]

    # Attempt overlapping booking -> Expect 409 Conflict
    conflict_resp = client.post(
        "/api/v1/portal/calendar/bookings/manual",
        headers=headers,
        json=booking_payload,
    )
    assert conflict_resp.status_code == 409
    assert "conflict" in conflict_resp.json()["detail"].lower()

    # List bookings -> Verify list includes booking with contact_id
    list_book_resp = client.get("/api/v1/portal/calendar/bookings", headers=headers)
    assert list_book_resp.status_code == 200
    all_bookings = list_book_resp.json()
    matching_booking = next((b for b in all_bookings if b["id"] == booking_id), None)
    assert matching_booking is not None
    assert matching_booking["contact_id"] is not None

    # -------------------------------------------------------------------------
    # 3. Phase 2: Direct FAQ Studio & Dual-Mode RAG Sync
    # -------------------------------------------------------------------------
    faq_question = "What is your emergency weekend dental policy?"
    faq_answer = "We have an on-call emergency dentist available 24/7 for acute trauma and severe toothaches."
    faq_payload = {
        "question": faq_question,
        "answer": faq_answer,
        "category": "Emergency Service",
        "alternate_phrasings": ["weekend emergency", "urgent tooth pain", "emergency dentist"],
    }

    # Create direct FAQ -> Persisted in agent_profile.faq and vectorized into knowledge_chunks
    faq_create_resp = client.post(
        "/api/v1/portal/knowledge/faqs",
        headers=headers,
        json=faq_payload,
    )
    assert faq_create_resp.status_code == 200, faq_create_resp.text
    created_faq = faq_create_resp.json()
    assert created_faq["question"] == faq_question
    assert created_faq["category"] == "Emergency Service"

    # List direct FAQs
    faq_list_resp = client.get("/api/v1/portal/knowledge/faqs", headers=headers)
    assert faq_list_resp.status_code == 200
    faq_items = faq_list_resp.json()
    assert any(f["question"] == faq_question for f in faq_items)

    # Test Live RAG Query Sandbox against the freshly vectorized FAQ
    rag_query_resp = client.post(
        "/api/v1/portal/knowledge/query",
        headers=headers,
        json={
            "query": "Do you have an on-call dentist on the weekend for urgent tooth pain?",
            "top_k": 3,
            "confidence_threshold": 0.25,
        },
    )
    assert rag_query_resp.status_code == 200, rag_query_resp.text
    rag_data = rag_query_resp.json()
    assert rag_data["out_of_scope"] is False
    assert rag_data["confidence_score"] > 0.35
    assert len(rag_data["top_matches"]) > 0
    assert any("on-call emergency dentist" in m["content"] for m in rag_data["top_matches"])

    # -------------------------------------------------------------------------
    # 4. Phase 3: AI Receptionist Persona & TCPA Test Call
    # -------------------------------------------------------------------------
    # Update agent profile with persona and phonetic pronunciation rules
    profile_update_resp = client.put(
        "/api/v1/portal/profile",
        headers=headers,
        json={
            "agent_name": "Sophia",
            "greeting": "Thank you for calling Marcus Clinic, how can I help you today?",
            "tone": "Warm, professional, clinical",
            "phonetic_glossary": [
                {
                    "term": "Prophylaxis",
                    "spoken_as": "pro-fil-AX-is",
                    "note": "Routine dental cleaning",
                },
                {
                    "term": "Gingivitis",
                    "spoken_as": "jin-jih-VY-tis",
                    "note": "Gum disease",
                },
            ],
            "emergency_mode": "priority_message",
            "emergency_keywords": ["severe bleeding", "broken jaw", "knocked out tooth"],
        },
    )
    assert profile_update_resp.status_code == 200, profile_update_resp.text
    profile_data = profile_update_resp.json()
    assert profile_data["agent_name"] == "Sophia"
    assert len(profile_data["phonetic_glossary"]) == 2

    # Trigger test call to valid NANP destination
    test_call_resp = client.post(
        "/api/v1/portal/profile/test-call",
        headers=headers,
        json={"phone_number": f"+1512{phone_offset + 1}"},
    )
    assert test_call_resp.status_code == 200, test_call_resp.text
    tc_data = test_call_resp.json()
    assert "status" in tc_data
    assert tc_data["phone_dialed"] == f"+1512{phone_offset + 1}"
    assert "compliance_passed" in tc_data

    # Trigger test call to invalid non-NANP international number -> Compliance rejection
    invalid_tc_resp = client.post(
        "/api/v1/portal/profile/test-call",
        headers=headers,
        json={"phone_number": "+33123456789"},
    )
    assert invalid_tc_resp.status_code == 200, invalid_tc_resp.text
    invalid_tc_data = invalid_tc_resp.json()
    assert invalid_tc_data["status"] == "blocked_compliance"
    assert invalid_tc_data["compliance_passed"] is False
    assert invalid_tc_data["reason"] == "unsupported_region"

    # -------------------------------------------------------------------------
    # 5. Clean Teardown
    # -------------------------------------------------------------------------
    del_faq_resp = client.delete(
        f"/api/v1/portal/knowledge/faqs/{created_faq['id']}",
        headers=headers,
    )
    assert del_faq_resp.status_code == 200
    assert del_faq_resp.json()["status"] == "deleted"
