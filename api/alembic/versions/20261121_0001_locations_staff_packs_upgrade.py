"""Schema evolution for Locations, Staff Duty Status, and Industry Pack Validation (Phase 1).

Revision ID: 20261121_0001
Revises: None
Create Date: 2026-11-21 14:59:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20261121_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. subscriptions upgrades
    with op.batch_alter_table("subscriptions") as batch_op:
        batch_op.add_column(
            sa.Column("max_locations", sa.Integer(), nullable=False, server_default="1")
        )
        batch_op.add_column(
            sa.Column("allow_custom_packs", sa.Boolean(), nullable=False, server_default="0")
        )
        batch_op.add_column(
            sa.Column("hipaa_baa_signed", sa.Boolean(), nullable=False, server_default="0")
        )

    # 2. staff_members upgrades
    with op.batch_alter_table("staff_members") as batch_op:
        batch_op.add_column(
            sa.Column("duty_status", sa.String(length=32), nullable=False, server_default="on_duty")
        )

    # 3. industry_pack_versions upgrades
    with op.batch_alter_table("industry_pack_versions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "validation_status", sa.String(length=32), nullable=False, server_default="valid"
            )
        )
        batch_op.add_column(
            sa.Column("validation_errors", sa.JSON(), nullable=False, server_default="[]")
        )
        batch_op.add_column(
            sa.Column("is_system_default", sa.Boolean(), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("industry_pack_versions") as batch_op:
        batch_op.drop_column("is_system_default")
        batch_op.drop_column("validation_errors")
        batch_op.drop_column("validation_status")

    with op.batch_alter_table("staff_members") as batch_op:
        batch_op.drop_column("duty_status")

    with op.batch_alter_table("subscriptions") as batch_op:
        batch_op.drop_column("hipaa_baa_signed")
        batch_op.drop_column("allow_custom_packs")
        batch_op.drop_column("max_locations")
