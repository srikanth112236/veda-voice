"""Database models for Industry Packs, immutable versioning, and tenant pack applications (Milestone M4c)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.tenant import Tenant


class IndustryPack(Base):
    """Global catalog entry for an industry/niche pack template."""

    __tablename__ = "industry_packs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    category: Mapped[str] = mapped_column(
        String(64), default="commercial", nullable=False
    )  # home_services, medical_healthcare, professional_legal, general
    icon: Mapped[str] = mapped_column(String(64), default="Briefcase", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    versions: Mapped[list[IndustryPackVersion]] = relationship(
        "IndustryPackVersion", back_populates="pack", cascade="all, delete-orphan"
    )


class IndustryPackVersion(Base):
    """Immutable version configuration for an industry pack."""

    __tablename__ = "industry_pack_versions"
    __table_args__ = (
        UniqueConstraint("pack_id", "version_semver", name="uq_pack_version_semver"),
        Index("ix_pack_version_pack_id", "pack_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pack_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("industry_packs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_semver: Mapped[str] = mapped_column(String(32), default="1.0.0", nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="published", nullable=False
    )  # draft, published, deprecated
    # Validation status & system origin
    validation_status: Mapped[str] = mapped_column(
        String(32), default="valid", nullable=False
    )  # valid, incomplete, draft
    validation_errors: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    is_system_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Prompt blueprint & variable schema
    prompt_base: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_vars_schema: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    # Seed resources
    faq_seed: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    appointment_types: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    intake_questions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    intake_schema: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    pipeline_stages: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    emergency_rules: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    outbound_scripts: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    # Automated 10-scenario validation test suite
    test_scenarios: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)

    # Compliance & Legal Constraints
    allowed_outbound_categories: Mapped[list[str]] = mapped_column(
        JSON, default=lambda: ["A", "B", "C", "D", "E"], nullable=False
    )
    requires_hipaa_baa: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    pack: Mapped[IndustryPack] = relationship("IndustryPack", back_populates="versions")


class TenantPackApplication(Base):
    """Tenant-specific application of an industry pack with custom overrides."""

    __tablename__ = "tenant_pack_applications"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_tenant_active_pack"),
        Index("ix_tenant_pack_application", "tenant_id", "pack_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pack_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("industry_packs.id", ondelete="RESTRICT"), nullable=False
    )
    version_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("industry_pack_versions.id", ondelete="RESTRICT"), nullable=False
    )

    # Non-destructive tenant customization layer
    overrides: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    tenant: Mapped[Tenant] = relationship("Tenant", foreign_keys=[tenant_id])
    pack: Mapped[IndustryPack] = relationship("IndustryPack", foreign_keys=[pack_id])
    version: Mapped[IndustryPackVersion] = relationship(
        "IndustryPackVersion", foreign_keys=[version_id]
    )
