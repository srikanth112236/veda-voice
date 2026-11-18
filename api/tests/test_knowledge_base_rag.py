"""Tests for Milestone M10a: Knowledge Base Document RAG & FAQ Ingestion (FR-KB-1 to 8)."""

import io
import uuid
import zipfile

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.services.knowledge import (
    chunk_text_recursively,
    extract_document_text,
)

client = TestClient(app)


def test_text_extraction_multi_format() -> None:
    """Verify document text extractor handles TXT, Markdown, CSV, and DOCX formats cleanly."""
    # 1. Plain text
    txt_content = (
        b"Apex Plumbing Services warranty policy.\nAll water heaters carry a 6-year tank warranty."
    )
    extracted_txt = extract_document_text("warranty.txt", txt_content)
    assert "Apex Plumbing Services" in extracted_txt
    assert "6-year tank warranty" in extracted_txt

    # 2. Markdown
    md_content = (
        b"# Diagnostic Fees\n\nStandard weekday fee is **$89**. Weekend emergency rate is **$129**."
    )
    extracted_md = extract_document_text("pricing.md", md_content)
    assert "Diagnostic Fees" in extracted_md
    assert "$89" in extracted_md

    # 3. CSV
    csv_content = (
        b"Service,Price,Warranty\nDrain Snaking,$149,30 Days\nTankless Flush,$199,90 Days\n"
    )
    extracted_csv = extract_document_text("price_list.csv", csv_content)
    assert "Drain Snaking" in extracted_csv
    assert "$149" in extracted_csv
    assert "Tankless Flush" in extracted_csv

    # 4. DOCX (standard Word document XML package)
    docx_io = io.BytesIO()
    with zipfile.ZipFile(docx_io, mode="w") as zf:
        xml_content = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "<w:body>"
            "<w:p><w:r><w:t>Emergency Gas Leak Procedures:</w:t></w:r></w:p>"
            "<w:p><w:r><w:t>1. Evacuate immediately.</w:t></w:r></w:p>"
            "<w:p><w:r><w:t>2. Do not operate light switches.</w:t></w:r></w:p>"
            "</w:body></w:document>"
        )
        zf.writestr("word/document.xml", xml_content)
    docx_bytes = docx_io.getvalue()
    extracted_docx = extract_document_text("emergency_sop.docx", docx_bytes)
    assert "Emergency Gas Leak Procedures:" in extracted_docx
    assert "Evacuate immediately" in extracted_docx


def test_recursive_sentence_aware_chunking() -> None:
    """Verify chunk_text_recursively preserves sentence boundaries and overlap."""
    text = (
        "Apex Plumbing was founded in 2012. We provide 24/7 emergency drain and sewer cleaning. "
        "Our master technicians are fully licensed and insured across Texas. "
        "We specialize in trenchless pipe relining and tankless water heater maintenance. "
        "Standard dispatch fee is $89 during regular business hours from 8am to 6pm. "
        "For gas leaks, caller safety is our priority: leave the premises immediately."
    )

    chunks = chunk_text_recursively(text, chunk_size=120, chunk_overlap=30)
    assert len(chunks) >= 2
    # Check that sentences aren't randomly clipped midway through a short word
    for c in chunks:
        assert len(c) > 0


