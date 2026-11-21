"""Schema evolution for Location Hyper-Local Knowledge & Smart Geofencing (Phases A & B).

Revision ID: 20261121_0002
Revises: 20261121_0001
Create Date: 2026-11-21 17:10:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20261121_0002"
down_revision = "20261121_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. locations table additions (Phases A & B)
    with op.batch_alter_table("locations") as batch_op:
        # Phase B: Geofencing
        batch_op.add_column(
            sa.Column("service_neighborhoods", sa.JSON(), nullable=False, server_default="[]")
        )
        batch_op.add_column(
            sa.Column("service_cities", sa.JSON(), nullable=False, server_default="[]")
        )
        batch_op.add_column(
            sa.Column(
                "allows_out_of_area_dispatch", sa.Boolean(), nullable=False, server_default="1"
            )
        )
        batch_op.add_column(
            sa.Column(
                "extended_dispatch_surcharge",
                sa.String(length=64),
                nullable=False,
                server_default="",
            )
        )
        # Phase A: Hyper-Local Knowledge
        batch_op.add_column(
            sa.Column(
                "parking_directions", sa.String(length=512), nullable=False, server_default=""
            )
        )
        batch_op.add_column(
            sa.Column("diagnostic_fee", sa.String(length=128), nullable=False, server_default="")
        )
        batch_op.add_column(
            sa.Column(
                "regional_license_number",
                sa.String(length=128),
                nullable=False,
                server_default="",
            )
        )
        batch_op.add_column(
            sa.Column("faq_overrides", sa.JSON(), nullable=False, server_default="[]")
        )
        batch_op.add_column(
            sa.Column("custom_policies", sa.JSON(), nullable=False, server_default="{}")
        )

    # 2. unserved_territory_logs table creation
    op.create_table(
        "unserved_territory_logs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(length=36),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("caller_phone", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("requested_location_raw", sa.String(length=255), nullable=False),
        sa.Column("postal_code", sa.String(length=16), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_unserved_territory_tenant_created",
        "unserved_territory_logs",
        ["tenant_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_unserved_territory_tenant_created", table_name="unserved_territory_logs")
    op.drop_table("unserved_territory_logs")

    with op.batch_alter_table("locations") as batch_op:
        batch_op.drop_column("custom_policies")
        batch_op.drop_column("faq_overrides")
        batch_op.drop_column("regional_license_number")
        batch_op.drop_column("diagnostic_fee")
        batch_op.drop_column("parking_directions")
        batch_op.drop_column("extended_dispatch_surcharge")
        batch_op.drop_column("allows_out_of_area_dispatch")
        batch_op.drop_column("service_cities")
        batch_op.drop_column("service_neighborhoods")
