"""Add biomarker provenance, assay results, and sensor time series."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "9c4a2f1e7b6d"
down_revision: Union[str, Sequence[str], None] = "3f34ed5d1827"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("samples", sa.Column("wake_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("samples", sa.Column("minutes_since_wake", sa.Integer(), nullable=True))
    op.add_column("samples", sa.Column("source_dataset", sa.Text(), nullable=True))
    op.add_column("samples", sa.Column("source_participant_id", sa.Text(), nullable=True))
    op.add_column("samples", sa.Column("source_time_text", sa.Text(), nullable=True))
    op.add_column("samples", sa.Column("time_basis", sa.Text(), server_default=sa.text("'absolute'"), nullable=False))
    op.create_check_constraint("ck_samples_minutes_since_wake_nonnegative", "samples", "minutes_since_wake IS NULL OR minutes_since_wake >= 0")
    op.create_check_constraint("ck_samples_time_basis", "samples", "time_basis IN ('absolute', 'synthetic_date', 'relative')")

    op.create_table(
        "assay_results",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("sample_id", sa.BigInteger(), sa.ForeignKey("samples.id", ondelete="CASCADE"), nullable=False),
        sa.Column("analyte", sa.Text(), nullable=False),
        sa.Column("measured_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("value_original", sa.Numeric(18, 8), nullable=True),
        sa.Column("unit_original", sa.Text(), nullable=False),
        sa.Column("value_normalized", sa.Numeric(18, 8), nullable=True),
        sa.Column("unit_normalized", sa.Text(), nullable=True),
        sa.Column("assay_method", sa.Text(), nullable=True),
        sa.Column("detection_limit", sa.Numeric(18, 8), nullable=True),
        sa.Column("below_detection_limit", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("source_dataset", sa.Text(), nullable=True),
        sa.Column("source_record_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("value_original IS NOT NULL OR below_detection_limit", name="ck_assay_result_value_or_bdl"),
        sa.CheckConstraint("detection_limit IS NULL OR detection_limit >= 0", name="ck_assay_result_detection_limit_nonnegative"),
        sa.UniqueConstraint("sample_id", "source_record_id", name="uq_assay_results_source_record"),
    )
    op.create_index("ix_assay_results_sample_measured", "assay_results", ["sample_id", "measured_at"])

    op.create_table(
        "sensor_streams",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("subject_code", sa.Text(), nullable=False),
        sa.Column("stream_type", sa.Text(), nullable=False),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("ended_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("unit", sa.Text(), nullable=False),
        sa.Column("sampling_rate_hz", sa.Numeric(12, 4), nullable=True),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_dataset", sa.Text(), nullable=True),
        sa.Column("source_participant_id", sa.Text(), nullable=True),
        sa.Column("time_basis", sa.Text(), server_default=sa.text("'absolute'"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("stream_type IN ('rr_interval', 'accelerometer')", name="ck_sensor_stream_type"),
        sa.CheckConstraint("sampling_rate_hz IS NULL OR sampling_rate_hz > 0", name="ck_sensor_sampling_rate_positive"),
    )
    op.create_index("ix_sensor_streams_subject_started", "sensor_streams", ["subject_code", "started_at"])

    op.create_table(
        "sensor_readings",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("stream_id", sa.BigInteger(), sa.ForeignKey("sensor_streams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence_index", sa.BigInteger(), nullable=False),
        sa.Column("observed_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("value", sa.Numeric(18, 8), nullable=True),
        sa.Column("axis_x", sa.Numeric(18, 8), nullable=True),
        sa.Column("axis_y", sa.Numeric(18, 8), nullable=True),
        sa.Column("axis_z", sa.Numeric(18, 8), nullable=True),
        sa.CheckConstraint("(value IS NOT NULL AND axis_x IS NULL AND axis_y IS NULL AND axis_z IS NULL) OR (value IS NULL AND axis_x IS NOT NULL AND axis_y IS NOT NULL AND axis_z IS NOT NULL)", name="ck_sensor_reading_scalar_or_xyz"),
        sa.UniqueConstraint("stream_id", "sequence_index", name="uq_sensor_readings_stream_sequence"),
    )
    op.create_index("ix_sensor_readings_stream_time", "sensor_readings", ["stream_id", "observed_at"])


def downgrade() -> None:
    op.drop_index("ix_sensor_readings_stream_time", table_name="sensor_readings")
    op.drop_table("sensor_readings")
    op.drop_index("ix_sensor_streams_subject_started", table_name="sensor_streams")
    op.drop_table("sensor_streams")
    op.drop_index("ix_assay_results_sample_measured", table_name="assay_results")
    op.drop_table("assay_results")
    op.drop_constraint("ck_samples_time_basis", "samples", type_="check")
    op.drop_constraint("ck_samples_minutes_since_wake_nonnegative", "samples", type_="check")
    op.drop_column("samples", "time_basis")
    op.drop_column("samples", "source_time_text")
    op.drop_column("samples", "source_participant_id")
    op.drop_column("samples", "source_dataset")
    op.drop_column("samples", "minutes_since_wake")
    op.drop_column("samples", "wake_at")
