from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    Text,
    TIMESTAMP,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Sample(Base):
    __tablename__ = "samples"
    __table_args__ = (
        CheckConstraint(
            "analysis_status IN ('registered', 'processing', 'complete', 'failed')",
            name="ck_samples_analysis_status",
        ),
        CheckConstraint(
            "quality_status IN ('pending', 'valid', 'invalid')",
            name="ck_samples_quality_status",
        ),
        CheckConstraint(
            "result_value IS NULL OR unit IS NOT NULL",
            name="ck_samples_result_requires_unit",
        ),
        CheckConstraint(
            "minutes_since_wake IS NULL OR minutes_since_wake >= 0",
            name="ck_samples_minutes_since_wake_nonnegative",
        ),
        CheckConstraint(
            "time_basis IN ('absolute', 'synthetic_date', 'relative')",
            name="ck_samples_time_basis",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    sample_code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    subject_code: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    collected_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    mission_elapsed_minutes: Mapped[int | None] = mapped_column(BigInteger)
    analyte: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'cortisol'"))
    result_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    unit: Mapped[str | None] = mapped_column(Text)
    assay_method: Mapped[str | None] = mapped_column(Text)
    analysis_status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'registered'"))
    quality_status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'pending'"))
    result_available_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    wake_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    minutes_since_wake: Mapped[int | None] = mapped_column(Integer)
    source_dataset: Mapped[str | None] = mapped_column(Text)
    source_participant_id: Mapped[str | None] = mapped_column(Text)
    source_time_text: Mapped[str | None] = mapped_column(Text)
    time_basis: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'absolute'"))
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())


class ContextNote(Base):
    __tablename__ = "context_notes"
    __table_args__ = (
        CheckConstraint(
            "category IN ('stress', 'physical_activity', 'sleep', 'illness', 'injury', 'collection_issue', 'other')",
            name="ck_context_notes_category",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    sample_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("samples.id"), nullable=False, index=True)
    event_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    category: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    entered_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())


class SymptomReport(Base):
    __tablename__ = "symptom_reports"
    __table_args__ = (
        CheckConstraint(
            "body_zone IN ('general', 'head', 'eyes', 'chest', 'abdomen', 'back', 'arms', 'hands', 'legs', 'feet')",
            name="ck_symptom_reports_body_zone",
        ),
        CheckConstraint("input_method IN ('voice', 'text')", name="ck_symptom_reports_input_method"),
        CheckConstraint("severity IS NULL OR severity BETWEEN 1 AND 5", name="ck_symptom_reports_severity"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    subject_code: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    reported_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    body_zone: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[int | None] = mapped_column(SmallInteger)
    input_method: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'text'"))
    transcription_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    sample_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("samples.id", ondelete="SET NULL"))


class AssayResult(Base):
    __tablename__ = "assay_results"
    __table_args__ = (
        CheckConstraint("value_original IS NOT NULL OR below_detection_limit", name="ck_assay_result_value_or_bdl"),
        CheckConstraint("detection_limit IS NULL OR detection_limit >= 0", name="ck_assay_result_detection_limit_nonnegative"),
        UniqueConstraint("sample_id", "source_record_id", name="uq_assay_results_source_record"),
        Index("ix_assay_results_sample_measured", "sample_id", "measured_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    sample_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("samples.id", ondelete="CASCADE"), nullable=False)
    analyte: Mapped[str] = mapped_column(Text, nullable=False)
    measured_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    value_original: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    unit_original: Mapped[str] = mapped_column(Text, nullable=False)
    value_normalized: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    unit_normalized: Mapped[str | None] = mapped_column(Text)
    assay_method: Mapped[str | None] = mapped_column(Text)
    detection_limit: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    below_detection_limit: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    source_dataset: Mapped[str | None] = mapped_column(Text)
    source_record_id: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())


class SensorStream(Base):
    __tablename__ = "sensor_streams"
    __table_args__ = (
        CheckConstraint("stream_type IN ('rr_interval', 'accelerometer')", name="ck_sensor_stream_type"),
        CheckConstraint("sampling_rate_hz IS NULL OR sampling_rate_hz > 0", name="ck_sensor_sampling_rate_positive"),
        Index("ix_sensor_streams_subject_started", "subject_code", "started_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    subject_code: Mapped[str] = mapped_column(Text, nullable=False)
    stream_type: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    unit: Mapped[str] = mapped_column(Text, nullable=False)
    sampling_rate_hz: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    source: Mapped[str] = mapped_column(Text, nullable=False)
    source_dataset: Mapped[str | None] = mapped_column(Text)
    source_participant_id: Mapped[str | None] = mapped_column(Text)
    time_basis: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'absolute'"))
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())


class SensorReading(Base):
    __tablename__ = "sensor_readings"
    __table_args__ = (
        CheckConstraint(
            "(value IS NOT NULL AND axis_x IS NULL AND axis_y IS NULL AND axis_z IS NULL) OR "
            "(value IS NULL AND axis_x IS NOT NULL AND axis_y IS NOT NULL AND axis_z IS NOT NULL)",
            name="ck_sensor_reading_scalar_or_xyz",
        ),
        UniqueConstraint("stream_id", "sequence_index", name="uq_sensor_readings_stream_sequence"),
        Index("ix_sensor_readings_stream_time", "stream_id", "observed_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    stream_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("sensor_streams.id", ondelete="CASCADE"), nullable=False)
    sequence_index: Mapped[int] = mapped_column(BigInteger, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    value: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    axis_x: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    axis_y: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    axis_z: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))


class Recommendation(Base):
    __tablename__ = "recommendations"
    __table_args__ = (
        CheckConstraint(
            "recommendation_type IN ('collect_sample', 'repeat_sample', 'review_protocol', 'onboard_medical_care')",
            name="ck_recommendations_type",
        ),
        CheckConstraint(
            "status IN ('pending', 'completed', 'deferred', 'escalated', 'cancelled')",
            name="ck_recommendations_status",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    subject_code: Mapped[str] = mapped_column(Text, nullable=False)
    symptom_report_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("symptom_reports.id", ondelete="SET NULL"))
    sample_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("samples.id", ondelete="SET NULL"))
    recommendation_type: Mapped[str] = mapped_column(Text, nullable=False)
    instructions: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'pending'"))
    ruleset_version: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        CheckConstraint("level IN ('informational', 'follow_up', 'priority', 'emergency')", name="ck_alerts_level"),
        CheckConstraint("action_status IN ('pending', 'completed', 'deferred', 'escalated')", name="ck_alerts_action_status"),
        CheckConstraint("delivery_status IN ('local_only', 'pending', 'sent', 'confirmed', 'failed')", name="ck_alerts_delivery_status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    subject_code: Mapped[str] = mapped_column(Text, nullable=False)
    sample_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("samples.id", ondelete="SET NULL"))
    symptom_report_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("symptom_reports.id", ondelete="SET NULL"))
    recommendation_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("recommendations.id", ondelete="SET NULL"))
    level: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    ruleset_version: Mapped[str] = mapped_column(Text, nullable=False)
    action_status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'pending'"))
    delivery_status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'local_only'"))
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    acknowledged_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
