"""Tenant-isolated portal APIs and public self-service endpoints for Quotes, Invoices, and Booking."""

from __future__ import annotations

import logging
import re
import secrets
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_tenant
from api.app.db.session import get_db
from api.app.models.crm import Contact, ContactTimelineEvent
from api.app.models.quote_invoice import CustomerInvoice, CustomerQuote
from api.app.models.tenant import Tenant
from api.app.services.calendar.availability import compute_available_slots
from api.app.services.calendar.booking import SlotUnavailableError, confirm_booking
from api.app.services.calendar.google import MockSandboxCalendarProvider

logger = logging.getLogger("vedavoice.quotes_invoices")

router = APIRouter(tags=["quotes_invoices"])


# ===========================================================================
# Schemas
# ===========================================================================


class LineItemSchema(BaseModel):
    description: str = Field(..., min_length=1, max_length=255)
    qty: float = Field(default=1.0, gt=0)
    unit_price_cents: int = Field(default=0, ge=0)
    category: str = Field(default="service", max_length=64)


class QuoteCreateRequest(BaseModel):
    contact_id: str | None = None
    booking_id: str | None = None
    title: str = Field(..., min_length=1, max_length=255)
    customer_name: str = Field(..., min_length=1, max_length=255)
    customer_phone: str = Field(default="", max_length=32)
    customer_email: str | None = None
    line_items: list[LineItemSchema] = Field(default_factory=list)
    tax_rate_bps: int = Field(default=0, ge=0, le=5000)
    currency: str = Field(default="USD", max_length=8)
    notes: str = ""
    valid_until: datetime | None = None


class QuoteUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    customer_name: str | None = Field(default=None, min_length=1, max_length=255)
    customer_phone: str | None = None
    customer_email: str | None = None
    line_items: list[LineItemSchema] | None = None
    tax_rate_bps: int | None = Field(default=None, ge=0, le=5000)
    notes: str | None = None
    valid_until: datetime | None = None


class QuoteResponse(BaseModel):
    id: str
    tenant_id: str
    contact_id: str | None = None
    booking_id: str | None = None
    quote_number: str
    title: str
    customer_name: str
    customer_phone: str
    customer_email: str | None = None
    line_items: list[dict[str, Any]]
    subtotal_cents: int
    tax_rate_bps: int
    tax_cents: int
    total_cents: int
    currency: str
    status: str
    public_token: str
    notes: str
    valid_until: datetime | None = None
    sent_at: datetime | None = None
    approved_at: datetime | None = None
    declined_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ConvertQuoteToBookingRequest(BaseModel):
    start_at: datetime
    duration_minutes: int = Field(default=60, ge=15, le=480)
    service_type: str | None = None
    postal_code: str | None = None
    staff_id: str | None = None
    notes: str | None = None


class InvoiceCreateRequest(BaseModel):
    contact_id: str | None = None
    quote_id: str | None = None
    booking_id: str | None = None
    title: str = Field(..., min_length=1, max_length=255)
    customer_name: str = Field(..., min_length=1, max_length=255)
    customer_phone: str = Field(default="", max_length=32)
    customer_email: str | None = None
    line_items: list[LineItemSchema] = Field(default_factory=list)
    tax_rate_bps: int = Field(default=0, ge=0, le=5000)
    currency: str = Field(default="USD", max_length=8)
    payment_link_url: str | None = None
    notes: str = ""
    due_at: datetime | None = None


class InvoiceUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    customer_name: str | None = Field(default=None, min_length=1, max_length=255)
    customer_phone: str | None = None
    customer_email: str | None = None
    line_items: list[LineItemSchema] | None = None
    tax_rate_bps: int | None = Field(default=None, ge=0, le=5000)
    payment_link_url: str | None = None
    notes: str | None = None
    due_at: datetime | None = None


