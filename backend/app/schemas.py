from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.enums import (
    AlertActionStatus,
    AlertDeliveryStatus,
    AlertLevel,
    AnalysisStatus,
    BodyZone,
    ContextCategory,
    InputMethod,
    QualityStatus,
    RecommendationStatus,
    RecommendationType,
)


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SampleCreate(BaseModel):
    sample_code: str = Field(min_length=1, max_length=100)
    subject_code: str = Field(min_length=1, max_length=100)
    collected_at: datetime
    mission_elapsed_minutes: int | None = Field(default=None, ge=0)
    analyte: str = "cortisol"
    result_value: Decimal | None = None
    unit: str | None = None
    assay_method: str | None = None
    analysis_status: AnalysisStatus = AnalysisStatus.REGISTERED
    quality_status: QualityStatus = QualityStatus.PENDING
    result_available_at: datetime | None = None


class SampleUpdate(BaseModel):
    result_value: Decimal | None = None
    unit: str | None = None
    assay_method: str | None = None
    analysis_status: AnalysisStatus | None = None
    quality_status: QualityStatus | None = None
    result_available_at: datetime | None = None


class SampleRead(APIModel):
    id: int
    sample_code: str
    subject_code: str
    collected_at: datetime
    mission_elapsed_minutes: int | None
    analyte: str
    result_value: Decimal | None
    unit: str | None
    assay_method: str | None
    analysis_status: str
    quality_status: str
    result_available_at: datetime | None
    created_at: datetime


class ContextNoteCreate(BaseModel):
    sample_id: int
    category: ContextCategory
    event_at: datetime | None = None
    note: str | None = Field(default=None, max_length=4000)


class ContextNoteRead(APIModel):
    id: int
    sample_id: int
    event_at: datetime | None
    category: str
    note: str | None
    entered_at: datetime


class SymptomCreate(BaseModel):
    subject_code: str = Field(min_length=1, max_length=100)
    body_zone: BodyZone
    description: str = Field(min_length=1, max_length=4000)
    severity: int | None = Field(default=None, ge=1, le=5)
    input_method: InputMethod = InputMethod.TEXT
    transcription_confirmed: bool = False
    sample_id: int | None = None


class SymptomRead(APIModel):
    id: int
    subject_code: str
    reported_at: datetime
    body_zone: str
    description: str
    severity: int | None
    input_method: str
    transcription_confirmed: bool
    sample_id: int | None


class RecommendationCreate(BaseModel):
    subject_code: str = Field(min_length=1, max_length=100)
    symptom_report_id: int | None = None
    sample_id: int | None = None
    recommendation_type: RecommendationType
    instructions: str = Field(min_length=1, max_length=4000)
    status: RecommendationStatus = RecommendationStatus.PENDING
    ruleset_version: str = Field(min_length=1, max_length=100)


class RecommendationUpdate(BaseModel):
    status: RecommendationStatus | None = None
    sample_id: int | None = None


class RecommendationRead(APIModel):
    id: int
    subject_code: str
    symptom_report_id: int | None
    sample_id: int | None
    recommendation_type: str
    instructions: str
    status: str
    ruleset_version: str
    created_at: datetime
    updated_at: datetime


class AlertCreate(BaseModel):
    subject_code: str = Field(min_length=1, max_length=100)
    sample_id: int | None = None
    symptom_report_id: int | None = None
    recommendation_id: int | None = None
    level: AlertLevel
    message: str = Field(min_length=1, max_length=4000)
    recommendation: str = Field(min_length=1, max_length=4000)
    ruleset_version: str = Field(min_length=1, max_length=100)
    action_status: AlertActionStatus = AlertActionStatus.PENDING
    delivery_status: AlertDeliveryStatus = AlertDeliveryStatus.LOCAL_ONLY


class AlertUpdate(BaseModel):
    action_status: AlertActionStatus | None = None
    delivery_status: AlertDeliveryStatus | None = None


class AlertRead(APIModel):
    id: int
    subject_code: str
    sample_id: int | None
    symptom_report_id: int | None
    recommendation_id: int | None
    level: str
    message: str
    recommendation: str
    ruleset_version: str
    action_status: str
    delivery_status: str
    created_at: datetime
    acknowledged_at: datetime | None