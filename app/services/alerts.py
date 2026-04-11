from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from app.orm_models.price_alert import PriceAlertDB
from app.schemas.alerts import AlertStatus, PriceAlertCreate


def create_alert(db: Session, user_id: str, payload: PriceAlertCreate) -> PriceAlertDB:
    existing = (
        db.query(PriceAlertDB)
        .filter(
            PriceAlertDB.userID == user_id,
            PriceAlertDB.symbol == payload.symbol,
            PriceAlertDB.condition == payload.condition.value,
            PriceAlertDB.targetPrice == payload.targetPrice,
        )
        .first()
    )
    if existing:
        raise ValueError("An identical alert already exists")

    alert = PriceAlertDB(
        userID=user_id,
        symbol=payload.symbol,
        condition=payload.condition.value,
        targetPrice=payload.targetPrice,
        isActive=True,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def list_alerts(db: Session, user_id: str) -> List[PriceAlertDB]:
    return (
        db.query(PriceAlertDB)
        .filter(PriceAlertDB.userID == user_id)
        .order_by(PriceAlertDB.createdAt.desc())
        .all()
    )


def list_alerts_for_symbols(db: Session, user_id: str, symbols: list[str]) -> List[PriceAlertDB]:
    if not symbols:
        return []

    return (
        db.query(PriceAlertDB)
        .filter(
            PriceAlertDB.userID == user_id,
            PriceAlertDB.symbol.in_(symbols),
        )
        .all()
    )


def list_alerts_by_status(db: Session, user_id: str, status: Optional[AlertStatus]) -> List[PriceAlertDB]:
    query = db.query(PriceAlertDB).filter(PriceAlertDB.userID == user_id)

    if status == AlertStatus.active:
        query = query.filter(PriceAlertDB.isActive.is_(True))
    elif status == AlertStatus.triggered:
        query = query.filter(
            PriceAlertDB.isActive.is_(False),
            PriceAlertDB.triggeredAt.is_not(None),
        )

    return query.order_by(PriceAlertDB.createdAt.desc()).all()


def update_alert(
    db: Session,
    user_id: str,
    alert_id: str,
    *,
    is_active: Optional[bool],
    reset_triggered: bool,
) -> Optional[PriceAlertDB]:
    alert = (
        db.query(PriceAlertDB)
        .filter(
            PriceAlertDB.id == alert_id,
            PriceAlertDB.userID == user_id,
        )
        .first()
    )
    if not alert:
        return None

    if is_active is not None:
        alert.isActive = is_active

    if reset_triggered:
        alert.isActive = True
        alert.triggeredAt = None

    alert.updatedAt = datetime.utcnow()
    db.commit()
    db.refresh(alert)
    return alert


def delete_alert(db: Session, user_id: str, alert_id: str) -> bool:
    alert = (
        db.query(PriceAlertDB)
        .filter(
            PriceAlertDB.id == alert_id,
            PriceAlertDB.userID == user_id,
        )
        .first()
    )
    if not alert:
        return False

    db.delete(alert)
    db.commit()
    return True


def evaluate_alerts_for_quote(
    db: Session,
    user_id: str,
    symbol: str,
    price: float,
) -> List[PriceAlertDB]:
    now = datetime.utcnow()
    alerts = (
        db.query(PriceAlertDB)
        .filter(
            PriceAlertDB.userID == user_id,
            PriceAlertDB.symbol == symbol,
            PriceAlertDB.isActive.is_(True),
        )
        .all()
    )

    triggered: List[PriceAlertDB] = []
    for alert in alerts:
        alert.lastEvaluatedAt = now

        if alert.condition == "above" and price >= alert.targetPrice:
            alert.isActive = False
            alert.triggeredAt = now
            triggered.append(alert)
        elif alert.condition == "below" and price <= alert.targetPrice:
            alert.isActive = False
            alert.triggeredAt = now
            triggered.append(alert)

    if alerts:
        db.commit()
        for alert in alerts:
            db.refresh(alert)

    return triggered
