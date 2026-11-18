"""Transactional CRM Outbox Processor & Background Worker per SRS Addendum v1.1 Section 3.4."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from api.app.core.security import decrypt_token
from api.app.models.crm_sync import CRMConnection, CRMEntityLink, CRMSyncOutbox
from api.app.services.integrations.gohighlevel import HighLevelProvider
from api.app.services.integrations.hubspot import HubSpotProvider
from api.app.services.integrations.pipedrive import PipedriveProvider

logger = logging.getLogger("vedavoice.integrations.outbox_worker")


def enqueue_crm_outbox(
    db: Session,
    tenant_id: str,
    entity: str,
    internal_id: str,
    op: str,
    payload: dict[str, Any],
) -> list[CRMSyncOutbox]:
    """Atomically enqueue outbox jobs for all active CRM connections for a tenant."""
    connections = db.scalars(
        select(CRMConnection).where(
            CRMConnection.tenant_id == tenant_id,
            CRMConnection.status == "connected",
        )
    ).all()

    enqueued: list[CRMSyncOutbox] = []
    now = datetime.now(UTC)

    for conn in connections:
        job = CRMSyncOutbox(
            tenant_id=tenant_id,
            connection_id=conn.id,
            entity=entity,
            internal_id=internal_id,
            op=op,
            payload=payload,
            attempt=0,
            next_attempt_at=now,
            status="queued",
            created_at=now,
        )
        db.add(job)
        enqueued.append(job)

    db.flush()
    return enqueued


def get_crm_provider(provider_name: str) -> Any:
    """Resolve CrmProvider protocol implementation."""
    norm = provider_name.lower().strip()
    if norm == "hubspot":
        return HubSpotProvider()
    if norm in ("gohighlevel", "ghl", "leadconnector"):
        return HighLevelProvider()
    if norm == "pipedrive":
        return PipedriveProvider()
    raise NotImplementedError(f"CrmProvider '{provider_name}' not yet supported.")


async def process_outbox_batch(
    db: Session, batch_size: int = 50, tenant_id: str | None = None
) -> dict[str, Any]:
    """Process pending outbox jobs with exponential backoff and dead-letter quarantine (FR-INT-3)."""
    now = datetime.now(UTC)

    stmt = select(CRMSyncOutbox).where(
        CRMSyncOutbox.status.in_(["queued", "failed"]),
        CRMSyncOutbox.next_attempt_at <= now,
    )
    if tenant_id:
        stmt = stmt.where(CRMSyncOutbox.tenant_id == tenant_id)

    jobs = db.scalars(stmt.order_by(CRMSyncOutbox.created_at.asc()).limit(batch_size)).all()

    if not jobs:
        return {"processed": 0, "succeeded": 0, "failed": 0, "dead": 0}

    succeeded = 0
    failed = 0
    dead = 0

    for job in jobs:
        job.status = "in_progress"
        db.commit()

        conn = db.scalar(select(CRMConnection).where(CRMConnection.id == job.connection_id))
        if not conn or conn.status != "connected":
            job.status = "failed"
            job.last_error = f"Connection {job.connection_id} inactive or revoked."
            failed += 1
            db.commit()
            continue

        try:
            # 1. Decrypt credentials
            decrypted = decrypt_token(conn.token_ciphertext)
            token_set = (
                decrypted if isinstance(decrypted, dict) else {"access_token": str(decrypted)}
            )
            access_token = token_set.get("access_token", "")

            provider = get_crm_provider(conn.provider)

            # 2. Execute operation
            if job.op == "upsert" and job.entity == "contact":
                external_id = await provider.upsert_contact(access_token, job.payload)
                # Store cross-reference link (FR-INT-4 Idempotency)
                link = db.scalar(
                    select(CRMEntityLink).where(
                        CRMEntityLink.tenant_id == job.tenant_id,
                        CRMEntityLink.provider == conn.provider,
                        CRMEntityLink.entity == "contact",
                        CRMEntityLink.internal_id == job.internal_id,
                    )
                )
                if not link:
                    link = CRMEntityLink(
                        tenant_id=job.tenant_id,
                        provider=conn.provider,
                        entity="contact",
                        internal_id=job.internal_id,
                        external_id=external_id,
                        updated_at=datetime.now(UTC),
                    )
                    db.add(link)
                else:
                    link.external_id = external_id
                    link.updated_at = datetime.now(UTC)

            elif job.op == "log_call" and job.entity == "call":
                # Resolve associated contact external ID if available
                contact_internal_id = job.payload.get("contact_id")
                external_contact_id: str | None = None
                if contact_internal_id:
                    link = db.scalar(
                        select(CRMEntityLink).where(
                            CRMEntityLink.tenant_id == job.tenant_id,
                            CRMEntityLink.provider == conn.provider,
                            CRMEntityLink.entity == "contact",
                            CRMEntityLink.internal_id == contact_internal_id,
                        )
                    )
                    if link:
                        external_contact_id = link.external_id

                external_call_id = await provider.log_call(
                    access_token, job.payload, external_contact_id=external_contact_id
                )
                call_link = CRMEntityLink(
                    tenant_id=job.tenant_id,
                    provider=conn.provider,
                    entity="call",
                    internal_id=job.internal_id,
                    external_id=external_call_id,
                    updated_at=datetime.now(UTC),
                )
                db.add(call_link)

            elif job.op == "set_stage" and job.entity == "contact":
                link = db.scalar(
                    select(CRMEntityLink).where(
                        CRMEntityLink.tenant_id == job.tenant_id,
                        CRMEntityLink.provider == conn.provider,
                        CRMEntityLink.entity == "contact",
                        CRMEntityLink.internal_id == job.internal_id,
                    )
                )
                if link:
                    await provider.set_stage(
                        access_token, link.external_id, stage=job.payload.get("stage", "new_lead")
                    )

            # Success
            job.status = "done"
            job.last_error = None
            conn.last_sync_at = datetime.now(UTC)
            conn.last_error = None
            succeeded += 1

        except Exception as err:
            logger.error("Outbox job %s failed for %s (%s): %s", job.id, conn.provider, job.op, err)
            job.attempt += 1
            job.last_error = str(err)
            conn.last_error = str(err)

            # Exponential backoff (1s, 2s, 4s, 8s, 16s)
            if job.attempt >= 5:
                job.status = "dead"  # Move to Dead-Letter Queue (FR-INT-3)
                dead += 1
            else:
                backoff_delay = 2**job.attempt
                job.next_attempt_at = datetime.now(UTC) + timedelta(seconds=backoff_delay)
                job.status = "failed"
                failed += 1

        db.commit()

    return {
        "processed": len(jobs),
        "succeeded": succeeded,
        "failed": failed,
        "dead": dead,
    }


def get_outbox_stats(db: Session, tenant_id: str) -> dict[str, Any]:
    """Retrieve outbox queue health metrics and recent dead-letter items."""
    jobs = db.scalars(
        select(CRMSyncOutbox)
        .where(CRMSyncOutbox.tenant_id == tenant_id)
        .order_by(desc(CRMSyncOutbox.created_at))
        .limit(20)
    ).all()

    counts = {"queued": 0, "in_progress": 0, "done": 0, "failed": 0, "dead": 0}
    for j in jobs:
        if j.status in counts:
            counts[j.status] += 1

    return {
        "counts": counts,
        "recent_jobs": [
            {
                "id": j.id,
                "entity": j.entity,
                "op": j.op,
                "status": j.status,
                "attempt": j.attempt,
                "last_error": j.last_error,
                "created_at": j.created_at.isoformat(),
            }
            for j in jobs
        ],
    }
