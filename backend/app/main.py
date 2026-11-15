from fastapi import Depends, FastAPI, HTTPException, Query, status
from sqlalchemy.orm import Session

from app import crud
from app.db import get_db
from app.enums import AlertLevel, AlertDeliveryStatus
from app.models import Alert, ContextNote, Recommendation, Sample, SymptomReport
from app.schemas import (
    AlertCreate,
    AlertRead,
    AlertUpdate,
    ContextNoteCreate,
    ContextNoteRead,
    RecommendationCreate,
    RecommendationRead,
    RecommendationUpdate,
    SampleCreate,
    SampleRead,
    SampleUpdate,
    SymptomCreate,
    SymptomRead,
)


app = FastAPI(
    title="Orbit Health API",
    version="0.1.0",
    description="API de prototipo para registros de salud y muestras.",
)


def get_or_404(db: Session, model, record_id: int):
    record = crud.get_by_id(db, model, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return record


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post(
    "/samples",
    response_model=SampleRead,
    status_code=status.HTTP_201_CREATED,
)
def create_sample(payload: SampleCreate, db: Session = Depends(get_db)):
    sample = Sample(**payload.model_dump())
    try:
        return crud.create(db, sample)
    except Exception as exc:
        # En producción, registrar el error internamente sin exponer detalles.
        raise HTTPException(status_code=409, detail="No se pudo crear la muestra") from exc


@app.get("/samples", response_model=list[SampleRead])
def list_samples(
    subject_code: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return crud.list_records(
        db, Sample, subject_code=subject_code, limit=limit, offset=offset
    )


@app.get("/samples/{sample_id}", response_model=SampleRead)
def get_sample(sample_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, Sample, sample_id)


@app.patch("/samples/{sample_id}", response_model=SampleRead)
def update_sample(
    sample_id: int,
    payload: SampleUpdate,
    db: Session = Depends(get_db),
):
    sample = get_or_404(db, Sample, sample_id)
    changes = payload.model_dump(exclude_unset=True)
    return crud.update_fields(db, sample, changes)


@app.post(
    "/context-notes",
    response_model=ContextNoteRead,
    status_code=status.HTTP_201_CREATED,
)
def create_context_note(
    payload: ContextNoteCreate,
    db: Session = Depends(get_db),
):
    get_or_404(db, Sample, payload.sample_id)
    return crud.create(db, ContextNote(**payload.model_dump()))


@app.get("/samples/{sample_id}/context-notes", response_model=list[ContextNoteRead])
def list_context_notes(sample_id: int, db: Session = Depends(get_db)):
    get_or_404(db, Sample, sample_id)
    return crud.list_records(db, ContextNote, limit=500, offset=0)


@app.post(
    "/symptoms",
    response_model=SymptomRead,
    status_code=status.HTTP_201_CREATED,
)
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
    return crud.list_records(
        db, SymptomReport, subject_code=subject_code, limit=limit, offset=offset
    )


@app.post(
    "/recommendations",
    response_model=RecommendationRead,
    status_code=status.HTTP_201_CREATED,
)
def create_recommendation(
    payload: RecommendationCreate,
    db: Session = Depends(get_db),
):
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
    return crud.list_records(
        db, Recommendation, subject_code=subject_code, limit=limit, offset=offset
    )


@app.patch(
    "/recommendations/{recommendation_id}",
    response_model=RecommendationRead,
)
def update_recommendation(
    recommendation_id: int,
    payload: RecommendationUpdate,
    db: Session = Depends(get_db),
):
    record = get_or_404(db, Recommendation, recommendation_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("sample_id") is not None:
        get_or_404(db, Sample, changes["sample_id"])
    return crud.update_fields(db, record, changes)


@app.post(
    "/alerts",
    response_model=AlertRead,
    status_code=status.HTTP_201_CREATED,
)
def create_alert(payload: AlertCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    for field, model in (
        ("sample_id", Sample),
        ("symptom_report_id", SymptomReport),
        ("recommendation_id", Recommendation),
    ):
        if data[field] is not None:
            get_or_404(db, model, data[field])

    alert = crud.create(db, Alert(**data))

    # Esto solo marca el estado para el sistema de comunicaciones.
    # No implementa el envío real de alertas a Tierra.
    if alert.level == AlertLevel.EMERGENCY:
        alert.delivery_status = AlertDeliveryStatus.PENDING
        alert = crud.update_fields(db, alert, {"delivery_status": alert.delivery_status})

    return alert


@app.get("/alerts", response_model=list[AlertRead])
def list_alerts(
    subject_code: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return crud.list_records(
        db, Alert, subject_code=subject_code, limit=limit, offset=offset
    )


@app.patch("/alerts/{alert_id}", response_model=AlertRead)
def update_alert(
    alert_id: int,
    payload: AlertUpdate,
    db: Session = Depends(get_db),
):
    alert = get_or_404(db, Alert, alert_id)
    return crud.update_fields(db, alert, payload.model_dump(exclude_unset=True))


@app.post("/alerts/{alert_id}/acknowledge", response_model=AlertRead)
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = get_or_404(db, Alert, alert_id)
    return crud.acknowledge_alert(db, alert)