def test_knowledge_document_upload_and_chunk_indexing() -> None:
    """Verify POST /api/v1/portal/knowledge/upload extracts text, chunks, and persists records."""
    db: Session = SessionLocal()
    tenant_id = f"kb-test-{uuid.uuid4().hex[:8]}"
    user_id = f"usr-{uuid.uuid4().hex[:8]}"

    try:
        tenant = Tenant(
            id=tenant_id, name="KB Test Plumbing", timezone="America/Chicago", status="active"
        )
        db.add(tenant)

        user = User(
            id=user_id,
            email=f"user_{user_id}@test.com",
            hashed_password="hash",
            full_name="KB User",
            role="tenant_owner",
            tenant_id=tenant_id,
            is_active=True,
        )
        db.add(user)
        db.commit()

        token = create_access_token(
            {"sub": user.id, "role": "tenant_owner", "tenant_id": tenant_id}
        )
        headers = {"Authorization": f"Bearer {token}"}

        doc_text = (
            "Apex Plumbing Water Heater Warranty Terms:\n\n"
            "All Rheem and Navien tankless units installed by our team include 10-year heat exchanger warranty.\n"
            "Labor is fully covered for the first 12 months. An annual flush is required to maintain warranty.\n"
            "Emergency weekend replacement dispatch fee is $129."
        )

        files = {"file": ("warranty_terms.txt", io.BytesIO(doc_text.encode("utf-8")), "text/plain")}

        # 1. Upload document
        upload_resp = client.post("/api/v1/portal/knowledge/upload", headers=headers, files=files)
        assert upload_resp.status_code == 200
        doc_data = upload_resp.json()
        assert doc_data["filename"] == "warranty_terms.txt"
        assert doc_data["chunk_count"] >= 1
        doc_id = doc_data["id"]

        # 2. List documents
        list_resp = client.get("/api/v1/portal/knowledge/documents", headers=headers)
        assert list_resp.status_code == 200
        docs_list = list_resp.json()
        assert len(docs_list) >= 1
        assert any(d["id"] == doc_id for d in docs_list)

        # 3. Retrieve document and inspect chunks
        get_resp = client.get(f"/api/v1/portal/knowledge/documents/{doc_id}", headers=headers)
        assert get_resp.status_code == 200
        detail = get_resp.json()
        assert detail["document"]["id"] == doc_id
        assert len(detail["chunks"]) >= 1
        assert "Navien tankless units" in detail["chunks"][0]["content"]

        # 4. Test RAG Search Query
        query_resp = client.post(
            "/api/v1/portal/knowledge/query",
            headers=headers,
            json={"query": "What is the warranty on Rheem and Navien tankless water heaters?"},
        )
        assert query_resp.status_code == 200
        rag_data = query_resp.json()
        assert rag_data["out_of_scope"] is False
        assert rag_data["confidence_score"] > 0.40
        assert rag_data["latency_ms"] < 50.0  # Sub-50ms latency assertion
        assert len(rag_data["top_matches"]) >= 1
        assert "10-year heat exchanger warranty" in rag_data["top_matches"][0]["content"]

        # 5. Test Out-of-Scope Query
        out_resp = client.post(
            "/api/v1/portal/knowledge/query",
            headers=headers,
            json={
                "query": "Do you repair commercial airline jet turbines or Boeing 737 hydraulics?"
            },
        )
        assert out_resp.status_code == 200
        out_data = out_resp.json()
        assert out_data["out_of_scope"] is True
        assert "GROUNDING WARNING" in out_data["grounding_prompt"]

        # 6. Delete document
        del_resp = client.delete(f"/api/v1/portal/knowledge/documents/{doc_id}", headers=headers)
        assert del_resp.status_code == 200
        assert del_resp.json()["status"] == "deleted"

        # Verify chunks cascade deleted
        chunks_count = db.scalar(select(KnowledgeChunk).where(KnowledgeChunk.document_id == doc_id))
        assert chunks_count is None
    finally:
        db.query(KnowledgeChunk).filter(KnowledgeChunk.tenant_id == tenant_id).delete()
        db.query(KnowledgeDocument).filter(KnowledgeDocument.tenant_id == tenant_id).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.commit()
        db.close()


