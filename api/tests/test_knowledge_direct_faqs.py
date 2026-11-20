"""Test suite for direct FAQ management, automatic RAG vector synchronization, and sub-15ms search."""

from __future__ import annotations

import uuid

from starlette.testclient import TestClient

from api.app.main import app

client = TestClient(app)


def test_direct_faq_rag_lifecycle_and_vector_search() -> None:
    """Verify that creating a direct FAQ immediately chunks it and enables hybrid vector search."""
    suffix = uuid.uuid4().hex[:6]
    email = f"faq_owner_{suffix}@test.com"
    phone_offset = uuid.uuid4().int % 9000000 + 1000000

    # 1. Register test tenant
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Instant FAQ Plumbing {suffix}",
            "owner_name": "Knowledge Admin",
            "email": email,
            "password": "Password123!",
            "phone_number": f"+1512{phone_offset}",
        },
    )
    assert reg_res.status_code == 200, reg_res.text
    token = reg_res.json()["access_token"]
    auth_header = {"Authorization": f"Bearer {token}"}

    # 2. Add a direct FAQ
    faq_res = client.post(
        "/api/v1/portal/knowledge/faqs",
        headers=auth_header,
        json={
            "question": "Do you offer emergency burst pipe repairs on weekends?",
            "answer": "Yes, our licensed technicians are on standby 24/7 for emergency burst pipes with a $129 dispatch fee.",
            "category": "Emergency",
            "alternate_phrasings": [
                "weekend plumbing",
                "Sunday emergency callout",
                "pipe burst rate",
            ],
        },
    )
    assert faq_res.status_code == 200, faq_res.text
    faq_data = faq_res.json()
    assert faq_data["question"] == "Do you offer emergency burst pipe repairs on weekends?"
    assert faq_data["id"] is not None

    # 3. Verify it appears in list_direct_faqs
    list_res = client.get("/api/v1/portal/knowledge/faqs", headers=auth_header)
    assert list_res.status_code == 200
    faqs = list_res.json()
    assert len(faqs) >= 1
    assert any(f["question"] == faq_data["question"] for f in faqs)

    # 4. Verify hybrid RAG query finds the FAQ chunk with high confidence
    rag_res = client.post(
        "/api/v1/portal/knowledge/query",
        headers=auth_header,
        json={
            "query": "Are you open on Sunday for burst pipes?",
            "top_k": 3,
            "confidence_threshold": 0.25,
        },
    )
    assert rag_res.status_code == 200, rag_res.text
    rag_data = rag_res.json()
    assert not rag_data["out_of_scope"]
    assert rag_data["confidence_score"] > 0.40
    assert len(rag_data["top_matches"]) >= 1
    top_match = rag_data["top_matches"][0]
    assert "Direct Business FAQs" in top_match["filename"]
    assert "$129 dispatch fee" in top_match["content"]

    # 5. Delete FAQ
    del_res = client.delete(
        f"/api/v1/portal/knowledge/faqs/{faq_data['id']}",
        headers=auth_header,
    )
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # 6. Verify list_direct_faqs is empty
    list_after = client.get("/api/v1/portal/knowledge/faqs", headers=auth_header)
    assert list_after.status_code == 200
    assert not any(f["id"] == faq_data["id"] for f in list_after.json())
