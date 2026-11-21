"""Schema evolution for Phase 1: Billing Engine Onboarding Fees, Standalone Top-ups, and Strict Refund Requests.

Revision ID: 20261121_0005
Revises: 20261121_0004
Create Date: 2026-11-21 18:20:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20261121_0005"
down_revision = "20261121_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    sub_cols = [c["name"] for c in inspector.get_columns("subscriptions")]

    # 1. Update subscriptions table
    with op.batch_alter_table("subscriptions") as batch_op:
        if "onboarding_fee_usd" not in sub_cols:
            batch_op.add_column(
                sa.Column(
                    "onboarding_fee_usd", sa.Float(), nullable=False, server_default=sa.text("0.0")
                )
            )
        if "onboarding_fee_paid" not in sub_cols:
            batch_op.add_column(
                sa.Column(
                    "onboarding_fee_paid", sa.Boolean(), nullable=False, server_default=sa.text("0")
                )
            )
        if "onboarding_fee_waived" not in sub_cols:
            batch_op.add_column(
                sa.Column(
                    "onboarding_fee_waived",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("0"),
                )
            )
        if "topup_minutes_balance" not in sub_cols:
            batch_op.add_column(
                sa.Column(
                    "topup_minutes_balance",
                    sa.Float(),
                    nullable=False,
                    server_default=sa.text("0.0"),
                )
            )
        if "refund_status" not in sub_cols:
            batch_op.add_column(sa.Column("refund_status", sa.String(length=32), nullable=True))
        if "refund_requested_at" not in sub_cols:
            batch_op.add_column(
                sa.Column("refund_requested_at", sa.DateTime(timezone=True), nullable=True)
            )
        if "refund_requested_usage_pct" not in sub_cols:
            batch_op.add_column(sa.Column("refund_requested_usage_pct", sa.Float(), nullable=True))
        if "refund_requested_amount_usd" not in sub_cols:
            batch_op.add_column(sa.Column("refund_requested_amount_usd", sa.Float(), nullable=True))
        if "refund_reason" not in sub_cols:
            batch_op.add_column(sa.Column("refund_reason", sa.String(length=255), nullable=True))

    # 2. Create topup_orders table if not exists
    if "topup_orders" not in tables:
        op.create_table(
            "topup_orders",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "tenant_id",
                sa.String(length=36),
                sa.ForeignKey("tenants.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("minutes", sa.Integer(), nullable=False),
            sa.Column("amount_usd", sa.Float(), nullable=False),
            sa.Column("stripe_payment_intent_id", sa.String(length=128), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )

    # 3. Create refund_requests table if not exists
    if "refund_requests" not in tables:
        op.create_table(
            "refund_requests",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "tenant_id",
                sa.String(length=36),
                sa.ForeignKey("tenants.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column(
                "subscription_id",
                sa.String(length=36),
                sa.ForeignKey("subscriptions.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("cycle_used_minutes", sa.Float(), nullable=False),
            sa.Column("cycle_base_minutes", sa.Integer(), nullable=False),
            sa.Column("usage_pct", sa.Float(), nullable=False),
            sa.Column("eligible", sa.Boolean(), nullable=False),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
            sa.Column("admin_notes", sa.Text(), nullable=True),
            sa.Column("resolved_by", sa.String(length=36), nullable=True),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("refund_requests")
    op.drop_table("topup_orders")
    with op.batch_alter_table("subscriptions") as batch_op:
        batch_op.drop_column("refund_reason")
        batch_op.drop_column("refund_requested_amount_usd")
        batch_op.drop_column("refund_requested_usage_pct")
        batch_op.drop_column("refund_requested_at")
        batch_op.drop_column("refund_status")
        batch_op.drop_column("topup_minutes_balance")
        batch_op.drop_column("onboarding_fee_waived")
        batch_op.drop_column("onboarding_fee_paid")
        batch_op.drop_column("onboarding_fee_usd")