class InvoiceResponse(BaseModel):
    id: str
    tenant_id: str
    contact_id: str | None = None
    quote_id: str | None = None
    booking_id: str | None = None
    invoice_number: str
    title: str
    customer_name: str
    customer_phone: str
    customer_email: str | None = None
    line_items: list[dict[str, Any]]
    subtotal_cents: int
    tax_rate_bps: int
    tax_cents: int
    total_cents: int
    amount_paid_cents: int
    currency: str
    status: str
    public_token: str
    payment_link_url: str | None = None
    notes: str
    due_at: datetime | None = None
    issued_at: datetime | None = None
    paid_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PublicQuoteRespondRequest(BaseModel):
    decision: Literal["approve", "decline"]


class PublicBookingCreateRequest(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=255)
    customer_phone: str = Field(..., min_length=5, max_length=32)
    customer_email: str | None = None
    service_type: str = Field(default="general_appointment", max_length=128)
    slot_start: datetime
    duration_minutes: int = Field(default=60, ge=15, le=480)
    postal_code: str | None = None
    notes: str | None = None


# ===========================================================================
# Shared Helpers
# ===========================================================================


def _compute_totals(
    line_items: Sequence[LineItemSchema | dict[str, Any]], tax_rate_bps: int
) -> tuple[list[dict[str, Any]], int, int, int]:
    """Serialize line items and compute subtotal, tax, and total in integer cents."""
    normalized: list[dict[str, Any]] = []
    subtotal = 0
    for item in line_items:
        raw = item.model_dump() if isinstance(item, BaseModel) else dict(item)
        qty = float(raw.get("qty", 1.0))
        unit_price = int(raw.get("unit_price_cents", 0))
        line_total = round(qty * unit_price)
        subtotal += line_total
        normalized.append(
            {
                "description": str(raw.get("description", "")),
                "qty": qty,
                "unit_price_cents": unit_price,
                "line_total_cents": line_total,
                "category": str(raw.get("category", "service")),
            }
        )
    tax_cents = round(subtotal * tax_rate_bps / 10000)
    total_cents = subtotal + tax_cents
    return normalized, subtotal, tax_cents, total_cents


def _next_doc_number(db: Session, model: type[Any], tenant_id: str, prefix: str) -> str:
    """Generate sequential human-readable document number per tenant."""
    count = db.scalar(select(func.count(model.id)).where(model.tenant_id == tenant_id)) or 0
    date_tag = datetime.now(UTC).strftime("%Y%m%d")
    return f"{prefix}-{date_tag}-{count + 1:04d}"


