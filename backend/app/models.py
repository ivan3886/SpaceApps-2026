from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Identity,
    Numeric,
    SmallInteger,
    String,
    Text,
    TIMESTAMP,
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
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    sample_code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    subject_code: Mapped[str] = mapped_column(Text, nullable=False)
    collected_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    mission_elapsed_minutes: Mapped[int | None] = mapped_column(BigInteger)
    analyte: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'cortisol'")
    )
    result_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    unit: Mapped[str | None] = mapped_column(Text)
    assay_method: Mapped[str | None] = mapped_column(Text)
    analysis_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'registered'")
    )
    quality_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'pending'")
    )
    result_available_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True)
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )


class ContextNote(Base):
    __tablename__ = "context_notes"
    __table_args__ = (
        CheckConstraint(
            "category IN ('stress', 'physical_activity', 'sleep', 'illness', "
            "'injury', 'collection_issue', 'other')",
            name="ck_context_notes_category",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    sample_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("samples.id"),
        nullable=False,
    )
    event_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    category: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    entered_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )


class SymptomReport(Base):
    __tablename__ = "symptom_reports"
    __table_args__ = (
        CheckConstraint(
            "body_zone IN ('general', 'head', 'eyes', 'chest', 'abdomen', "
            "'back', 'arms', 'hands', 'legs', 'feet')",
            name="ck_symptom_reports_body_zone",
        ),
        CheckConstraint(
            "input_method IN ('voice', 'text')",
            name="ck_symptom_reports_input_method",
        ),
        CheckConstraint(
            "severity IS NULL OR severity BETWEEN 1 AND 5",
            name="ck_symptom_reports_severity",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    subject_code: Mapped[str] = mapped_column(Text, nullable=False)
    reported_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
    body_zone: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[int | None] = mapped_column(SmallInteger)
    input_method: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'text'")
    )
    transcription_confirmed: Mapped[bool] = mapped_column(
        nullable=False, server_default=text("false")
    )
    sample_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("samples.id", ondelete="SET NULL"),
    )


class Recommendation(Base):
    __tablename__ = "recommendations"
    __table_args__ = (
        CheckConstraint(
            "recommendation_type IN ('collect_sample', 'repeat_sample', "
            "'review_protocol', 'onboard_medical_care')",
            name="ck_recommendations_type",
        ),
        CheckConstraint(
            "status IN ('pending', 'completed', 'deferred', 'escalated', 'cancelled')",
            name="ck_recommendations_status",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    subject_code: Mapped[str] = mapped_column(Text, nullable=False)
    symptom_report_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("symptom_reports.id", ondelete="SET NULL"),
    )
    sample_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("samples.id", ondelete="SET NULL"),
    )
    recommendation_type: Mapped[str] = mapped_column(Text, nullable=False)
    instructions: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'pending'")
    )
    ruleset_version: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        CheckConstraint(
            "level IN ('informational', 'follow_up', 'priority', 'emergency')",
            name="ck_alerts_level",
        ),
        CheckConstraint(
            "action_status IN ('pending', 'completed', 'deferred', 'escalated')",
            name="ck_alerts_action_status",
        ),
        CheckConstraint(
            "delivery_status IN ('local_only', 'pending', 'sent', 'confirmed', 'failed')",
            name="ck_alerts_delivery_status",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    subject_code: Mapped[str] = mapped_column(Text, nullable=False)
    sample_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("samples.id", ondelete="SET NULL"),
    )
    symptom_report_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("symptom_reports.id", ondelete="SET NULL"),
    )
    recommendation_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("recommendations.id", ondelete="SET NULL"),
    )
    level: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    ruleset_version: Mapped[str] = mapped_column(Text, nullable=False)
    action_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'pending'")
    )
    delivery_status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'local_only'")
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True)
    )