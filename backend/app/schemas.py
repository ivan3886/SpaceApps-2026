from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

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
    wake_at: datetime | None = None
    minutes_since_wake: int | None = Field(default=None, ge=0)
    source_dataset: str | None = None
    source_participant_id: str | None = None
    source_time_text: str | None = None
    time_basis: str = "absolute"


class SampleUpdate(BaseModel):
    result_value: Decimal | None = None
    unit: str | None = None
    assay_method: str | None = None
    analysis_status: AnalysisStatus | None = None
    quality_status: QualityStatus | None = None
    result_available_at: datetime | None = None
    wake_at: datetime | None = None
    minutes_since_wake: int | None = Field(default=None, ge=0)


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
    wake_at: datetime | None
    minutes_since_wake: int | None
    source_dataset: str | None
    source_participant_id: str | None
    source_time_text: str | None
    time_basis: str
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


class AssayResultCreate(BaseModel):
    analyte: str = Field(min_length=1, max_length=100)
    measured_at: datetime | None = None
    value_original: Decimal | None = None
    unit_original: str = Field(min_length=1, max_length=100)
    value_normalized: Decimal | None = None
    unit_normalized: str | None = Field(default=None, max_length=100)
    assay_method: str | None = Field(default=None, max_length=200)
    detection_limit: Decimal | None = Field(default=None, ge=0)
    below_detection_limit: bool = False
    source_dataset: str | None = Field(default=None, max_length=200)
    source_record_id: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def validate_measurement(self):
        if self.value_original is None and not self.below_detection_limit:
            raise ValueError("Indica el valor original o marca que está bajo el límite de detección")
        if self.value_normalized is not None and not self.unit_normalized:
            raise ValueError("La unidad normalizada es obligatoria si se informa un valor normalizado")
        return self


class AssayResultRead(APIModel):
    id: int
    sample_id: int
    analyte: str
    measured_at: datetime | None
    value_original: Decimal | None
    unit_original: str
    value_normalized: Decimal | None
    unit_normalized: str | None
    assay_method: str | None
    detection_limit: Decimal | None
    below_detection_limit: bool
    source_dataset: str | None
    source_record_id: str | None
    created_at: datetime


class SensorStreamCreate(BaseModel):
    subject_code: str = Field(min_length=1, max_length=100)
    stream_type: str = Field(pattern="^(rr_interval|accelerometer)$")
    started_at: datetime
    ended_at: datetime | None = None
    unit: str = Field(min_length=1, max_length=50)
    sampling_rate_hz: Decimal | None = Field(default=None, gt=0)
    source: str = Field(min_length=1, max_length=200)
    source_dataset: str | None = Field(default=None, max_length=200)
    source_participant_id: str | None = Field(default=None, max_length=200)
    time_basis: str = Field(default="absolute", pattern="^(absolute|synthetic_date|relative)$")


class SensorStreamRead(APIModel):
    id: int
    subject_code: str
    stream_type: str
    started_at: datetime
    ended_at: datetime | None
    unit: str
    sampling_rate_hz: Decimal | None
    source: str
    source_dataset: str | None
    source_participant_id: str | None
    time_basis: str
    created_at: datetime


class SensorReadingCreate(BaseModel):
    sequence_index: int = Field(ge=0)
    observed_at: datetime
    value: Decimal | None = None
    axis_x: Decimal | None = None
    axis_y: Decimal | None = None
    axis_z: Decimal | None = None

    @model_validator(mode="after")
    def validate_value_shape(self):
        scalar = self.value is not None and self.axis_x is None and self.axis_y is None and self.axis_z is None
        xyz = self.value is None and self.axis_x is not None and self.axis_y is not None and self.axis_z is not None
        if not (scalar or xyz):
            raise ValueError("Cada lectura debe incluir un valor escalar (RR) o los tres ejes (acelerometría)")
        return self


class SensorReadingBatch(BaseModel):
    readings: list[SensorReadingCreate] = Field(min_length=1, max_length=5000)


class SensorReadingRead(APIModel):
    id: int
    stream_id: int
    sequence_index: int
    observed_at: datetime
    value: Decimal | None
    axis_x: Decimal | None
    axis_y: Decimal | None
    axis_z: Decimal | None


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
