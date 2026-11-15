from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app import crud
from app.db import get_db
from app.enums import AlertLevel, AlertDeliveryStatus
from app.models import (
    Alert, AssayResult, ContextNote, Recommendation, Sample, SensorReading,
    SensorStream, SymptomReport,
)
from app.schemas import (
    AlertCreate, AlertRead, AlertUpdate, AssayResultCreate, AssayResultRead,
    ContextNoteCreate, ContextNoteRead, RecommendationCreate, RecommendationRead,
    RecommendationUpdate, SampleCreate, SampleRead, SampleUpdate,
    SensorReadingBatch, SensorReadingRead, SensorStreamCreate, SensorStreamRead,
    SymptomCreate, SymptomRead,
)

app = FastAPI(
    title="Orbit Health API",
    version="0.2.0",
    description="API de prototipo para muestras de cortisol, resultados de laboratorio y señales fisiológicas.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500", "http://127.0.0.1:5500"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_or_404(db: Session, model, record_id: int):
    record = crud.get_by_id(db, model, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return record


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/samples", response_model=SampleRead, status_code=status.HTTP_201_CREATED)
def create_sample(payload: SampleCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if data["time_basis"] not in {"absolute", "synthetic_date", "relative"}:
        raise HTTPException(status_code=422, detail="time_basis debe ser absolute, synthetic_date o relative")
    sample = Sample(**data)
    try:
        return crud.create(db, sample)
    except Exception as exc:
        raise HTTPException(status_code=409, detail="No se pudo crear la muestra; verifica que el código no esté duplicado y que la base esté migrada") from exc


@app.get("/samples", response_model=list[SampleRead])
def list_samples(
    subject_code: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return crud.list_records(db, Sample, subject_code=subject_code, limit=limit, offset=offset)


@app.get("/samples/{sample_id}", response_model=SampleRead)
def get_sample(sample_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, Sample, sample_id)


@app.patch("/samples/{sample_id}", response_model=SampleRead)
def update_sample(sample_id: int, payload: SampleUpdate, db: Session = Depends(get_db)):
    sample = get_or_404(db, Sample, sample_id)
    return crud.update_fields(db, sample, payload.model_dump(exclude_unset=True))


@app.post("/samples/{sample_id}/assay-results", response_model=AssayResultRead, status_code=status.HTTP_201_CREATED)
def create_assay_result(sample_id: int, payload: AssayResultCreate, db: Session = Depends(get_db)):
    get_or_404(db, Sample, sample_id)
    result = AssayResult(sample_id=sample_id, **payload.model_dump())
    try:
        return crud.create(db, result)
    except Exception as exc:
        raise HTTPException(status_code=409, detail="No se pudo guardar el resultado; el registro de origen puede estar duplicado") from exc


@app.get("/samples/{sample_id}/assay-results", response_model=list[AssayResultRead])
def list_assay_results(sample_id: int, db: Session = Depends(get_db)):
    get_or_404(db, Sample, sample_id)
    statement = select(AssayResult).where(AssayResult.sample_id == sample_id).order_by(AssayResult.measured_at.desc().nullslast())
    return list(db.scalars(statement).all())


@app.post("/context-notes", response_model=ContextNoteRead, status_code=status.HTTP_201_CREATED)
def create_context_note(payload: ContextNoteCreate, db: Session = Depends(get_db)):
    get_or_404(db, Sample, payload.sample_id)
    return crud.create(db, ContextNote(**payload.model_dump()))


@app.get("/samples/{sample_id}/context-notes", response_model=list[ContextNoteRead])
def list_context_notes(sample_id: int, db: Session = Depends(get_db)):
    get_or_404(db, Sample, sample_id)
    statement = select(ContextNote).where(ContextNote.sample_id == sample_id).order_by(ContextNote.entered_at.desc())
    return list(db.scalars(statement).all())


@app.post("/sensor-streams", response_model=SensorStreamRead, status_code=status.HTTP_201_CREATED)
def create_sensor_stream(payload: SensorStreamCreate, db: Session = Depends(get_db)):
    stream = SensorStream(**payload.model_dump())
    return crud.create(db, stream)


@app.get("/sensor-streams", response_model=list[SensorStreamRead])
def list_sensor_streams(
    subject_code: str | None = None,
    stream_type: str | None = Query(default=None, pattern="^(rr_interval|accelerometer)$"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    statement = select(SensorStream)
    if subject_code:
        statement = statement.where(SensorStream.subject_code == subject_code)
    if stream_type:
        statement = statement.where(SensorStream.stream_type == stream_type)
    statement = statement.order_by(SensorStream.started_at.desc()).offset(offset).limit(limit)
    return list(db.scalars(statement).all())


@app.post("/sensor-streams/{stream_id}/readings/batch", status_code=status.HTTP_201_CREATED)
def create_sensor_readings(stream_id: int, payload: SensorReadingBatch, db: Session = Depends(get_db)):
    stream = get_or_404(db, SensorStream, stream_id)
    sequences = [reading.sequence_index for reading in payload.readings]
    if len(sequences) != len(set(sequences)):
        raise HTTPException(status_code=422, detail="sequence_index debe ser único dentro del lote")
    for reading in payload.readings:
        if stream.stream_type == "rr_interval" and reading.value is None:
            raise HTTPException(status_code=422, detail="Una señal rr_interval requiere valor escalar y unit explícita en el stream")
        if stream.stream_type == "accelerometer" and reading.value is not None:
            raise HTTPException(status_code=422, detail="Una señal accelerometer requiere axis_x, axis_y y axis_z")

    rows = [dict(stream_id=stream_id, **reading.model_dump()) for reading in payload.readings]
    statement = pg_insert(SensorReading).values(rows).on_conflict_do_nothing(
        index_elements=["stream_id", "sequence_index"]
    )
    inserted = db.execute(statement).rowcount or 0
    db.commit()
    return {"submitted": len(rows), "inserted": inserted, "duplicates_ignored": len(rows) - inserted}


@app.get("/sensor-streams/{stream_id}/readings", response_model=list[SensorReadingRead])
def list_sensor_readings(
    stream_id: int,
    limit: int = Query(default=1000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    get_or_404(db, SensorStream, stream_id)
    statement = select(SensorReading).where(SensorReading.stream_id == stream_id).order_by(SensorReading.sequence_index).offset(offset).limit(limit)
    return list(db.scalars(statement).all())


@app.post("/symptoms", response_model=SymptomRead, status_code=status.HTTP_201_CREATED)
def create_symptom(payload: SymptomCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if data["sample_id"] is not None:
        get_or_404(db, Sample, data["sample_id"])
    return crud.create(db, SymptomReport(**data))


@app.get("/symptoms", response_model=list[SymptomRead])
def list_symptoms(
    subject_code: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return crud.list_records(db, SymptomReport, subject_code=subject_code, limit=limit, offset=offset)


@app.post("/recommendations", response_model=RecommendationRead, status_code=status.HTTP_201_CREATED)
def create_recommendation(payload: RecommendationCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if data["sample_id"] is not None:
        get_or_404(db, Sample, data["sample_id"])
    if data["symptom_report_id"] is not None:
        get_or_404(db, SymptomReport, data["symptom_report_id"])
    return crud.create(db, Recommendation(**data))


@app.get("/recommendations", response_model=list[RecommendationRead])
def list_recommendations(
    subject_code: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return crud.list_records(db, Recommendation, subject_code=subject_code, limit=limit, offset=offset)


@app.patch("/recommendations/{recommendation_id}", response_model=RecommendationRead)
def update_recommendation(recommendation_id: int, payload: RecommendationUpdate, db: Session = Depends(get_db)):
    record = get_or_404(db, Recommendation, recommendation_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("sample_id") is not None:
        get_or_404(db, Sample, changes["sample_id"])
    return crud.update_fields(db, record, changes)


@app.post("/alerts", response_model=AlertRead, status_code=status.HTTP_201_CREATED)
def create_alert(payload: AlertCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    for field, model in (("sample_id", Sample), ("symptom_report_id", SymptomReport), ("recommendation_id", Recommendation)):
        if data[field] is not None:
            get_or_404(db, model, data[field])
    alert = crud.create(db, Alert(**data))
    if alert.level == AlertLevel.EMERGENCY:
        alert = crud.update_fields(db, alert, {"delivery_status": AlertDeliveryStatus.PENDING})
    return alert


@app.get("/alerts", response_model=list[AlertRead])
def list_alerts(
    subject_code: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return crud.list_records(db, Alert, subject_code=subject_code, limit=limit, offset=offset)


@app.patch("/alerts/{alert_id}", response_model=AlertRead)
def update_alert(alert_id: int, payload: AlertUpdate, db: Session = Depends(get_db)):
    alert = get_or_404(db, Alert, alert_id)
    return crud.update_fields(db, alert, payload.model_dump(exclude_unset=True))


@app.post("/alerts/{alert_id}/acknowledge", response_model=AlertRead)
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = get_or_404(db, Alert, alert_id)
    return crud.acknowledge_alert(db, alert)
