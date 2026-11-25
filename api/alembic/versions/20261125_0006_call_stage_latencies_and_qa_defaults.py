"""Add per-stage latency columns to calls table and fix QA/CSAT defaults.

Revision ID: 20261125_0006
Revises: 20261121_0005
Create Date: 2026-11-25 19:15:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "20261125_0006"
down_revision = "20261121_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "calls", sa.Column("eou_p50_ms", sa.Float(), nullable=False, server_default="0.0")
    )
    op.add_column(
        "calls", sa.Column("eou_p95_ms", sa.Float(), nullable=False, server_default="0.0")
    )
    op.add_column(
        "calls", sa.Column("ttft_p50_ms", sa.Float(), nullable=False, server_default="0.0")
    )
    op.add_column(
        "calls", sa.Column("ttft_p95_ms", sa.Float(), nullable=False, server_default="0.0")
    )
    op.add_column(
        "calls", sa.Column("ttfb_p50_ms", sa.Float(), nullable=False, server_default="0.0")
    )
    op.add_column(
        "calls", sa.Column("ttfb_p95_ms", sa.Float(), nullable=False, server_default="0.0")
    )


def downgrade() -> None:
    op.drop_column("calls", "ttfb_p95_ms")
    op.drop_column("calls", "ttfb_p50_ms")
    op.drop_column("calls", "ttft_p95_ms")
    op.drop_column("calls", "ttft_p50_ms")
    op.drop_column("calls", "eou_p95_ms")
    op.drop_column("calls", "eou_p50_ms")
