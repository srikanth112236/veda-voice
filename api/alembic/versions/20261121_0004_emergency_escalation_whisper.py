"""Schema evolution for Phase D: Life Safety & Urgent Escalation (Whisper Briefings & SMS Dispatch).

Revision ID: 20261121_0004
Revises: 20261121_0003
Create Date: 2026-11-21 18:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20261121_0004"
down_revision = "20261121_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("calls") as batch_op:
        batch_op.add_column(sa.Column("whisper_briefing", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "emergency_alert_dispatched",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )
        batch_op.add_column(
            sa.Column("emergency_recipient_phone", sa.String(length=64), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("calls") as batch_op:
        batch_op.drop_column("emergency_recipient_phone")
        batch_op.drop_column("emergency_alert_dispatched")
        batch_op.drop_column("whisper_briefing")
