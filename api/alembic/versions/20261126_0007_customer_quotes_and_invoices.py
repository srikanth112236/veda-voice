"""Add customer_quotes and customer_invoices tables with multi-tenant RLS.

Revision ID: 20261126_0007
Revises: 20261125_0006
Create Date: 2026-11-26 20:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "20261126_0007"
down_revision = "20261125_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customer_quotes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "contact_id",
            sa.String(36),
            sa.ForeignKey("contacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "booking_id",
            sa.String(36),
            sa.ForeignKey("bookings.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("quote_number", sa.String(32), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("customer_name", sa.String(255), nullable=False),
        sa.Column("customer_phone", sa.String(32), nullable=False, server_default=""),
        sa.Column("customer_email", sa.String(255), nullable=True),
        sa.Column("line_items", sa.JSON(), nullable=False),
        sa.Column("subtotal_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tax_rate_bps", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tax_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(8), nullable=False, server_default="USD"),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("public_token", sa.String(64), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("declined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("public_token", name="uq_customer_quotes_public_token"),
    )
    op.create_index("ix_customer_quotes_tenant_id", "customer_quotes", ["tenant_id"])
    op.create_index("ix_customer_quotes_tenant_status", "customer_quotes", ["tenant_id", "status"])
    op.create_index(
        "ix_customer_quotes_tenant_contact", "customer_quotes", ["tenant_id", "contact_id"]
    )
    op.create_index("ix_customer_quotes_public_token", "customer_quotes", ["public_token"])

    op.create_table(
        "customer_invoices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "contact_id",
            sa.String(36),
            sa.ForeignKey("contacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "quote_id",
            sa.String(36),
            sa.ForeignKey("customer_quotes.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "booking_id",
            sa.String(36),
            sa.ForeignKey("bookings.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("invoice_number", sa.String(32), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("customer_name", sa.String(255), nullable=False),
        sa.Column("customer_phone", sa.String(32), nullable=False, server_default=""),
        sa.Column("customer_email", sa.String(255), nullable=True),
        sa.Column("line_items", sa.JSON(), nullable=False),
        sa.Column("subtotal_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tax_rate_bps", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tax_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("amount_paid_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(8), nullable=False, server_default="USD"),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("public_token", sa.String(64), nullable=False),
        sa.Column("payment_link_url", sa.String(512), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("public_token", name="uq_customer_invoices_public_token"),
    )
    op.create_index("ix_customer_invoices_tenant_id", "customer_invoices", ["tenant_id"])
    op.create_index(
        "ix_customer_invoices_tenant_status", "customer_invoices", ["tenant_id", "status"]
    )
    op.create_index(
        "ix_customer_invoices_tenant_contact", "customer_invoices", ["tenant_id", "contact_id"]
    )
    op.create_index("ix_customer_invoices_public_token", "customer_invoices", ["public_token"])

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for tbl in ("customer_quotes", "customer_invoices"):
            op.execute(f"ALTER TABLE {tbl} ENABLE ROW LEVEL SECURITY;")
            op.execute(
                f"""
                CREATE POLICY {tbl}_tenant_isolation ON {tbl}
                USING (tenant_id = current_setting('app.current_tenant_id', true))
                WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
                """
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for tbl in ("customer_invoices", "customer_quotes"):
            op.execute(f"DROP POLICY IF EXISTS {tbl}_tenant_isolation ON {tbl};")
            op.execute(f"ALTER TABLE {tbl} DISABLE ROW LEVEL SECURITY;")

    op.drop_table("customer_invoices")
    op.drop_table("customer_quotes")