def _get_owned_record(
    db: Session, model: type[Any], record_id: str, tenant_id: str, label: str
) -> Any:
    """Fetch a tenant-scoped record or raise 404 without leaking cross-tenant existence."""
    row = db.scalar(select(model).where(model.id == record_id, model.tenant_id == tenant_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not found")
    return row


def _validate_contact_ownership(db: Session, contact_id: str | None, tenant_id: str) -> None:
    if not contact_id:
        return
    exists = db.scalar(
        select(Contact.id).where(Contact.id == contact_id, Contact.tenant_id == tenant_id)
    )
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")


def _record_crm_event(
    db: Session,
    tenant_id: str,
    contact_id: str | None,
    event_type: str,
    summary: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    if not contact_id:
        return
    db.add(
        ContactTimelineEvent(
            tenant_id=tenant_id,
            contact_id=contact_id,
            event_type=event_type,
            title=summary,
            description=summary,
            payload=metadata or {},
            created_at=datetime.now(UTC),
        )
    )


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _resolve_tenant_by_slug(db: Session, tenant_slug: str) -> Tenant:
    """Resolve an active tenant by exact id or slugified business name."""
    clean = tenant_slug.strip().lower()
    tenants = db.scalars(select(Tenant).where(Tenant.status == "active")).all()
    for t in tenants:
        if t.id.lower() == clean or _slugify(t.name) == clean:
            return t
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking page not found")


def _quote_to_response(q: CustomerQuote) -> QuoteResponse:
    return QuoteResponse(
        id=q.id,
        tenant_id=q.tenant_id,
        contact_id=q.contact_id,
        booking_id=q.booking_id,
        quote_number=q.quote_number,
        title=q.title,
        customer_name=q.customer_name,
        customer_phone=q.customer_phone,
        customer_email=q.customer_email,
        line_items=list(q.line_items or []),
        subtotal_cents=q.subtotal_cents,
        tax_rate_bps=q.tax_rate_bps,
        tax_cents=q.tax_cents,
        total_cents=q.total_cents,
        currency=q.currency,
        status=q.status,
        public_token=q.public_token,
        notes=q.notes,
        valid_until=q.valid_until,
        sent_at=q.sent_at,
        approved_at=q.approved_at,
        declined_at=q.declined_at,
        created_at=q.created_at,
        updated_at=q.updated_at,
    )


def _invoice_to_response(inv: CustomerInvoice) -> InvoiceResponse:
    return InvoiceResponse(
        id=inv.id,
        tenant_id=inv.tenant_id,
        contact_id=inv.contact_id,
        quote_id=inv.quote_id,
        booking_id=inv.booking_id,
        invoice_number=inv.invoice_number,
        title=inv.title,
        customer_name=inv.customer_name,
        customer_phone=inv.customer_phone,
        customer_email=inv.customer_email,
        line_items=list(inv.line_items or []),
        subtotal_cents=inv.subtotal_cents,
        tax_rate_bps=inv.tax_rate_bps,
        tax_cents=inv.tax_cents,
        total_cents=inv.total_cents,
        amount_paid_cents=inv.amount_paid_cents,
        currency=inv.currency,
        status=inv.status,
        public_token=inv.public_token,
        payment_link_url=inv.payment_link_url,
        notes=inv.notes,
        due_at=inv.due_at,
        issued_at=inv.issued_at,
        paid_at=inv.paid_at,
        created_at=inv.created_at,
        updated_at=inv.updated_at,
    )


# ===========================================================================
# Portal Quote Endpoints (Tenant-Isolated)
# ===========================================================================


@router.get("/portal/quotes", response_model=list[QuoteResponse])
def list_portal_quotes(
    status_filter: str | None = Query(default=None, alias="status"),
    contact_id: str | None = Query(default=None),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[QuoteResponse]:
    """List quotes belonging strictly to the authenticated tenant."""
    stmt = select(CustomerQuote).where(CustomerQuote.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(CustomerQuote.status == status_filter)
    if contact_id:
        stmt = stmt.where(CustomerQuote.contact_id == contact_id)
    rows = db.scalars(stmt.order_by(CustomerQuote.created_at.desc())).all()
    return [_quote_to_response(q) for q in rows]


@router.post("/portal/quotes", response_model=QuoteResponse, status_code=status.HTTP_201_CREATED)
def create_portal_quote(
    payload: QuoteCreateRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> QuoteResponse:
    """Create a new customer quote/estimate scoped to the authenticated tenant."""
    _validate_contact_ownership(db, payload.contact_id, tenant.id)
    items, subtotal, tax_cents, total_cents = _compute_totals(
        payload.line_items, payload.tax_rate_bps
    )
    quote = CustomerQuote(
        tenant_id=tenant.id,
        contact_id=payload.contact_id,
        booking_id=payload.booking_id,
        quote_number=_next_doc_number(db, CustomerQuote, tenant.id, "QT"),
        title=payload.title.strip(),
        customer_name=payload.customer_name.strip(),
        customer_phone=payload.customer_phone.strip(),
        customer_email=payload.customer_email,
        line_items=items,
        subtotal_cents=subtotal,
        tax_rate_bps=payload.tax_rate_bps,
        tax_cents=tax_cents,
        total_cents=total_cents,
        currency=payload.currency.upper(),
        status="draft",
        notes=payload.notes,
        valid_until=payload.valid_until or (datetime.now(UTC) + timedelta(days=14)),
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)
    return _quote_to_response(quote)


@router.get("/portal/quotes/{quote_id}", response_model=QuoteResponse)
def get_portal_quote(
    quote_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> QuoteResponse:
    """Get a single quote owned by the authenticated tenant."""
    quote = _get_owned_record(db, CustomerQuote, quote_id, tenant.id, "Quote")
    return _quote_to_response(quote)


@router.patch("/portal/quotes/{quote_id}", response_model=QuoteResponse)
def update_portal_quote(
    quote_id: str,
    payload: QuoteUpdateRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> QuoteResponse:
    """Update quote fields and recompute subtotal/tax/total cleanly."""
    quote = _get_owned_record(db, CustomerQuote, quote_id, tenant.id, "Quote")
    if payload.title is not None:
        quote.title = payload.title.strip()
    if payload.customer_name is not None:
        quote.customer_name = payload.customer_name.strip()
    if payload.customer_phone is not None:
        quote.customer_phone = payload.customer_phone.strip()
    if payload.customer_email is not None:
        quote.customer_email = payload.customer_email
    if payload.notes is not None:
        quote.notes = payload.notes
    if payload.valid_until is not None:
        quote.valid_until = payload.valid_until

    items_source = payload.line_items if payload.line_items is not None else quote.line_items
    tax_bps = payload.tax_rate_bps if payload.tax_rate_bps is not None else quote.tax_rate_bps
    items, subtotal, tax_cents, total_cents = _compute_totals(items_source, tax_bps)
    quote.line_items = items
    quote.tax_rate_bps = tax_bps
    quote.subtotal_cents = subtotal
    quote.tax_cents = tax_cents
    quote.total_cents = total_cents
    quote.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(quote)
    return _quote_to_response(quote)


@router.post("/portal/quotes/{quote_id}/send", response_model=QuoteResponse)
def send_portal_quote(
    quote_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> QuoteResponse:
    """Mark a quote as sent and log a CRM timeline event."""
    quote = _get_owned_record(db, CustomerQuote, quote_id, tenant.id, "Quote")
    now = datetime.now(UTC)
    quote.status = "sent"
    quote.sent_at = quote.sent_at or now
    quote.updated_at = now
    _record_crm_event(
        db,
        tenant.id,
        quote.contact_id,
        "quote_sent",
        f"Sent quote {quote.quote_number} (${quote.total_cents / 100:.2f})",
        {"quote_id": quote.id, "quote_number": quote.quote_number},
    )
    db.commit()
    db.refresh(quote)
    return _quote_to_response(quote)


@router.post("/portal/quotes/{quote_id}/convert-to-invoice", response_model=InvoiceResponse)
def convert_quote_to_invoice(
    quote_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> InvoiceResponse:
    """Convert an existing quote into a linked customer invoice."""
    quote = _get_owned_record(db, CustomerQuote, quote_id, tenant.id, "Quote")
    now = datetime.now(UTC)
    invoice = CustomerInvoice(
        tenant_id=tenant.id,
        contact_id=quote.contact_id,
        quote_id=quote.id,
        booking_id=quote.booking_id,
        invoice_number=_next_doc_number(db, CustomerInvoice, tenant.id, "INV"),
        title=quote.title,
        customer_name=quote.customer_name,
        customer_phone=quote.customer_phone,
        customer_email=quote.customer_email,
        line_items=list(quote.line_items or []),
        subtotal_cents=quote.subtotal_cents,
        tax_rate_bps=quote.tax_rate_bps,
        tax_cents=quote.tax_cents,
        total_cents=quote.total_cents,
        amount_paid_cents=0,
        currency=quote.currency,
        status="issued",
        issued_at=now,
        due_at=now + timedelta(days=14),
        notes=quote.notes,
    )
    quote.status = "converted"
    quote.updated_at = now
    db.add(invoice)
    _record_crm_event(
        db,
        tenant.id,
        quote.contact_id,
        "invoice_issued",
        f"Converted {quote.quote_number} to invoice {invoice.invoice_number}",
        {"quote_id": quote.id, "invoice_number": invoice.invoice_number},
    )
    db.commit()
    db.refresh(invoice)
    return _invoice_to_response(invoice)


@router.post("/portal/quotes/{quote_id}/convert-to-booking")
def convert_quote_to_booking(
    quote_id: str,
    payload: ConvertQuoteToBookingRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Convert a quote into a confirmed calendar booking and link it."""
    quote = _get_owned_record(db, CustomerQuote, quote_id, tenant.id, "Quote")
    try:
        booking = confirm_booking(
            tenant_id=tenant.id,
            slot_start=payload.start_at,
            duration_minutes=payload.duration_minutes,
            customer_name=quote.customer_name,
            customer_phone=quote.customer_phone or "N/A",
            db=db,
            customer_email=quote.customer_email,
            service_type=payload.service_type or quote.title,
            notes=payload.notes or f"Converted from quote {quote.quote_number}",
            postal_code=payload.postal_code,
            staff_id=payload.staff_id,
        )
    except SlotUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    quote.booking_id = booking.id
    if quote.status in ("draft", "sent"):
        quote.status = "approved"
        quote.approved_at = quote.approved_at or datetime.now(UTC)
    quote.updated_at = datetime.now(UTC)
    _record_crm_event(
        db,
        tenant.id,
        quote.contact_id,
        "booking_created",
        f"Booked appointment from quote {quote.quote_number}",
        {"quote_id": quote.id, "booking_id": booking.id},
    )
    db.commit()
    return {
        "booking_id": booking.id,
        "quote_id": quote.id,
        "status": booking.status,
        "start_at": booking.start_at.isoformat(),
    }


# ===========================================================================
# Portal Invoice Endpoints (Tenant-Isolated)
# ===========================================================================


@router.get("/portal/invoices", response_model=list[InvoiceResponse])
def list_portal_invoices(
    status_filter: str | None = Query(default=None, alias="status"),
    contact_id: str | None = Query(default=None),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[InvoiceResponse]:
    """List invoices belonging strictly to the authenticated tenant."""
    stmt = select(CustomerInvoice).where(CustomerInvoice.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(CustomerInvoice.status == status_filter)
    if contact_id:
        stmt = stmt.where(CustomerInvoice.contact_id == contact_id)
    rows = db.scalars(stmt.order_by(CustomerInvoice.created_at.desc())).all()
    return [_invoice_to_response(inv) for inv in rows]


@router.post(
    "/portal/invoices", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED
)
def create_portal_invoice(
    payload: InvoiceCreateRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> InvoiceResponse:
    """Create a new customer invoice scoped to the authenticated tenant."""
    _validate_contact_ownership(db, payload.contact_id, tenant.id)
    items, subtotal, tax_cents, total_cents = _compute_totals(
        payload.line_items, payload.tax_rate_bps
    )
    invoice = CustomerInvoice(
        tenant_id=tenant.id,
        contact_id=payload.contact_id,
        quote_id=payload.quote_id,
        booking_id=payload.booking_id,
        invoice_number=_next_doc_number(db, CustomerInvoice, tenant.id, "INV"),
        title=payload.title.strip(),
        customer_name=payload.customer_name.strip(),
        customer_phone=payload.customer_phone.strip(),
        customer_email=payload.customer_email,
        line_items=items,
        subtotal_cents=subtotal,
        tax_rate_bps=payload.tax_rate_bps,
        tax_cents=tax_cents,
        total_cents=total_cents,
        amount_paid_cents=0,
        currency=payload.currency.upper(),
        status="draft",
        payment_link_url=payload.payment_link_url,
        notes=payload.notes,
        due_at=payload.due_at or (datetime.now(UTC) + timedelta(days=14)),
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return _invoice_to_response(invoice)


@router.get("/portal/invoices/{invoice_id}", response_model=InvoiceResponse)
def get_portal_invoice(
    invoice_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> InvoiceResponse:
    """Get a single invoice owned by the authenticated tenant."""
    inv = _get_owned_record(db, CustomerInvoice, invoice_id, tenant.id, "Invoice")
    return _invoice_to_response(inv)


@router.patch("/portal/invoices/{invoice_id}", response_model=InvoiceResponse)
def update_portal_invoice(
    invoice_id: str,
    payload: InvoiceUpdateRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> InvoiceResponse:
    """Update invoice fields and recompute subtotal/tax/total cleanly."""
    inv = _get_owned_record(db, CustomerInvoice, invoice_id, tenant.id, "Invoice")
    if payload.title is not None:
        inv.title = payload.title.strip()
    if payload.customer_name is not None:
        inv.customer_name = payload.customer_name.strip()
    if payload.customer_phone is not None:
        inv.customer_phone = payload.customer_phone.strip()
    if payload.customer_email is not None:
        inv.customer_email = payload.customer_email
    if payload.payment_link_url is not None:
        inv.payment_link_url = payload.payment_link_url
    if payload.notes is not None:
        inv.notes = payload.notes
    if payload.due_at is not None:
        inv.due_at = payload.due_at

    items_source = payload.line_items if payload.line_items is not None else inv.line_items
    tax_bps = payload.tax_rate_bps if payload.tax_rate_bps is not None else inv.tax_rate_bps
    items, subtotal, tax_cents, total_cents = _compute_totals(items_source, tax_bps)
    inv.line_items = items
    inv.tax_rate_bps = tax_bps
    inv.subtotal_cents = subtotal
    inv.tax_cents = tax_cents
    inv.total_cents = total_cents
    inv.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(inv)
    return _invoice_to_response(inv)


@router.post("/portal/invoices/{invoice_id}/issue", response_model=InvoiceResponse)
def issue_portal_invoice(
    invoice_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> InvoiceResponse:
    """Issue a draft invoice to the customer."""
    inv = _get_owned_record(db, CustomerInvoice, invoice_id, tenant.id, "Invoice")
    now = datetime.now(UTC)
    inv.status = "issued"
    inv.issued_at = inv.issued_at or now
    inv.updated_at = now
    _record_crm_event(
        db,
        tenant.id,
        inv.contact_id,
        "invoice_issued",
        f"Issued invoice {inv.invoice_number} (${inv.total_cents / 100:.2f})",
        {"invoice_id": inv.id, "invoice_number": inv.invoice_number},
    )
    db.commit()
    db.refresh(inv)
    return _invoice_to_response(inv)


@router.post("/portal/invoices/{invoice_id}/mark-paid", response_model=InvoiceResponse)
def mark_portal_invoice_paid(
    invoice_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> InvoiceResponse:
    """Mark an invoice as paid in full and record CRM timeline event."""
    inv = _get_owned_record(db, CustomerInvoice, invoice_id, tenant.id, "Invoice")
    now = datetime.now(UTC)
    inv.status = "paid"
    inv.amount_paid_cents = inv.total_cents
    inv.paid_at = now
    inv.updated_at = now
    _record_crm_event(
        db,
        tenant.id,
        inv.contact_id,
        "invoice_paid",
        f"Payment received for {inv.invoice_number} (${inv.total_cents / 100:.2f})",
        {"invoice_id": inv.id, "invoice_number": inv.invoice_number},
    )
    db.commit()
    db.refresh(inv)
    return _invoice_to_response(inv)


@router.post("/portal/invoices/{invoice_id}/void", response_model=InvoiceResponse)
def void_portal_invoice(
    invoice_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> InvoiceResponse:
    """Void an unpaid invoice."""
    inv = _get_owned_record(db, CustomerInvoice, invoice_id, tenant.id, "Invoice")
    if inv.status == "paid":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Paid invoices cannot be voided"
        )
    inv.status = "void"
    inv.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(inv)
    return _invoice_to_response(inv)


# ===========================================================================
# Public Self-Service Endpoints (Token / Slug Scoped)
# ===========================================================================


@router.get("/public/quote/{token}")
def get_public_quote(token: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Retrieve a quote for customer review via its unguessable public token."""
    quote = db.scalar(select(CustomerQuote).where(CustomerQuote.public_token == token))
    if not quote:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    tenant = db.scalar(select(Tenant).where(Tenant.id == quote.tenant_id))
    return {
        "business_name": tenant.name if tenant else "Service Provider",
        "quote": _quote_to_response(quote).model_dump(),
    }


@router.post("/public/quote/{token}/respond", response_model=QuoteResponse)
def respond_public_quote(
    token: str,
    payload: PublicQuoteRespondRequest,
    db: Session = Depends(get_db),
) -> QuoteResponse:
    """Allow an end customer to approve or decline a quote via its public link."""
    quote = db.scalar(select(CustomerQuote).where(CustomerQuote.public_token == token))
    if not quote:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    if quote.status == "converted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Quote has already been converted"
        )

    now = datetime.now(UTC)
    if payload.decision == "approve":
        quote.status = "approved"
        quote.approved_at = now
        event_type = "quote_approved"
        summary = f"Customer approved quote {quote.quote_number}"
    else:
        quote.status = "declined"
        quote.declined_at = now
        event_type = "quote_declined"
        summary = f"Customer declined quote {quote.quote_number}"

    quote.updated_at = now
    _record_crm_event(
        db,
        quote.tenant_id,
        quote.contact_id,
        event_type,
        summary,
        {"quote_id": quote.id, "quote_number": quote.quote_number},
    )
    db.commit()
    db.refresh(quote)
    return _quote_to_response(quote)


@router.get("/public/invoice/{token}")
def get_public_invoice(token: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Retrieve a customer invoice via its unguessable public token."""
    inv = db.scalar(select(CustomerInvoice).where(CustomerInvoice.public_token == token))
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    tenant = db.scalar(select(Tenant).where(Tenant.id == inv.tenant_id))
    return {
        "business_name": tenant.name if tenant else "Service Provider",
        "invoice": _invoice_to_response(inv).model_dump(),
    }


@router.get("/public/booking/{tenant_slug}/availability")
def get_public_booking_availability(
    tenant_slug: str,
    target_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return available appointment slots for a tenant's public booking link."""
    tenant = _resolve_tenant_by_slug(db, tenant_slug)
    parsed_date = (
        datetime.strptime(target_date, "%Y-%m-%d").date()
        if target_date
        else datetime.now(UTC).date()
    )
    try:
        slots = compute_available_slots(
            tenant=tenant,
            target_date=parsed_date,
            db=db,
        )
    except Exception as exc:
        logger.warning(
            "Public booking availability falling back to local DB slots for tenant=%s: %s",
            tenant.id,
            exc,
        )
        slots = compute_available_slots(
            tenant=tenant,
            target_date=parsed_date,
            db=db,
            custom_provider=MockSandboxCalendarProvider(),
        )
    return {
        "business_name": tenant.name,
        "timezone": tenant.timezone,
        "availability": slots.model_dump(),
    }


@router.post("/public/booking/{tenant_slug}", status_code=status.HTTP_201_CREATED)
def create_public_booking(
    tenant_slug: str,
    payload: PublicBookingCreateRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Book an appointment via a tenant's public self-service booking link."""
    tenant = _resolve_tenant_by_slug(db, tenant_slug)
    try:
        booking = confirm_booking(
            tenant_id=tenant.id,
            slot_start=payload.slot_start,
            duration_minutes=payload.duration_minutes,
            customer_name=payload.customer_name.strip(),
            customer_phone=payload.customer_phone.strip(),
            db=db,
            customer_email=payload.customer_email,
            service_type=payload.service_type,
            notes=payload.notes,
            postal_code=payload.postal_code,
        )
    except SlotUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    if not booking.reschedule_token:
        booking.reschedule_token = secrets.token_urlsafe(24)
        db.commit()
        db.refresh(booking)

    return {
        "booking_id": booking.id,
        "business_name": tenant.name,
        "status": booking.status,
        "start_at": booking.start_at.isoformat(),
        "end_at": booking.end_at.isoformat(),
        "reschedule_token": booking.reschedule_token,
    }
