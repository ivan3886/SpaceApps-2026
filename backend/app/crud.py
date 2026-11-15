from datetime import datetime, timezone
from typing import TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import Base


ModelType = TypeVar("ModelType", bound=Base)


def create(db: Session, obj: ModelType) -> ModelType:
    try:
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj
    except Exception:
        db.rollback()
        raise


def get_by_id(db: Session, model: type[ModelType], record_id: int) -> ModelType | None:
    return db.get(model, record_id)


def list_records(
    db: Session,
    model: type[ModelType],
    *,
    subject_code: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[ModelType]:
    statement = select(model)

    if subject_code is not None and hasattr(model, "subject_code"):
        statement = statement.where(model.subject_code == subject_code)

    if hasattr(model, "created_at"):
        statement = statement.order_by(model.created_at.desc())
    elif hasattr(model, "reported_at"):
        statement = statement.order_by(model.reported_at.desc())
    elif hasattr(model, "collected_at"):
        statement = statement.order_by(model.collected_at.desc())

    statement = statement.offset(offset).limit(limit)
    return list(db.scalars(statement).all())


def update_fields(db: Session, record: ModelType, changes: dict) -> ModelType:
    try:
        for field, value in changes.items():
            setattr(record, field, value)
        db.commit()
        db.refresh(record)
        return record
    except Exception:
        db.rollback()
        raise


def acknowledge_alert(db: Session, alert) -> object:
    if alert.acknowledged_at is None:
        alert.acknowledged_at = datetime.now(timezone.utc)
    return update_fields(db, alert, {})