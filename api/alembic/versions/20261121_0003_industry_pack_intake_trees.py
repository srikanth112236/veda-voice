"""Schema evolution for Industry Pack Dynamic Intake Trees & Structured CRM Extraction (Phase C).

Revision ID: 20261121_0003
Revises: 20261121_0002
Create Date: 2026-11-21 17:36:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20261121_0003"
down_revision = "20261121_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. industry_pack_versions table additions (Phase C)
    with op.batch_alter_table("industry_pack_versions") as batch_op:
        batch_op.add_column(
            sa.Column("intake_schema", sa.JSON(), nullable=False, server_default="{}")
        )

    # 2. bookings table additions (Phase C)
    with op.batch_alter_table("bookings") as batch_op:
        batch_op.add_column(
            sa.Column("intake_details", sa.JSON(), nullable=False, server_default="{}")
        )


def downgrade() -> None:
    with op.batch_alter_table("bookings") as batch_op:
        batch_op.drop_column("intake_details")

    with op.batch_alter_table("industry_pack_versions") as batch_op:
        batch_op.drop_column("intake_schema")
