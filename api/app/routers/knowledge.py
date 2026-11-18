"""Multi-tenant Knowledge Base document upload, parsing, and RAG query router."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_tenant
from api.app.db.session import get_db
from api.app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from api.app.models.tenant import Tenant
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