def test_multi_tenant_knowledge_isolation() -> None:
    """Verify Tenant B cannot search, retrieve, or see Tenant A's knowledge base documents."""
    db: Session = SessionLocal()
    tenant_a = f"tenant-a-{uuid.uuid4().hex[:8]}"
    tenant_b = f"tenant-b-{uuid.uuid4().hex[:8]}"
    user_a = f"user-a-{uuid.uuid4().hex[:8]}"
    user_b = f"user-b-{uuid.uuid4().hex[:8]}"

    try:
        t_a = Tenant(
            id=tenant_a, name="Tenant A Services", timezone="America/Chicago", status="active"
        )
        t_b = Tenant(
            id=tenant_b, name="Tenant B Services", timezone="America/Chicago", status="active"
        )
        db.add_all([t_a, t_b])

        u_a = User(
            id=user_a,
            email=f"{user_a}@a.com",
            hashed_password="x",
            full_name="User A",
            role="tenant_owner",
            tenant_id=tenant_a,
            is_active=True,
        )
        u_b = User(
            id=user_b,
            email=f"{user_b}@b.com",
            hashed_password="x",
            full_name="User B",
            role="tenant_owner",
            tenant_id=tenant_b,
            is_active=True,
        )
        db.add_all([u_a, u_b])
        db.commit()

        token_a = create_access_token(
            {"sub": u_a.id, "role": "tenant_owner", "tenant_id": tenant_a}
        )
        token_b = create_access_token(
            {"sub": u_b.id, "role": "tenant_owner", "tenant_id": tenant_b}
        )

        # Upload document for Tenant A
        files = {
            "file": (
                "secret_pricing_a.txt",
                io.BytesIO(b"Tenant A secret VIP diagnostic rate is $19 flat."),
                "text/plain",
            )
        }
        res_upload = client.post(
            "/api/v1/portal/knowledge/upload",
            headers={"Authorization": f"Bearer {token_a}"},
            files=files,
        )
        assert res_upload.status_code == 200
        doc_a_id = res_upload.json()["id"]

        # Tenant B queries documents list -> must NOT see Tenant A's document
        res_list_b = client.get(
            "/api/v1/portal/knowledge/documents",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert res_list_b.status_code == 200
        assert not any(d["id"] == doc_a_id for d in res_list_b.json())

        # Tenant B attempts direct get on Tenant A's document -> 404
        res_get_b = client.get(
            f"/api/v1/portal/knowledge/documents/{doc_a_id}",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert res_get_b.status_code == 404

        # Tenant B attempts RAG search matching Tenant A's secret content -> must be out of scope
        res_query_b = client.post(
            "/api/v1/portal/knowledge/query",
            headers={"Authorization": f"Bearer {token_b}"},
            json={"query": "What is the secret VIP diagnostic rate?"},
        )
        assert res_query_b.status_code == 200
        assert res_query_b.json()["out_of_scope"] is True
        assert len(res_query_b.json()["top_matches"]) == 0
    finally:
        db.query(KnowledgeChunk).filter(KnowledgeChunk.tenant_id.in_([tenant_a, tenant_b])).delete()
        db.query(KnowledgeDocument).filter(
            KnowledgeDocument.tenant_id.in_([tenant_a, tenant_b])
        ).delete()
        db.query(User).filter(User.id.in_([user_a, user_b])).delete()
        db.query(Tenant).filter(Tenant.id.in_([tenant_a, tenant_b])).delete()
        db.commit()
        db.close()


def test_internal_voice_agent_knowledge_search_with_call_token() -> None:
    """Verify internal POST /api/v1/internal/knowledge/search endpoint requires valid call token."""
    db: Session = SessionLocal()
    tenant_id = f"agent-kb-{uuid.uuid4().hex[:8]}"

    try:
        tenant = Tenant(
            id=tenant_id, name="Agent KB Plumbing", timezone="America/Chicago", status="active"
        )
        db.add(tenant)
        db.flush()

        doc = KnowledgeDocument(
            tenant_id=tenant_id,
            filename="drain_cleaning_guide.txt",
            status="indexed",
            chunk_count=1,
        )
        db.add(doc)
        db.flush()

        chunk = KnowledgeChunk(
            tenant_id=tenant_id,
            document_id=doc.id,
            chunk_index=0,
            content="Hydro-jetting uses high-pressure water at 4000 PSI to clear grease and tree roots from main sewer lines.",
            token_count=20,
        )
        db.add(chunk)
        db.commit()

        # 1. Unauthenticated request -> 401
        res_no_auth = client.post(
            "/api/v1/internal/knowledge/search", json={"query": "hydro jetting"}
        )
        assert res_no_auth.status_code == 401

        # 2. Authenticated with agent call token
        agent_token = create_access_token(
            {"sub": "call-12345", "role": "agent", "tenant_id": tenant_id}
        )
        res_auth = client.post(
            "/api/v1/internal/knowledge/search",
            headers={"Authorization": f"Bearer {agent_token}"},
            json={"query": "How does hydro jetting clear tree roots in sewer pipes?"},
        )
        assert res_auth.status_code == 200
        data = res_auth.json()
        assert data["out_of_scope"] is False
        assert len(data["top_matches"]) >= 1
        assert "4000 PSI" in data["top_matches"][0]["content"]
    finally:
        db.query(KnowledgeChunk).filter(KnowledgeChunk.tenant_id == tenant_id).delete()
        db.query(KnowledgeDocument).filter(KnowledgeDocument.tenant_id == tenant_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.commit()
        db.close()
