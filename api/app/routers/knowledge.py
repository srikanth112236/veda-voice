"""Multi-tenant Knowledge Base document upload, parsing, and RAG query router."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_tenant
from api.app.db.session import get_db
from api.app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from api.app.models.tenant import AgentProfile, Tenant
from api.app.services.knowledge import (
    _compute_dense_vector,
    chunk_text_recursively,
    extract_document_text,
    search_knowledge_base,
)

router = APIRouter(prefix="/portal/knowledge", tags=["knowledge"])

ALLOWED_EXTENSIONS = {"txt", "md", "markdown", "csv", "docx", "pdf"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit


class KnowledgeDocumentSummary(BaseModel):
    id: str
    tenant_id: str
    filename: str
    file_size_bytes: int
    mime_type: str
    status: str
    chunk_count: int
    created_at: datetime
    updated_at: datetime


class DocumentChunkDetail(BaseModel):
    id: str
    chunk_index: int
    content: str
    token_count: int


class DocumentDetailResponse(BaseModel):
    document: KnowledgeDocumentSummary
    chunks: list[DocumentChunkDetail]


class RAGQueryRequest(BaseModel):
    query: str = Field(
        ..., description="Customer inquiry or test query to retrieve knowledge snippets for"
    )
    top_k: int = Field(3, ge=1, le=10, description="Max number of relevant chunks to retrieve")
    confidence_threshold: float = Field(
        0.30, ge=0.0, le=1.0, description="Out-of-scope cutoff score"
    )


class RAGQueryResponse(BaseModel):
    out_of_scope: bool
    confidence_score: float
    latency_ms: float
    top_matches: list[dict[str, Any]]
    grounding_prompt: str


class FAQItemModel(BaseModel):
    id: str
    question: str
    answer: str
    category: str = "general"
    alternate_phrasings: list[str] = Field(default_factory=list)


class CreateFAQItemRequest(BaseModel):
    question: str
    answer: str
    category: str = "general"
    alternate_phrasings: list[str] = Field(default_factory=list)


def _sync_tenant_faqs_to_chunks(tenant_id: str, faqs: list[dict[str, Any]], db: Session) -> None:
    """Synchronize direct tenant FAQs into searchable KnowledgeChunk records for sub-15ms hybrid RAG."""
    # Find or create virtual document
    doc = db.scalar(
        select(KnowledgeDocument).where(
            KnowledgeDocument.tenant_id == tenant_id,
            KnowledgeDocument.filename == "Direct Business FAQs & Policies",
        )
    )
    if not doc:
        doc = KnowledgeDocument(
            tenant_id=tenant_id,
            filename="Direct Business FAQs & Policies",
            file_size_bytes=sum(len(f.get("question", "") + f.get("answer", "")) for f in faqs),
            mime_type="application/json",
            status="indexed",
            chunk_count=len(faqs),
        )
        db.add(doc)
        db.flush()

    # Clear previous chunks for this document
    db.execute(
        delete(KnowledgeChunk).where(
            KnowledgeChunk.document_id == doc.id,
            KnowledgeChunk.tenant_id == tenant_id,
        )
    )

    # Insert a structured chunk per FAQ
    for idx, item in enumerate(faqs):
        q = str(item.get("question", "")).strip()
        a = str(item.get("answer", "")).strip()
        cat = str(item.get("category", "General")).strip()
        alts = item.get("alternate_phrasings", [])
        alt_str = f" Alternate phrasings: {', '.join(alts)}." if alts else ""
        content = f"Question: {q}\nAnswer: {a}\nCategory: {cat}.{alt_str}"
        embedding_vec = _compute_dense_vector(content)

        chunk = KnowledgeChunk(
            tenant_id=tenant_id,
            document_id=doc.id,
            chunk_index=idx,
            content=content,
            token_count=max(1, len(content) // 4),
            chunk_metadata={
                "faq_id": item.get("id"),
                "category": cat,
                "question": q,
                "source": "direct_faq",
            },
            embedding=embedding_vec,
        )
        db.add(chunk)

    doc.chunk_count = len(faqs)
    doc.file_size_bytes = sum(len(f.get("question", "") + f.get("answer", "")) for f in faqs)
    db.commit()


@router.post("/upload", response_model=KnowledgeDocumentSummary)
async def upload_knowledge_document(
    file: UploadFile = File(...),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> KnowledgeDocumentSummary:
    """Upload a knowledge base file (PDF, DOCX, TXT, CSV, MD), extract text, and chunk for sub-50ms RAG."""
    filename = file.filename or "document.txt"
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    content_bytes = await file.read()
    file_size = len(content_bytes)
    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of 10MB (Received: {round(file_size / (1024 * 1024), 2)}MB)",
        )

    # 1. Extract text
    try:
        extracted_text = extract_document_text(filename, content_bytes)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse text from document: {err}",
        ) from err

    if not extracted_text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Document appears to be empty or contains no extractable text.",
        )

    # 2. Chunk text recursively
    chunks = chunk_text_recursively(extracted_text, chunk_size=800, chunk_overlap=150)

    # 3. Save Document
    doc = KnowledgeDocument(
        tenant_id=tenant.id,
        filename=filename,
        file_size_bytes=file_size,
        mime_type=file.content_type or "application/octet-stream",
        storage_path=f"tenants/{tenant.id}/kb/{filename}",
        status="indexed",
        chunk_count=len(chunks),
    )
    db.add(doc)
    db.flush()

    # 4. Save Chunks with vector embeddings
    for idx, chunk_content in enumerate(chunks):
        embedding_vec = _compute_dense_vector(chunk_content)
        chunk_obj = KnowledgeChunk(
            tenant_id=tenant.id,
            document_id=doc.id,
            chunk_index=idx,
            content=chunk_content,
            token_count=max(1, len(chunk_content) // 4),
            chunk_metadata={"filename": filename, "source": "upload"},
            embedding=embedding_vec,
        )
        db.add(chunk_obj)

    db.commit()
    db.refresh(doc)

    return KnowledgeDocumentSummary(
        id=doc.id,
        tenant_id=doc.tenant_id,
        filename=doc.filename,
        file_size_bytes=doc.file_size_bytes,
        mime_type=doc.mime_type,
        status=doc.status,
        chunk_count=doc.chunk_count,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.get("/documents", response_model=list[KnowledgeDocumentSummary])
def list_knowledge_documents(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[KnowledgeDocumentSummary]:
    """List all indexed knowledge documents for the authenticated tenant."""
    docs = db.scalars(
        select(KnowledgeDocument)
        .where(KnowledgeDocument.tenant_id == tenant.id)
        .order_by(KnowledgeDocument.created_at.desc())
    ).all()

    return [
        KnowledgeDocumentSummary(
            id=d.id,
            tenant_id=d.tenant_id,
            filename=d.filename,
            file_size_bytes=d.file_size_bytes,
            mime_type=d.mime_type,
            status=d.status,
            chunk_count=d.chunk_count,
            created_at=d.created_at,
            updated_at=d.updated_at,
        )
        for d in docs
    ]


@router.get("/documents/{doc_id}", response_model=DocumentDetailResponse)
def get_knowledge_document(
    doc_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> DocumentDetailResponse:
    """Retrieve full details of a specific knowledge document and its chunks."""
    doc = db.scalar(
        select(KnowledgeDocument).where(
            KnowledgeDocument.id == doc_id,
            KnowledgeDocument.tenant_id == tenant.id,
        )
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    chunks = db.scalars(
        select(KnowledgeChunk)
        .where(KnowledgeChunk.document_id == doc.id, KnowledgeChunk.tenant_id == tenant.id)
        .order_by(KnowledgeChunk.chunk_index.asc())
    ).all()

    return DocumentDetailResponse(
        document=KnowledgeDocumentSummary(
            id=doc.id,
            tenant_id=doc.tenant_id,
            filename=doc.filename,
            file_size_bytes=doc.file_size_bytes,
            mime_type=doc.mime_type,
            status=doc.status,
            chunk_count=doc.chunk_count,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
        ),
        chunks=[
            DocumentChunkDetail(
                id=c.id,
                chunk_index=c.chunk_index,
                content=c.content,
                token_count=c.token_count,
            )
            for c in chunks
        ],
    )


@router.delete("/documents/{doc_id}")
def delete_knowledge_document(
    doc_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Delete a document and cascade-delete all indexed chunks."""
    doc = db.scalar(
        select(KnowledgeDocument).where(
            KnowledgeDocument.id == doc_id,
            KnowledgeDocument.tenant_id == tenant.id,
        )
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    db.delete(doc)
    db.commit()
    return {"status": "deleted", "document_id": doc_id}


@router.post("/query", response_model=RAGQueryResponse)
def test_rag_query(
    req: RAGQueryRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> RAGQueryResponse:
    """Test console endpoint to execute sub-50ms hybrid RAG search against tenant knowledge documents."""
    result = search_knowledge_base(
        db=db,
        tenant_id=tenant.id,
        query=req.query,
        top_k=req.top_k,
        confidence_threshold=req.confidence_threshold,
    )

    return RAGQueryResponse(
        out_of_scope=result["out_of_scope"],
        confidence_score=result["confidence_score"],
        latency_ms=result["latency_ms"],
        top_matches=result["top_matches"],
        grounding_prompt=result["grounding_prompt"],
    )


@router.get("/faqs", response_model=list[FAQItemModel])
def list_direct_faqs(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[FAQItemModel]:
    """Retrieve all direct FAQs configured for the tenant."""
    profile = tenant.agent_profile
    if not profile or not profile.faq:
        return []

    return [
        FAQItemModel(
            id=f.get("id") or str(uuid.uuid4()),
            question=f.get("question", ""),
            answer=f.get("answer", ""),
            category=f.get("category", "General"),
            alternate_phrasings=f.get("alternate_phrasings", []),
        )
        for f in profile.faq
        if isinstance(f, dict) and f.get("question")
    ]


@router.post("/faqs", response_model=FAQItemModel)
def create_or_update_direct_faq(
    req: CreateFAQItemRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> FAQItemModel:
    """Create a new business FAQ and immediately synchronize it to the RAG vector search index."""
    profile = tenant.agent_profile
    if not profile:
        profile = AgentProfile(tenant_id=tenant.id)
        db.add(profile)
        db.flush()

    faq_list = list(profile.faq or [])
    new_id = str(uuid.uuid4())
    new_item = {
        "id": new_id,
        "question": req.question.strip(),
        "answer": req.answer.strip(),
        "category": req.category.strip() or "General",
        "alternate_phrasings": [a.strip() for a in req.alternate_phrasings if a.strip()],
    }

    faq_list.append(new_item)
    profile.faq = faq_list
    db.commit()

    # Automatically synchronize all FAQs to KnowledgeChunk vector index
    _sync_tenant_faqs_to_chunks(tenant.id, faq_list, db)

    return FAQItemModel(
        id=new_id,
        question=new_item["question"],  # type: ignore[arg-type]
        answer=new_item["answer"],  # type: ignore[arg-type]
        category=new_item["category"],  # type: ignore[arg-type]
        alternate_phrasings=new_item["alternate_phrasings"],  # type: ignore[arg-type]
    )


@router.delete("/faqs/{faq_id}")
def delete_direct_faq(
    faq_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Delete a direct FAQ and update the RAG vector index."""
    profile = tenant.agent_profile
    if not profile or not profile.faq:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")

    original_len = len(profile.faq)
    updated_faqs = [
        f
        for f in profile.faq
        if isinstance(f, dict) and f.get("id") != faq_id and f.get("question") != faq_id
    ]

    if len(updated_faqs) == original_len:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ item not found")

    profile.faq = updated_faqs
    db.commit()

    _sync_tenant_faqs_to_chunks(tenant.id, updated_faqs, db)
    return {"status": "deleted", "faq_id": faq_id}
